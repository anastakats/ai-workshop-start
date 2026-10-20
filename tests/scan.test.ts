// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for a small GitHub repository answered in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub, parseGitHubUrl, type Fetch } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { lastUpdated } from '../src/core/model.ts';
import { replay, type Recorded } from '../src/core/replay.ts';
import { run } from '../src/commands.ts';
import { scan } from '../src/core/scan.ts';
import { openDirectory } from '../src/local.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

/** A day, as the CLI prints it, whatever it is: this checkout's commits are not the same everywhere. */
const anyDay = (text: string) => text.replace(/\d{4}-\d{2}-\d{2}/g, '<day>');

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
      'JetBrains/example · 1 skill · last updated 2026-10-12',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
      '  also in .github/skills/commits/SKILL.md',
      '  updated 2026-10-12',
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
      'fixture · 6 skills · last updated 2026-10-14',
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      '  updated 2026-10-02',
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      '  also in .github/skills/commits/SKILL.md',
      '  updated 2026-10-14',
      'no-description',
      `  ${root}/.github/skills/no-description/SKILL.md`,
      '  updated 2026-07-30',
      'no-name — Named after its directory.',
      `  ${root}/.claude/skills/no-name/SKILL.md`,
      '  updated 2026-08-20',
      'plain-notes',
      `  ${root}/.agents/skills/plain-notes/SKILL.md`,
      '  updated 2026-09-01',
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
      '  updated 2026-09-15',
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
    assert.match(stdout, /\/\.claude\/skills\/commits\/SKILL\.md\n {2}also in \.github\/skills\/commits\/SKILL\.md\n/);
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
  // The real CLI: ./fixture's dates from this checkout's commits.
  assert.equal(anyDay(scanned.stdout), anyDay(`${fixture.stdout}\n`));
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
  assert.match(scanned.stdout, /^JetBrains\/intellij-community · \d+ skills · last updated \d{4}-\d{2}-\d{2}\n/);
  // Every skill dated: one more request each, and still in time.
  assert.doesNotMatch(scanned.stderr, /the last update of/);
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
  assert.match(scanned.stdout, /^example · 1 skill · last updated \d{4}-\d{2}-\d{2}\nlocal — On disk\.\n {2}file:\/\//);
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
    [`${API}/repos/JetBrains/stale/commits?sha=${EXAMPLE_COMMIT}&path=.agents/skills/kept&per_page=1`]: {
      status: 200,
      body: [{ commit: { committer: { date: '2026-10-01T00:00:00Z' } } }],
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
    [`${API}/repos/JetBrains/private/commits?sha=${EXAMPLE_COMMIT}&path=.agents/skills/secret&per_page=1`]: {
      status: 200,
      body: [{ commit: { committer: { date: '2026-10-01T00:00:00Z' } } }],
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

/** What GitHub answers for JetBrains/dated: three skills, and the last commit of each one's directory as given. */
function dated(commits: Record<string, Recorded>) {
  const API = 'https://api.github.com';
  const names = ['alpha', 'beta', 'gamma'];
  return replay({
    [`${API}/repos/JetBrains/dated`]: { status: 200, body: { full_name: 'JetBrains/dated', default_branch: 'main' } },
    [`${API}/repos/JetBrains/dated/commits/main`]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
    [`${API}/repos/JetBrains/dated/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: names.map((name) => ({ path: `.agents/skills/${name}/SKILL.md`, mode: '100644', type: 'blob', sha: name })) },
    },
    ...Object.fromEntries(
      names.map((name) => [
        `https://raw.githubusercontent.com/JetBrains/dated/${EXAMPLE_COMMIT}/.agents/skills/${name}/SKILL.md`,
        { status: 200, body: `---\nname: ${name}\ndescription: The ${name} skill.\n---\n` },
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(commits).map(([name, answer]) => [`${API}/repos/JetBrains/dated/commits?sha=${EXAMPLE_COMMIT}&path=.agents/skills/${name}&per_page=1`, answer]),
    ),
  });
}

const committed = (date: string): Recorded => ({ status: 200, body: [{ commit: { committer: { date } } }] });

/** `skill-atlas scan JetBrains/dated`, with GitHub answering from `dated`. */
async function scanDated(github: Fetch) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(['scan', 'JetBrains/dated'], { open: (input) => openGitHub(input, { fetch: github }), print: (text) => stdout.push(text), error: (text) => stderr.push(text) });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

test('on GitHub: each skill updated when its directory was last committed, up to the scanned commit; the repository, its latest', async () => {
  const github = dated({
    alpha: committed('2026-03-04T10:00:00Z'),
    beta: committed('2026-10-12T01:30:00+03:00'), // the day before, in UTC
    gamma: committed('2025-12-31T23:59:59Z'),
  });
  const result = await scan(await openGitHub('JetBrains/dated', { fetch: github }));
  assert.deepEqual(
    result.skills.map((skill) => `${skill.name} ${skill.updated}`),
    ['alpha 2026-03-04T10:00:00.000Z', 'beta 2026-10-11T22:30:00.000Z', 'gamma 2025-12-31T23:59:59.000Z'],
  );
  assert.equal(lastUpdated(result.skills), '2026-10-11T22:30:00.000Z');
  assert.deepEqual(result.warnings, []);

  const printed = await scanDated(github);
  assert.equal(printed.code, 0, printed.stderr);
  assert.match(printed.stdout, /^JetBrains\/dated · 3 skills · last updated 2026-10-11\n/);
  assert.deepEqual(printed.stdout.match(/^ {2}updated .*$/gm), ['  updated 2026-03-04', '  updated 2026-10-11', '  updated 2025-12-31']);
});

test('a last update GitHub cannot tell → the skill without it, one warning for each reason, and the scan goes on', async () => {
  const limited = { status: 403, body: { message: 'API rate limit exceeded for 192.0.2.1.' } };
  const github = dated({ alpha: committed('not a date'), beta: limited, gamma: limited });
  const result = await scan(await openGitHub('JetBrains/dated', { fetch: github }));
  assert.deepEqual(result.skills.map((skill) => `${skill.name} ${skill.updated}`), ['alpha ', 'beta ', 'gamma ']);
  assert.deepEqual(result.warnings, [
    'the last update of 1 skill is unknown: not a date: not a date',
    'the last update of 2 skills is unknown: GitHub rate limit reached; set GITHUB_TOKEN',
  ]);
  // Nothing known: no date at all.
  const printed = await scanDated(github);
  assert.equal(printed.code, 0);
  assert.match(printed.stdout, /^JetBrains\/dated · 3 skills\n/);
  assert.doesNotMatch(printed.stdout, /updated/);

  // Some known: the latest of those.
  const some = await scanDated(dated({ alpha: committed('2026-01-01T00:00:00Z'), beta: { status: 200, body: [] }, gamma: limited }));
  assert.match(some.stdout, /^JetBrains\/dated · 3 skills · last updated 2026-01-01\n/);
  assert.deepEqual(some.stderr.split('\n'), [
    'warning: the last update of 1 skill is unknown: GitHub lists no commit that changed .agents/skills/beta',
    'warning: the last update of 1 skill is unknown: GitHub rate limit reached; set GITHUB_TOKEN',
  ]);
});

test('a local directory: the last commit that changed the skill directory; not committed, or outside git, its SKILL.md modified', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const write = (path: string, text: string) => {
    mkdirSync(join(cwd, path, '..'), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  const git = (date: string, ...args: string[]) => {
    const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
    const done = spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, env, encoding: 'utf8' });
    assert.equal(done.status, 0, done.stderr);
  };

  // Outside git: when the SKILL.md was last modified.
  write('.claude/skills/drafted/SKILL.md', '---\nname: drafted\ndescription: Not committed.\n---\n');
  utimesSync(join(cwd, '.claude/skills/drafted/SKILL.md'), new Date('2026-05-06T07:08:09Z'), new Date('2026-05-06T07:08:09Z'));
  assert.deepEqual((await scan(await openDirectory(cwd))).skills.map((skill) => skill.updated), ['2026-05-06T07:08:09.000Z']);

  git('2026-01-01T00:00:00Z', 'init', '-q');
  write('.claude/skills/tested/SKILL.md', '---\nname: tested\ndescription: Committed twice.\n---\n');
  write('.agents/skills/old/SKILL.md', '---\nname: old\ndescription: Committed once.\n---\n');
  git('2026-01-01T00:00:00Z', 'add', '.claude/skills/tested', '.agents/skills/old');
  git('2026-02-03T12:00:00+05:00', 'commit', '-q', '-m', 'Two skills');
  // A change to another file of the skill is an update of it, too.
  write('.claude/skills/tested/notes.md', 'More.\n');
  git('2026-04-05T06:00:00Z', 'add', '.claude/skills/tested');
  git('2026-04-05T06:00:00Z', 'commit', '-q', '-m', 'Notes');

  const result = await scan(await openDirectory(cwd));
  assert.deepEqual(
    result.skills.map((skill) => `${skill.name} ${skill.updated}`),
    ['drafted 2026-05-06T07:08:09.000Z', 'old 2026-02-03T07:00:00.000Z', 'tested 2026-04-05T06:00:00.000Z'],
  );
  assert.deepEqual(result.warnings, []);

  const scanned = spawnSync(process.execPath, [CLI, 'scan', cwd], { encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.match(scanned.stdout, /· 3 skills · last updated 2026-05-06\n/);
  assert.match(scanned.stdout, /^old — Committed once\.\n {2}file:.*\n {2}updated 2026-02-03$/m);
});
