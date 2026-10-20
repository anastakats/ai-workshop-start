// The decisions in spec/demo.md, checked by running `npm run demo` on demos of its own, written
// to a temporary directory: the videos they make, what they show, how they fail.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEMO = fileURLToPath(new URL('../demo/demo.ts', import.meta.url));
const browser = !!process.env.CHROMIUM_PATH || existsSync(chromium.executablePath());
const skip = { skip: !browser && 'needs Chromium: npx playwright install chromium, or CHROMIUM_PATH' };

const dir = mkdtempSync(join(tmpdir(), 'skill-atlas-demo-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const demos = join(dir, 'demos');

/** Demos of their own, one file each, as `demo/<feature>.demo.ts` would be. */
const files: Record<string, string> = {
  'web.demo.ts': `
    test('Scan: JetBrains/example!', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('#demo-cursor')).toBeAttached();
      await caption(page, 'A caption', 100);
      await expect(page.locator('#demo-caption')).toHaveText('A caption');
      await caption(page, 'The next one', 100);
      await expect(page.locator('#demo-caption')).toHaveText('The next one');
      await type(page.getByRole('textbox', { name: 'Repository' }), 'JetBrains/example');
      await page.getByRole('button', { name: 'Scan' }).click();
      await expect(page.locator('#repository')).toHaveText('JetBrains/example1 skill');
    });`,
  'terminal.demo.ts': `
    test('terminal', async ({ page }) => {
      const output = await terminal(page, 'pwd; echo to stderr >&2; exit 3');
      expect(output).toBe(${JSON.stringify(`${ROOT.replace(/\/$/, '')}\n`)} + 'to stderr\\n');
      await expect(page.locator('#terminal')).toHaveText(${JSON.stringify(`$ pwd; echo to stderr >&2; exit 3\n${ROOT.replace(/\/$/, '')}\nto stderr`)});
    });`,
  'fails.demo.ts': `
    test('fails', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Not Skill Atlas' })).toBeVisible({ timeout: 500 });
    });`,
  // Not a *.demo.ts: not a demo, never run.
  'helper.ts': `test('not a demo', () => {});`,
};
mkdirSync(demos);
// ES modules, as in the checkout.
writeFileSync(join(dir, 'package.json'), '{ "type": "module" }');
for (const [name, body] of Object.entries(files)) {
  writeFileSync(join(demos, name), `import { caption, expect, terminal, test, type } from ${JSON.stringify(DEMO)};\n${body}\n`);
}

/** `npm run demo -- <args>` on these demos: which tests passed and failed, and the videos. */
function demo(name: string, args: string[] = []) {
  const videos = join(dir, name);
  const run = spawnSync('npm', ['run', '--silent', 'demo', '--', '--reporter=json', ...args], {
    cwd: ROOT,
    env: { ...process.env, DEMO_DIR: demos, DEMO_VIDEOS: videos, CI: '' },
    encoding: 'utf8',
  });
  const report = JSON.parse(run.stdout);
  const results: Record<string, string> = {};
  const walk = (suite: any): void => {
    for (const spec of suite.specs ?? []) results[spec.title] = spec.tests[0].results[0].status;
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites) walk(suite);
  return { status: run.status, results, videos: existsSync(videos) ? readdirSync(videos).sort() : [], dir: videos };
}

const webm = (path: string) => readFileSync(path).subarray(0, 4).toString('hex') === '1a45dfa3';

test('npm run demo: every *.demo.ts, each test a WebM video named after its title, lower case and - for the rest; a failing expect fails the run', skip, () => {
  const run = demo('all');
  assert.notEqual(run.status, 0);
  assert.deepEqual(run.results, { 'Scan: JetBrains/example!': 'passed', terminal: 'passed', fails: 'failed' });
  // The failed one too, to see what went wrong.
  assert.deepEqual(run.videos, ['fails.webm', 'scan-jetbrains-example.webm', 'terminal.webm']);
  for (const video of run.videos) assert.ok(webm(join(run.dir, video)), `${video}: a WebM`);
});

test('npm run demo -- <name>: only the demos whose file matches', skip, () => {
  const run = demo('one', ['terminal']);
  assert.equal(run.status, 0);
  assert.deepEqual(run.results, { terminal: 'passed' });
  assert.deepEqual(run.videos, ['terminal.webm']);
});

test('demo-videos/ and demo-results/ are not committed', () => {
  const ignored = execFileSync('git', ['check-ignore', 'demo-videos/web-view.webm', 'demo-results/x'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ignored, 'demo-videos/web-view.webm\ndemo-results/x\n');
});
