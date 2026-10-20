// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for a small GitHub repository answered in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub, parseGitHubUrl, type Fetch } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { replay } from '../src/core/replay.ts';
import { scan } from '../src/core/scan.ts';
import { openDirectory } from '../src/local.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);

test('malformed front matter → the directory name, no description and a warning', () => {
  const parsed = parseSkill(readFileSync(join(FIXTURE, '.agents/skills/release-checklist/SKILL.md'), 'utf8'));
  assert.equal(parsed.name, undefined);
  assert.equal(parsed.description, '');
  assert.equal(
    parsed.warning,
    'malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  );
});

test('scan prints the repository, then each skill with its first sentence and pinned link', () => {
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
      '  also in .github/skills/commits/SKILL.md',
    ].join('\n'),
  );
  assert.equal(example.stderr, '');
});

test('./fixture: every skill, sorted by name, linked to its file, with a warning for each unreadable front matter', () => {
  const root = pathToFileURL(FIXTURE).href;
  assert.equal(fixture.code, 0);
  assert.equal(
    fixture.stdout,
    [
      'fixture · 6 skills',
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      '  also in .github/skills/commits/SKILL.md',
      'no-description',
      `  ${root}/.github/skills/no-description/SKILL.md`,
      'no-name — Named after its directory.',
      `  ${root}/.claude/skills/no-name/SKILL.md`,
      'plain-notes',
      `  ${root}/.agents/skills/plain-notes/SKILL.md`,
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
    ].join('\n'),
  );
  assert.deepEqual(fixture.stderr.split('\n'), [
    'warning: .agents/skills/plain-notes/SKILL.md: no front matter; using the directory name',
    'warning: .agents/skills/release-checklist/SKILL.md: malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  ]);
});

test('the same name in several skill roots → one skill, linked in the first root, the others as copies', () => {
  // .claude/skills comes before .github/skills; the copy on GitHub is never read.
  for (const { stdout } of [fixture, example]) {
    assert.equal(stdout.match(/^commits — /gm)?.length, 1);
    assert.match(stdout, /\/\.claude\/skills\/commits\/SKILL\.md\n {2}also in \.github\/skills\/commits\/SKILL\.md/);
  }
});

test('only <name>/SKILL.md in a skill root at the repository root is a skill; any other file is ignored silently', () => {
  // ./fixture: at the root, under docs/, nested, directly in a root, skill.md, a skill root
  // inside a subdirectory, and agent/skills.
  for (const { stdout, stderr } of [fixture, example]) {
    assert.doesNotMatch(stdout, /not-a-skill/);
    assert.doesNotMatch(stderr, /not-a-skill|examples|docs\/|packages\/|agent\/skills|(?:^|\s)SKILL\.md/);
  }
  assert.equal(fixture.stderr.split('\n').length, 2); // the two unreadable front matters, nothing else
});

test('the CLI prints the result at once and stores nothing', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${fixture.stdout}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('unreachable repository → a clear message, exit code 1', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  // What GitHub answers for a repository that does not exist.
  const notFound = replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/no-such-repository', { fetch: notFound }), {
    message: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });

  const offline = await atlas(['scan', 'https://github.com/JetBrains/not-answered']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered$/);
});

test('rate limit → a message that asks for GITHUB_TOKEN', async () => {
  const limited = replay({
    'https://api.github.com/repos/JetBrains/MPS': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1. (But here is the good news: ...)' },
    },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});

// Live GitHub, so only with GITHUB_TOKEN: without one, the rate limit allows a scan or two an hour.
test('intellij-community is scanned through the GitHub API in under 5 s', { skip: !process.env.GITHUB_TOKEN && 'needs GITHUB_TOKEN' }, () => {
  const started = performance.now();
  const scanned = spawnSync(process.execPath, [CLI, 'scan', 'https://github.com/JetBrains/intellij-community'], { encoding: 'utf8' });
  const seconds = (performance.now() - started) / 1000;
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.match(scanned.stdout, /^JetBrains\/intellij-community · \d+ skills\n/);
  assert.ok(seconds < 5, `took ${seconds.toFixed(1)} s`);
});

test('owner/repo is a GitHub repository; an existing directory of that name wins', async (t) => {
  assert.deepEqual(await atlas(['scan', 'JetBrains/example']), example);
  assert.equal(parseGitHubUrl('./fixture'), undefined);

  // A directory that also reads as owner/repo.
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, 'JetBrains/example/.claude/skills/local'), { recursive: true });
  writeFileSync(join(cwd, 'JetBrains/example/.claude/skills/local/SKILL.md'), '---\nname: local\ndescription: On disk.\n---\n');
  const scanned = spawnSync(process.execPath, [CLI, 'scan', 'JetBrains/example'], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.match(scanned.stdout, /^example · 1 skill\nlocal — On disk\.\n {2}file:\/\//);
});

test('a listed SKILL.md that cannot be read → a warning that says why, and the scan goes on', async (t) => {
  const API = 'https://api.github.com';
  const RAW = `https://raw.githubusercontent.com/JetBrains/stale/${EXAMPLE_COMMIT}`;
  const skill = { status: 200, body: '---\nname: kept\ndescription: Still there.\n---\n' };
  const gone = { status: 404, body: '404: Not Found' };
  const stale = replay({
    [`${API}/repos/JetBrains/stale`]: { status: 200, body: { full_name: 'JetBrains/stale', default_branch: 'main' } },
    [`${API}/repos/JetBrains/stale/commits/main`]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
    [`${API}/search/code?q=filename:SKILL.md+repo:JetBrains/stale&per_page=100&page=1`]: {
      status: 200,
      body: { total_count: 2, items: [{ path: '.agents/skills/kept/SKILL.md' }, { path: '.agents/skills/moved/SKILL.md' }] },
    },
    [`${API}/repos/JetBrains/stale/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: ['.agents/skills/kept/SKILL.md', '.agents/skills/moved/SKILL.md'].map((path) => ({ path, mode: '100644', type: 'blob', sha: path })) },
    },
    [`${RAW}/.agents/skills/kept/SKILL.md`]: skill,
    [`${RAW}/.agents/skills/moved/SKILL.md`]: gone,
  });
  const commit = EXAMPLE_COMMIT.slice(0, 7);

  // With a token, the paths come from code search, whose index can be older than the scanned commit.
  const searched = await scan(await openGitHub('JetBrains/stale', { fetch: stale, token: 'test' }));
  assert.deepEqual(searched.skills.map((s) => s.name), ['kept']);
  assert.deepEqual(searched.warnings, [
    `.agents/skills/moved/SKILL.md: GitHub code search lists it, but it is not in commit ${commit}, the one scanned: the search index lags behind the default branch, so the file was probably moved or deleted since; skipped`,
  ]);

  // Without one, from the tree of the scanned commit itself.
  const listed = await scan(await openGitHub('JetBrains/stale', { fetch: stale }));
  assert.deepEqual(listed.skills.map((s) => s.name), ['kept']);
  assert.deepEqual(listed.warnings, [`.agents/skills/moved/SKILL.md: in the tree of commit ${commit}, but GitHub answered 404 when it was read; skipped`]);

  // A local directory: a file deleted after the directory was listed.
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const name of ['kept', 'moved']) {
    mkdirSync(join(cwd, `.agents/skills/${name}`), { recursive: true });
    writeFileSync(join(cwd, `.agents/skills/${name}/SKILL.md`), skill.body);
  }
  const directory = await openDirectory(cwd);
  rmSync(join(cwd, '.agents/skills/moved/SKILL.md'));
  const local = await scan(directory);
  assert.deepEqual(local.skills.map((s) => s.name), ['kept']);
  assert.deepEqual(local.warnings, ['.agents/skills/moved/SKILL.md: deleted since the directory was listed; skipped']);
});

test('with GITHUB_TOKEN, a private repository: its SKILL.md is read with the token', async () => {
  const API = 'https://api.github.com';
  const file = `https://raw.githubusercontent.com/JetBrains/private/${EXAMPLE_COMMIT}/.agents/skills/secret/SKILL.md`;
  const recorded = replay({
    [`${API}/repos/JetBrains/private`]: { status: 200, body: { full_name: 'JetBrains/private', default_branch: 'main' } },
    [`${API}/repos/JetBrains/private/commits/main`]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
    [`${API}/search/code?q=filename:SKILL.md+repo:JetBrains/private&per_page=100&page=1`]: {
      status: 200,
      body: { total_count: 1, items: [{ path: '.agents/skills/secret/SKILL.md' }] },
    },
  });
  // As raw.githubusercontent.com does for a private repository: 404 without the token.
  const github: Fetch = async (url, init) =>
    url !== file
      ? recorded(url, init)
      : init?.headers?.Authorization === 'Bearer test'
        ? new Response('---\nname: secret\ndescription: Private.\n---\n')
        : new Response('404: Not Found', { status: 404 });

  const result = await scan(await openGitHub('JetBrains/private', { fetch: github, token: 'test' }));
  assert.deepEqual(result.skills.map((s) => s.name), ['secret']);
  assert.deepEqual(result.warnings, []);
});
