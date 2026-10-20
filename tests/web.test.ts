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
import { createWebServer, listen } from '../src/web.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE, open } from './helpers.ts';

const server = createWebServer({ open });
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
