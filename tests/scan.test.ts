// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for a small GitHub repository answered in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { replay } from '../src/core/replay.ts';
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
