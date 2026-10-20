// The decisions in spec/screenshots.md: the comparison, on screenshots of its own; the steps, by
// running `npm run e2e` on tests of its own, written to a temporary directory.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { compare, html, markdown, type Report } from '../scripts/compare-screenshots.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../scripts/compare-screenshots.ts', import.meta.url));
const STEPS = fileURLToPath(new URL('../e2e/steps.ts', import.meta.url));
const browser = !!process.env.CHROMIUM_PATH || existsSync(chromium.executablePath());
const skip = { skip: !browser && 'needs Chromium: npx playwright install chromium, or CHROMIUM_PATH' };

const dir = mkdtempSync(join(tmpdir(), 'skill-atlas-screenshots-'));
after(() => rmSync(dir, { recursive: true, force: true }));

/** A white PNG, with the given pixels black. */
function png(width: number, height: number, black: [number, number][] = []): Buffer {
  const image = new PNG({ width, height });
  image.data.fill(255);
  for (const [x, y] of black) image.data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
  return PNG.sync.write(image);
}

/** A screenshots/ directory: path → PNG. */
function screenshots(name: string, files: Record<string, Buffer>): string {
  const root = join(dir, name);
  for (const [path, data] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), data);
  }
  return root;
}

const files = (root: string) => (existsSync(root) ? readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((path) => path.endsWith('.png')).sort() : []);

test('compare: each step changed, added, removed or unchanged, by its test and its name, not its number', () => {
  const base = screenshots('base', {
    'web/scan/01-empty.png': png(10, 10),
    'web/scan/02-scanned.png': png(10, 10),
    'web/scan/03-selected.png': png(10, 10),
    'web/gone/01-only-in-base.png': png(10, 10),
  });
  const pr = screenshots('pr', {
    'web/scan/01-empty.png': png(10, 10),
    // A step added before: the next ones renumbered, still the same steps.
    'web/scan/02-typed.png': png(10, 10),
    'web/scan/03-scanned.png': png(10, 10),
    'web/scan/04-selected.png': png(10, 10, [[2, 3], [4, 5]]),
  });
  const out = join(dir, 'out');
  const report = compare(base, pr, out);
  assert.deepEqual(
    report.steps.map(({ test, step, status, pixels }) => ({ test, step, status, pixels })),
    [
      { test: 'web/gone', step: '01-only-in-base', status: 'removed', pixels: undefined },
      { test: 'web/scan', step: '01-empty', status: 'unchanged', pixels: undefined },
      { test: 'web/scan', step: '02-typed', status: 'added', pixels: undefined },
      { test: 'web/scan', step: '03-scanned', status: 'unchanged', pixels: undefined },
      { test: 'web/scan', step: '04-selected', status: 'changed', pixels: 2 },
    ],
  );
  assert.deepEqual(report.counts, { changed: 1, added: 1, removed: 1, unchanged: 2 });
  // Only the steps that differ, under their paths.
  assert.deepEqual(files(out), [
    'web/gone/01-only-in-base.base.png',
    'web/scan/02-typed.pr.png',
    'web/scan/04-selected.base.png',
    'web/scan/04-selected.diff.png',
    'web/scan/04-selected.pr.png',
  ]);
  assert.deepEqual(report.steps[4].images, {
    base: 'web/scan/04-selected.base.png',
    pr: 'web/scan/04-selected.pr.png',
    diff: 'web/scan/04-selected.diff.png',
  });
  // The difference: in red where they differ, the rest faded.
  const diff = PNG.sync.read(readFileSync(join(out, 'web/scan/04-selected.diff.png')));
  const at = (x: number, y: number) => [...diff.data.subarray((y * 10 + x) * 4, (y * 10 + x) * 4 + 3)];
  assert.deepEqual(at(2, 3), [255, 0, 0]);
  assert.deepEqual(at(4, 5), [255, 0, 0]);
  assert.notDeepEqual(at(0, 0), [255, 0, 0]);
});

test('compare: other bytes, the same pixels → unchanged; another size → changed, the rest differs', () => {
  const same = PNG.sync.read(png(4, 4));
  // RGB, without alpha: other bytes, the same white.
  const otherBytes = PNG.sync.write(same, { colorType: 2 });
  const base = screenshots('base-sizes', { 't/01-same.png': png(4, 4), 't/02-taller.png': png(4, 4) });
  const pr = screenshots('pr-sizes', { 't/01-same.png': otherBytes, 't/02-taller.png': png(4, 6) });
  assert.notDeepEqual(readFileSync(join(base, 't/01-same.png')), otherBytes);
  const out = join(dir, 'out-sizes');
  const report = compare(base, pr, out);
  assert.deepEqual(report.steps.map(({ status, pixels }) => ({ status, pixels })), [
    { status: 'unchanged', pixels: undefined },
    { status: 'changed', pixels: 8 },
  ]);
  const diff = PNG.sync.read(readFileSync(join(out, 't/02-taller.diff.png')));
  assert.deepEqual([diff.width, diff.height], [4, 6]);
});

const report = (differ: number, unchanged = 0): Report => ({
  counts: { changed: differ, added: 0, removed: 0, unchanged },
  steps: [
    ...Array.from({ length: differ }, (_, i) => ({
      test: 'web/a test',
      step: `${String(i + 1).padStart(2, '0')}-step`,
      status: 'changed' as const,
      pixels: 10 + i,
      images: { base: `web/a test/${i}.base.png`, pr: `web/a test/${i}.pr.png`, diff: `web/a test/${i}.diff.png` },
    })),
    ...Array.from({ length: unchanged }, (_, i) => ({ test: 'web/b', step: `0${i}-same`, status: 'unchanged' as const, images: {} })),
  ],
});

test('report.md: the counts, then a row per step that differs: the base, the pull request, the difference', () => {
  const text = markdown(report(1, 2), { baseName: 'main', imagesUrl: 'https://example.com/pr-1/' });
  assert.match(text, /^### Screenshots: main → this pull request\n\n1 changed, 0 added, 0 removed, 2 unchanged, of 3 steps\.\n/);
  assert.match(text, /<th>Step<\/th><th>main<\/th><th>This pull request<\/th><th>Difference<\/th>/);
  assert.match(text, /<code>web\/a test<\/code><br><b>01-step<\/b><br>changed, 10 pixels/);
  // The images there, their paths encoded.
  for (const kind of ['base', 'pr', 'diff']) assert.ok(text.includes(`<img src="https://example.com/pr-1/web/a%20test/0.${kind}.png" width="260">`), kind);
  assert.equal((text.match(/<tr>/g) ?? []).length, 2);
  // Without --images-url, next to it; --base-name.
  assert.ok(markdown(report(1), { baseName: 'release' }).includes('<img src="web/a test/0.diff.png"'));
  assert.ok(markdown(report(1), { baseName: 'release' }).includes('<th>release</th>'));
});

test('report.md: no differences, the same pixels, no table; up to 40 steps, the rest in the test results', () => {
  assert.equal(markdown(report(0, 3)), '### Screenshots: main → this pull request\n\nNo differences: 3 steps, the same pixels.\n');
  assert.equal(markdown(report(0)), '### Screenshots: main → this pull request\n\nNo screenshots to compare.\n');
  const many = markdown(report(45));
  assert.equal((many.match(/<tr>/g) ?? []).length, 41);
  assert.match(many, /…and 5 more steps that differ: in the test results\./);
  // index.html: every one of them.
  const page = html(report(45));
  assert.equal((page.match(/<tr>/g) ?? []).length, 46);
  assert.match(page, /<p id="summary">45 changed, 0 added, 0 removed, 0 unchanged, of 45 steps\.<\/p>/);
});

test('npm run screenshots:compare: report.md, index.html, report.json in <out>; exit 0 with differences, 2 for a wrong command line', () => {
  const base = screenshots('cli-base', { 't/01-a.png': png(3, 3) });
  const pr = screenshots('cli-pr', { 't/01-a.png': png(3, 3, [[1, 1]]) });
  const out = join(dir, 'cli-out');
  const run = spawnSync('npm', ['run', '--silent', 'screenshots:compare', '--', base, pr, out, '--base-name', 'main'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^1 changed, 0 added, 0 removed, 0 unchanged, of 1 steps\. The report: /);
  assert.deepEqual(readdirSync(out).sort(), ['index.html', 'report.json', 'report.md', 't']);
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')).counts, { changed: 1, added: 0, removed: 0, unchanged: 0 });

  const wrong = spawnSync('node', [SCRIPT, base], { encoding: 'utf8' });
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /^Usage: /);
});

test('the steps: a screenshot after each, screenshots/<spec>/<test>/<NN>-<step>.png, the same pixels each run; a failing step, none; a name twice fails the test', skip, () => {
  const specs = join(dir, 'specs');
  mkdirSync(specs);
  writeFileSync(join(dir, 'package.json'), '{ "type": "module" }');
  writeFileSync(
    join(specs, 'Some Steps.spec.ts'),
    `import { expect, test } from ${JSON.stringify(STEPS)};
    test('Two steps!', async ({ page, step }) => {
      await step('A field, focused', async () => {
        await page.setContent('<input autofocus value="text"><style>input { transition: width 5s; }</style>');
        await page.locator('input').focus();
      });
      await step('Then: wider', async () => {
        await page.locator('input').evaluate((node) => (node.style.width = '400px'));
      });
    });
    test('fails', async ({ page, step }) => {
      await step('before', async () => page.setContent('<p>before</p>'));
      await step('the failing one', async () => expect(page.locator('h1')).toBeVisible({ timeout: 200 }));
    });
    test('twice', async ({ page, step }) => {
      await step('same', async () => page.setContent('<p>1</p>'));
      await step('Same!', async () => page.setContent('<p>2</p>'));
    });`,
  );
  const run = (name: string) => {
    const shots = join(dir, name);
    const result = spawnSync('npx', ['playwright', 'test', '--reporter=json'], {
      cwd: ROOT,
      env: { ...process.env, E2E_DIR: specs, SCREENSHOTS: shots, CI: '' },
      encoding: 'utf8',
    });
    const results: Record<string, { status: string; error?: string }> = {};
    for (const spec of JSON.parse(result.stdout).suites[0].specs) {
      const { status, errors } = spec.tests[0].results[0];
      results[spec.title] = { status, error: errors[0]?.message };
    }
    return { status: result.status, results, shots };
  };
  const first = run('shots-1');
  assert.notEqual(first.status, 0);
  assert.equal(first.results['Two steps!'].status, 'passed');
  assert.equal(first.results.fails.status, 'failed');
  assert.equal(first.results.twice.status, 'failed');
  assert.match(first.results.twice.error!, /Two steps named "same" in "twice"/);
  assert.deepEqual(files(first.shots), [
    'some-steps/fails/01-before.png',
    'some-steps/twice/01-same.png',
    'some-steps/two-steps/01-a-field-focused.png',
    'some-steps/two-steps/02-then-wider.png',
  ]);
  // The whole page, with nothing that moves: the same pixels again.
  const second = run('shots-2');
  const report = compare(first.shots, second.shots, join(dir, 'shots-diff'));
  assert.deepEqual(report.counts, { changed: 0, added: 0, removed: 0, unchanged: 4 });
});

test('screenshots/ and comparison/ are not committed', () => {
  const ignored = execFileSync('git', ['check-ignore', 'screenshots/web/x/01-a.png', 'comparison/diff/report.md'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ignored, 'screenshots/web/x/01-a.png\ncomparison/diff/report.md\n');
});
