// The decisions in spec/web.md, checked on what the web view's server answers for ./fixture and
// for the small GitHub repository answered in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { AtlasError } from '../src/core/errors.ts';
import { createWebServer, listen } from '../src/web.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE, open, organization } from './helpers.ts';

const server = createWebServer({ open, organization });
const base = await listen(server, 0);
after(() => server.close());

async function get(path: string) {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, type: response.headers.get('content-type'), text: await response.text() };
}

async function scanned(repo: string) {
  const { status, text } = await get(`/api/scan?repo=${encodeURIComponent(repo)}`);
  return { status, body: JSON.parse(text) };
}

test('the page: the title, the field, Scan, and the placeholder for SKILL.md', async () => {
  const page = await get('/');
  assert.equal(page.status, 200);
  assert.equal(page.type, 'text/html; charset=utf-8');
  assert.match(page.text, /<h1>Skill Atlas<\/h1>/);
  assert.match(page.text, /<input id="repo"[^>]* placeholder="owner\/repo or a GitHub link"/);
  assert.match(page.text, /<button id="submit" type="submit">Scan<\/button>/);
  assert.match(page.text, /Select a skill to read its SKILL\.md\./);
  // The SKILL.md is text, never HTML.
  assert.doesNotMatch(page.text, /innerHTML/);
});

test('before a scan, the examples: a repository and an organization, each a button with what it scans', async () => {
  const page = await get('/');
  assert.match(page.text, /Scan a repository to see its skills\. Try:/);
  assert.match(page.text, /<button type="button" class="example" data-repo="JetBrains\/kotlin">JetBrains\/kotlin<\/button>a repository/);
  assert.match(page.text, /<button type="button" class="example" data-repo="github\.com\/JetBrains">github\.com\/JetBrains<\/button>an organization/);
  assert.match(page.text, /or the path to a local directory\./);
});

test('a shared link, /?repo=<input>&skill=<name>: the same page, the scan left to it', async () => {
  const shared = await get('/?repo=JetBrains/example&skill=commits');
  assert.equal(shared.status, 200);
  assert.equal(shared.type, 'text/html; charset=utf-8');
  assert.equal(shared.text, (await get('/')).text);
});

test('the filter: a field over the skills, and its script, served as JavaScript', async () => {
  const page = await get('/');
  assert.match(page.text, /<input id="query"[^>]* placeholder="Filter the skills"/);
  assert.match(page.text, /import \{ filterSkills \} from '\/filter\.js'/);
  const script = await get('/filter.js');
  assert.equal(script.status, 200);
  assert.equal(script.type, 'text/javascript; charset=utf-8');
  assert.equal(script.text, readFileSync(new URL('../src/web/filter.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(script.text, /innerHTML/);
});

test('./fixture: the repository, every skill sorted by name with its link and SKILL.md, and the warnings', async () => {
  const { status, body } = await scanned(FIXTURE);
  assert.equal(status, 200);
  assert.equal(body.repository.id, 'fixture');
  assert.deepEqual(
    body.skills.map((skill: { name: string }) => skill.name),
    ['code-style', 'commits', 'no-description', 'no-name', 'plain-notes', 'release-checklist'],
  );
  const root = pathToFileURL(FIXTURE).href;
  for (const skill of body.skills) {
    assert.equal(skill.link, `${root}/${skill.path}`);
    assert.equal(skill.content, readFileSync(join(FIXTURE, skill.path), 'utf8'));
  }
  const commits = body.skills.find((skill: { name: string }) => skill.name === 'commits');
  assert.equal(commits.description, 'Write commit messages the way this repository does. Use for every commit.');
  assert.deepEqual(commits.copies, ['.github/skills/commits/SKILL.md']);
  assert.equal(commits.updated, '2026-10-14T16:45:00.000Z');
  assert.deepEqual(body.warnings, [
    '.agents/skills/plain-notes/SKILL.md: no front matter; using the directory name',
    '.agents/skills/release-checklist/SKILL.md: malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  ]);
});

test('owner/repo and a GitHub link: the same answer, linked at the scanned commit, with its SKILL.md', async () => {
  const short = await scanned('JetBrains/example');
  assert.deepEqual(await scanned('https://github.com/JetBrains/example'), short);
  assert.equal(short.status, 200);
  assert.equal(short.body.repository.id, 'JetBrains/example');
  assert.deepEqual(short.body.warnings, []);
  assert.deepEqual(short.body.skills, [
    {
      id: 'JetBrains/example:.claude/skills/commits/SKILL.md',
      repository: 'JetBrains/example',
      path: '.claude/skills/commits/SKILL.md',
      name: 'commits',
      description: 'Write commit messages the way this repository does. Use for every commit.',
      commit: EXAMPLE_COMMIT,
      copies: ['.github/skills/commits/SKILL.md'],
      content: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
      updated: '2026-10-12T07:30:00.000Z',
      link: `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    },
  ]);
});

test("errors: the CLI's message as 400 { error }", async () => {
  const missing = join(FIXTURE, 'no-such-directory');
  assert.deepEqual(await scanned(missing), { status: 400, body: { error: `Not a GitHub URL or a readable directory: ${missing}` } });
  assert.deepEqual(await scanned('JetBrains/not-answered'), {
    status: 400,
    body: { error: (await atlas(['scan', 'JetBrains/not-answered'])).stderr },
  });
  assert.deepEqual(await scanned(' '), { status: 400, body: { error: 'Enter owner/repo, a GitHub link or a directory' } });
  assert.equal((await get('/nothing-here')).status, 404);
});

test('local only: listens on 127.0.0.1', () => {
  assert.equal((server.address() as AddressInfo).address, '127.0.0.1');
});

test('./skill-atlas serve: prints its URL, serves the page and the scan, stores nothing', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  const child = spawn(process.execPath, [CLI, 'serve', '--port', '0'], { cwd, env: { ...process.env, GITHUB_TOKEN: 'secret-token' } });
  t.after(() => {
    child.kill();
    rmSync(cwd, { recursive: true, force: true });
  });
  const line = await new Promise<string>((resolve, reject) => {
    child.stdout.setEncoding('utf8').once('data', resolve);
    child.once('exit', (code) => reject(new Error(`serve exited with ${code}`)));
  });
  const url = /^Skill Atlas at (http:\/\/localhost:\d+)\n$/.exec(line)?.[1];
  assert.ok(url, line);
  const page = await fetch(url);
  assert.equal(page.status, 200);
  const scan = await fetch(`${url}/api/scan?repo=${encodeURIComponent(FIXTURE)}`);
  const text = await scan.text();
  assert.equal(scan.status, 200);
  assert.equal(JSON.parse(text).skills.length, 6);
  assert.doesNotMatch(text + (await page.text()), /secret-token/);
  assert.deepEqual(readdirSync(cwd), []);
});

test('serve: a wrong port → the usage, exit code 1', async () => {
  for (const args of [['--port', 'x'], ['--port'], ['3000']]) {
    assert.deepEqual(await atlas(['serve', ...args]), { code: 1, stdout: '', stderr: 'Usage: skill-atlas serve [--port N]' });
  }
});

/** What `/api/organization` streams: one JSON object a line. */
async function organizationLines(org: string) {
  const { status, type, text } = await get(`/api/organization?org=${encodeURIComponent(org)}`);
  return { status, type, lines: text.split('\n').filter(Boolean).map((line) => JSON.parse(line)) };
}

test('github.com/<org>: the number of repositories, the progress, then the repositories with skills', async () => {
  const { status, type, lines } = await organizationLines('github.com/JetBrains');
  assert.equal(status, 200);
  assert.equal(type, 'application/x-ndjson; charset=utf-8');
  const listed = { id: 'JetBrains', url: 'https://github.com/JetBrains', repositories: 7 };
  assert.deepEqual(lines.slice(0, 8), [{ organization: listed }, ...[1, 2, 3, 4, 5, 6, 7].map((scanned) => ({ scanned }))]);
  assert.deepEqual(lines.slice(8), [await organization('github.com/JetBrains')]);
  assert.deepEqual(
    lines[8].repositories.map((repository: { name: string; skills: number }) => `${repository.name} ${repository.skills}`),
    ['mps 4', 'kotlin 3', 'ai-tools 2', 'example 1'],
  );
  assert.equal(lines[8].warnings.length, 1);
});

test('an organization: a clear message before the scan → 400 { error }', async () => {
  const ask = async (org: string) => {
    const { status, text } = await get(`/api/organization?org=${encodeURIComponent(org)}`);
    return { status, body: JSON.parse(text) };
  };
  assert.deepEqual(await ask('JetBrains/kotlin'), { status: 400, body: { error: 'Not a GitHub organization: JetBrains/kotlin' } });
  assert.deepEqual(await ask('github.com/not-answered'), {
    status: 400,
    body: { error: 'Cannot reach GitHub: not recorded: https://api.github.com/users/not-answered' },
  });
  assert.deepEqual(await ask(''), { status: 400, body: { error: 'Enter github.com/<organization>' } });
});

test('an organization: a failure during the scan → a last line { error }', async () => {
  const failing = createWebServer({
    open,
    async organization(_input, { progress }) {
      progress?.({ organization: { id: 'Big', url: 'https://github.com/Big', repositories: 2 } });
      progress?.({ scanned: 1 });
      throw new AtlasError('GitHub rate limit reached; set GITHUB_TOKEN or log in with gh auth login');
    },
  });
  const url = await listen(failing, 0);
  after(() => failing.close());
  const response = await fetch(`${url}/api/organization?org=github.com/Big`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.text()).split('\n').filter(Boolean).map((line) => JSON.parse(line)), [
    { organization: { id: 'Big', url: 'https://github.com/Big', repositories: 2 } },
    { scanned: 1 },
    { error: 'GitHub rate limit reached; set GITHUB_TOKEN or log in with gh auth login' },
  ]);
});

test('an organization: the page goes away → the scan is stopped', async () => {
  let stopped!: (aborted: boolean) => void;
  const aborted = new Promise<boolean>((resolve) => (stopped = resolve));
  const waiting = createWebServer({
    open,
    organization: (_input, { progress, signal }) =>
      new Promise((_resolve, reject) => {
        progress?.({ organization: { id: 'Big', url: 'https://github.com/Big', repositories: 865 } });
        signal?.addEventListener('abort', () => {
          stopped(true);
          reject(new AtlasError('stopped'));
        });
      }),
  });
  const url = await listen(waiting, 0);
  after(() => waiting.close());
  const page = new AbortController();
  const response = await fetch(`${url}/api/organization?org=github.com/Big`, { signal: page.signal });
  await response.body?.getReader().read(); // the first line
  page.abort();
  assert.equal(await aborted, true);
});
