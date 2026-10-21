// The decisions in spec/cluster.md: the prompt, the answer read as groups, the levels down to fewer
// than 3; the command, the server's POST /api/cluster, the model run by src/claude.ts, and
// scripts/claude-docker.sh with stand-ins for Central and Docker on PATH.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { createBrowserBackend } from '../src/browser.ts';
import { CLAUDE_DOCKER, claude } from '../src/claude.ts';
import { clusterPrompt, clusterSkills, clusterTree, parseGroups, type Ask } from '../src/core/cluster.ts';
import { AtlasError } from '../src/core/errors.ts';
import { createWebServer, listen } from '../src/web.ts';
import { atlas, CLI, FIXTURE, FIXTURE_CLUSTERS, open, organization, promptNames, recordedModel } from './helpers.ts';

const skill = (name: string, description = '') => ({ id: `repo:.claude/skills/${name}/SKILL.md`, name, description });
const five = ['a', 'b', 'c', 'd', 'e'].map((name) => skill(name, `Does ${name}.`));
const answer = (...groups: [string, number[]][]) => JSON.stringify({ groups: groups.map(([title, skills]) => ({ title, skills })) });
const titles = (groups: { title: string; skills: string[] }[]) => groups.map(({ title, skills }) => [title, skills.map((id) => id.split('/')[2])]);

/** A temporary directory, removed after the test. */
function directory(t: { after(fn: () => void): void }, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** An executable shell script. */
function script(path: string, body: string) {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

test('the prompt: what to answer, then the skills numbered, a line each, the description on one line', () => {
  const prompt = clusterPrompt([skill('commits', 'Write commit\n  messages. Use for every commit.'), skill('no-description'), skill('code-style', ' Style. ')]);
  assert.equal(
    prompt,
    [
      'Group these 3 agent skills by what they are for: 2 to 5 groups, each skill in exactly one group.',
      'Give each group a short title, 1 to 4 words, that tells it from the others.',
      'Answer with JSON only, no other text: {"groups": [{"title": "<title>", "skills": [<the numbers of its skills>]}]}',
      '',
      '1. commits — Write commit messages. Use for every commit.',
      '2. no-description',
      '3. code-style — Style.',
    ].join('\n'),
  );
  // Only names and descriptions: not the SKILL.md.
  assert.equal(promptNames(prompt), 'commits, no-description, code-style');
});

test('the answer: its JSON, in a code block or after some text too', () => {
  const json = answer(['First', [1, 2, 3]], ['Second', [4, 5]]);
  const expected = [['First', ['a', 'b', 'c']], ['Second', ['d', 'e']]];
  assert.deepEqual(titles(parseGroups(json, five)), expected);
  assert.deepEqual(titles(parseGroups(`\`\`\`json\n${json}\n\`\`\``, five)), expected);
  assert.deepEqual(titles(parseGroups(`Here are the groups:\n${json}\nDone.`, five)), expected);
});

test('the answer: out of range ignored, a skill in two groups in the first, in none in Other, empty groups dropped', () => {
  const groups = parseGroups(answer(['Tests', [2, 9, 0, 1.5, 'x' as never]], ['Build', [2, 1]], ['Empty', []], ['Docs', [3]]), five);
  assert.deepEqual(titles(groups), [['Other', ['d', 'e']], ['Build', ['a']], ['Docs', ['c']], ['Tests', ['b']]]);
});

test('the answer: a skill twice in the same group, once', () => {
  const groups = parseGroups(answer(['Tests', [1, 1, 2, 2]], ['Build', [3, 4, 5, 3]]), five);
  assert.deepEqual(titles(groups), [['Build', ['c', 'd', 'e']], ['Tests', ['a', 'b']]]);
});

test('the answer: the most skills first, then by title; in a group, the skills in their order; no title, Group N', () => {
  const groups = parseGroups(JSON.stringify({ groups: [{ title: 'Zeta', skills: [5, 4] }, { skills: [3] }, { title: ' Alpha ', skills: [2, 1] }] }), five);
  assert.deepEqual(titles(groups), [['Alpha', ['a', 'b']], ['Zeta', ['d', 'e']], ['Group 2', ['c']]]);
});

test('an answer that is not groups: a clear message, with its start', () => {
  assert.throws(() => parseGroups('I cannot help with that.', five), new AtlasError("The model's answer is not groups: I cannot help with that."));
  assert.throws(() => parseGroups('{"clusters": []}', five), /not groups: \{"clusters": \[\]\}/);
  assert.throws(() => parseGroups('', five), /not groups: \(empty\)/);
  assert.throws(() => parseGroups(`{ ${'x'.repeat(200)}`, five), (error: Error) => error.message.endsWith('…') && error.message.length < 200);
});

test('one level: fewer than 3 skills, the model not asked; all in one group, an error', async () => {
  const model = recordedModel({});
  await assert.rejects(clusterSkills(five.slice(0, 2), model), new AtlasError('Fewer than 3 skills: nothing to cluster'));
  assert.deepEqual(model.asked, []);
  const one: Ask = async () => answer(['All', [1, 2, 3, 4, 5]]);
  await assert.rejects(clusterSkills(five, one), new AtlasError('The model put all 5 skills in one group'));
});

test('every level: each group of 3 or more clustered again, down to fewer than 3', async () => {
  const model = recordedModel({
    'a, b, c, d, e': answer(['Big', [1, 2, 3, 4]], ['Small', [5]]),
    'a, b, c, d': answer(['Left', [1, 2, 3]], ['Right', [4]]),
    'a, b, c': answer(['One', [1]], ['Two', [2, 3]]),
  });
  const { groups, warnings } = await clusterTree(five, model);
  assert.deepEqual(model.asked, ['a, b, c, d, e', 'a, b, c, d', 'a, b, c']);
  assert.deepEqual(warnings, []);
  const shape = (trees: typeof groups): unknown => trees.map((tree) => [tree.title, tree.skills.map((s) => s.name).join(''), shape(tree.groups)]);
  assert.deepEqual(shape(groups), [
    ['Big', 'abcd', [['Left', 'abc', [['Two', 'bc', []], ['One', 'a', []]]], ['Right', 'd', []]]],
    ['Small', 'e', []],
  ]);
});

test('every level: a failure below the first, that group not clustered and a warning with its path; the first, the error', async () => {
  const model = recordedModel({
    'a, b, c, d, e': answer(['Big', [1, 2, 3, 4]], ['Small', [5]]),
    'a, b, c, d': answer(['Left', [1, 2, 3]], ['Right', [4]]),
    'a, b, c': 'no idea',
  });
  const { groups, warnings } = await clusterTree(five, model);
  assert.deepEqual(groups[0].groups[0].groups, []);
  assert.deepEqual(warnings, ["Big › Left: not clustered: The model's answer is not groups: no idea"]);
  await assert.rejects(clusterTree(five, async () => 'no idea'), /not groups/);
  // A bug, not the model: not hidden in a warning.
  const broken = recordedModel({ 'a, b, c, d, e': answer(['Big', [1, 2, 3, 4]], ['Small', [5]]) });
  await assert.rejects(clusterTree(five, broken), /not recorded: a, b, c, d/);
  // Fewer than 3: nothing to ask.
  assert.deepEqual(await clusterTree(five.slice(0, 2), broken), { groups: [], warnings: [] });
});

test('cluster ./fixture: the groups, each with its groups or its skills, two spaces deeper a level', async () => {
  const result = await atlas(['cluster', FIXTURE]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      'fixture · 6 skills · 2 groups',
      'Code and releases · 3 skills',
      '  Commits and releases · 2 skills',
      '    commits — Write commit messages the way this repository does.',
      '    release-checklist',
      '  Code style · 1 skill',
      "    code-style — Follow the project's code style.",
      'Notes · 3 skills',
      '  Incomplete front matter · 2 skills',
      '    no-description',
      '    no-name — Named after its directory.',
      '  No front matter · 1 skill',
      '    plain-notes',
    ].join('\n'),
  );
  // The scan's warnings, on stderr, as scan prints them.
  assert.match(result.stderr, /^warning: \.agents\/skills\/plain-notes\/SKILL\.md: no front matter/);
});

test('cluster: a level the model fails, a warning on stderr; the first, the message and exit code 1', async () => {
  const notes = { ...FIXTURE_CLUSTERS, 'no-description, no-name, plain-notes': 'Sorry.' };
  const partly = await atlas(['cluster', FIXTURE], recordedModel(notes));
  assert.equal(partly.code, 0);
  assert.match(partly.stdout, /^Notes · 3 skills\n {2}no-description\n {2}no-name — Named after its directory\.\n {2}plain-notes$/m);
  assert.match(partly.stderr, /^warning: Notes: not clustered: The model's answer is not groups: Sorry\.$/m);

  const failing = await atlas(['cluster', FIXTURE], async () => {
    throw new AtlasError('The model failed (haiku, exit code 1): JetBrains Central is not installed: no central or jbcentral on PATH');
  });
  assert.equal(failing.code, 1);
  assert.equal(failing.stdout, '');
  assert.equal(failing.stderr, 'The model failed (haiku, exit code 1): JetBrains Central is not installed: no central or jbcentral on PATH');
});

test('cluster: fewer than 3 skills, listed and not clustered, the model not asked; the usage; only in the command line', async () => {
  const model = recordedModel({});
  const example = await atlas(['cluster', 'JetBrains/example'], model);
  assert.equal(example.code, 0, example.stderr);
  assert.equal(example.stdout, 'JetBrains/example · 1 skill · fewer than 3, not clustered\ncommits — Write commit messages the way this repository does.');
  assert.deepEqual(model.asked, []);

  assert.deepEqual(await atlas(['cluster']), { code: 1, stdout: '', stderr: 'Usage: skill-atlas cluster <GitHub URL | owner/repo | directory>' });
  assert.match((await atlas(['help'])).stdout, /^ {2}cluster <GitHub URL \| owner\/repo \| directory> {2}the skills in groups, by a model/m);
  const browser = createBrowserBackend({ fetch: async () => new Response('{}', { status: 404 }) });
  assert.equal(await browser.run('skill-atlas cluster JetBrains/example'), 'cluster runs only in the command line');
});

test('the real command: the model SKILL_ATLAS_CLAUDE runs, here one that answers from the recording', () => {
  const model = join(import.meta.dirname, 'recorded-model.ts');
  const result = spawnSync(process.execPath, [CLI, 'cluster', FIXTURE], { encoding: 'utf8', env: { ...process.env, SKILL_ATLAS_CLAUDE: model } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^fixture · 6 skills · 2 groups\nCode and releases · 3 skills\n {2}Commits and releases · 2 skills\n/);
  const failing = spawnSync(process.execPath, [CLI, 'cluster', FIXTURE], { encoding: 'utf8', env: { ...process.env, SKILL_ATLAS_CLAUDE: '/no/such/model' } });
  assert.equal(failing.status, 1);
  assert.equal(failing.stderr, 'Cannot run the model, /no/such/model: spawn /no/such/model ENOENT\n');
});

const server = createWebServer({ open, organization, cluster: recordedModel() });
const base = await listen(server, 0);
after(() => server.close());

async function post(body: unknown, url = base) {
  const response = await fetch(`${url}/api/cluster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as { groups: { title: string; skills: string[] }[]; error?: string } };
}

type Sent = { id: string; name: string; description: string };
const fixtureSkills = async (): Promise<Sent[]> => {
  const scanned = (await (await fetch(`${base}/api/scan?repo=${encodeURIComponent(FIXTURE)}`)).json()) as { skills: Sent[] };
  return scanned.skills.map(({ id, name, description }) => ({ id, name, description }));
};

test('POST /api/cluster: the skills sent, one level, each group the ids of its skills', async () => {
  const skills = await fixtureSkills();
  const { status, body } = await post({ skills });
  assert.equal(status, 200);
  const id = (name: string) => skills.find((skill) => skill.name === name)!.id;
  assert.deepEqual(body, {
    groups: [
      { title: 'Code and releases', skills: [id('code-style'), id('commits'), id('release-checklist')] },
      { title: 'Notes', skills: [id('no-description'), id('no-name'), id('plain-notes')] },
    ],
  });
  // A group of them: the next level.
  const deeper = await post({ skills: skills.filter((skill) => ['code-style', 'commits', 'release-checklist'].includes(skill.name)) });
  assert.deepEqual(deeper.body.groups.map((group) => group.title), ['Commits and releases', 'Code style']);
});

test('POST /api/cluster: a clear message → 400 { error }; another method, 405', async () => {
  const skills = await fixtureSkills();
  const message = 'Send { skills: [{ id, name, description }] } as JSON';
  assert.deepEqual(await post('not json'), { status: 400, body: { error: message } });
  assert.deepEqual(await post({ skills: [{ id: 'x', name: 'x' }] }), { status: 400, body: { error: message } });
  assert.deepEqual(await post({}), { status: 400, body: { error: message } });
  assert.deepEqual(await post({ skills: skills.slice(0, 2) }), { status: 400, body: { error: 'Fewer than 3 skills: nothing to cluster' } });
  assert.deepEqual(await post({ skills: [skills[0], skills[0], skills[1]] }), { status: 400, body: { error: 'Each skill once: an id is repeated' } });
  const big = 'x'.repeat(5 * 1024 * 1024);
  assert.deepEqual(await post({ skills: [{ id: 'x', name: 'x', description: big }] }), { status: 400, body: { error: 'Too many skills to cluster at once' } });
  const get = await fetch(`${base}/api/cluster`);
  assert.equal(get.status, 405);
  // Not JSON, as another site's page could send without asking: 415, the model not asked.
  const text = await fetch(`${base}/api/cluster`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ skills }) });
  assert.deepEqual([text.status, await text.json()], [415, { error: 'Send JSON: Content-Type: application/json' }]);

  const failing = createWebServer({ open, organization, cluster: async () => { throw new AtlasError('The model did not answer in 180 s'); } });
  const failingUrl = await listen(failing, 0);
  const unset = createWebServer({ open, organization });
  const unsetUrl = await listen(unset, 0);
  after(() => (failing.close(), unset.close()));
  assert.deepEqual(await post({ skills }, failingUrl), { status: 400, body: { error: 'The model did not answer in 180 s' } });
  assert.deepEqual(await post({ skills }, unsetUrl), { status: 400, body: { error: 'Clustering is not set up on this server' } });
});

test('POST /api/cluster: the page goes away → the model is stopped', async () => {
  let stopped!: (aborted: boolean) => void;
  const aborted = new Promise<boolean>((resolve) => (stopped = resolve));
  const waiting = createWebServer({
    open,
    organization,
    cluster: (_prompt, signal) => new Promise((_resolve, reject) => signal?.addEventListener('abort', () => (stopped(true), reject(new AtlasError('stopped'))))),
  });
  const url = await listen(waiting, 0);
  after(() => waiting.close());
  const page = new AbortController();
  const request = fetch(`${url}/api/cluster`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skills: five }), signal: page.signal }).catch(() => undefined);
  setTimeout(() => page.abort(), 100);
  await request;
  assert.equal(await aborted, true);
});

test('the model: SKILL_ATLAS_CLAUDE, the prompt on stdin, the answer on stdout; SKILL_ATLAS_MODEL, haiku by default', async (t) => {
  const dir = directory(t, 'skill-atlas-claude-');
  const fake = join(dir, 'claude');
  script(fake, 'printf "model=%s prompt=" "$SKILL_ATLAS_MODEL"; cat');
  assert.equal(await claude({ PATH: process.env.PATH, SKILL_ATLAS_CLAUDE: fake })('the prompt'), 'model=haiku prompt=the prompt');
  assert.equal(await claude({ PATH: process.env.PATH, SKILL_ATLAS_CLAUDE: fake, SKILL_ATLAS_MODEL: 'sonnet' })('p'), 'model=sonnet prompt=p');
  // Without SKILL_ATLAS_CLAUDE: claude -p in Docker.
  assert.equal(CLAUDE_DOCKER, join(import.meta.dirname, '..', 'scripts', 'claude-docker.sh'));
});

test('the model fails: the exit code and the end of its stderr; no such command; stopped', async (t) => {
  const dir = directory(t, 'skill-atlas-claude-');
  const failing = join(dir, 'failing');
  script(failing, 'echo one >&2; echo two >&2; echo three >&2; echo "JetBrains Central is not installed" >&2; exit 3');
  await assert.rejects(
    claude({ SKILL_ATLAS_CLAUDE: failing })('p'),
    new AtlasError('The model failed (haiku, exit code 3): two\nthree\nJetBrains Central is not installed'),
  );
  await assert.rejects(
    claude({ SKILL_ATLAS_CLAUDE: join(dir, 'missing') })('p'),
    (error: Error) => error instanceof AtlasError && /^Cannot run the model, .*missing: spawn .* ENOENT$/.test(error.message),
  );
  const slow = join(dir, 'slow');
  script(slow, 'exec sleep 5');
  const stop = new AbortController();
  setTimeout(() => stop.abort(), 100);
  await assert.rejects(claude({ SKILL_ATLAS_CLAUDE: slow })('p', stop.signal), new AtlasError('Clustering stopped'));
});

test('scripts/claude-docker.sh: the key from Central, claude -p in an isolated container, the prompt through', (t) => {
  const dir = directory(t, 'skill-atlas-docker-');
  const bin = join(dir, 'bin');
  const home = join(dir, 'home');
  mkdirSync(bin);
  mkdirSync(join(home, '.jetbrains-central'), { recursive: true });
  // Central: the key; Docker: the image there, and what it was run with, a line each, then stdin.
  script(join(bin, 'jbcentral'), '[ "$*" = "proxy start --ensure-updated --return-key" ] && echo the-key');
  script(join(bin, 'docker'), `[ "$1" = image ] && exit 0\nfor arg in "$@"; do echo "$arg"; done > "${dir}/args"\ncat`);
  const PATH = `${bin}:${join(process.execPath, '..')}:/usr/bin:/bin`;
  const run = (env: Record<string, string> = {}) =>
    spawnSync(CLAUDE_DOCKER, [], { input: 'the prompt', encoding: 'utf8', env: { PATH, HOME: home, ...env } });

  // No config: Central's default port.
  let result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'the prompt');
  const args = () => readFileSync(join(dir, 'args'), 'utf8').trimEnd().split('\n');
  assert.deepEqual(args(), [
    'run', '--rm', '-i',
    '--add-host=host.docker.internal:host-gateway',
    '--read-only', '--tmpfs', '/tmp', '--tmpfs', '/home/node',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '-e', 'ANTHROPIC_API_KEY=the-key',
    '-e', 'ANTHROPIC_BASE_URL=http://host.docker.internal:19516/wire/the-key/claude-code/anthropic',
    'skill-atlas-claude',
    'claude', '-p', '--bare', '--model', 'haiku', '--tools', '', '--no-session-persistence',
  ]);
  // No files of the host in it.
  assert.ok(!args().some((arg) => /^(-v|--volume|--mount)$/.test(arg)));

  // The port in Central's config; the model from SKILL_ATLAS_MODEL.
  writeFileSync(join(home, '.jetbrains-central', 'config.json'), JSON.stringify({ proxy_port: 20001 }));
  result = run({ SKILL_ATLAS_MODEL: 'sonnet' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(args().includes('ANTHROPIC_BASE_URL=http://host.docker.internal:20001/wire/the-key/claude-code/anthropic'));
  assert.deepEqual(args().slice(-6), ['--bare', '--model', 'sonnet', '--tools', '', '--no-session-persistence']);

  // No Central: a clear message, exit code 1.
  rmSync(join(bin, 'jbcentral'));
  result = run();
  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'JetBrains Central is not installed: no central or jbcentral on PATH\n');
});
