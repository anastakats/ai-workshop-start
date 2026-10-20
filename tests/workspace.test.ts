// The decisions in spec/workspace.md: what .gitignore ignores, what it never does, and a run of the
// tests and the CLI that leaves `git status` as it was.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The paths of these that git ignores, in their order. */
function ignored(paths: string[]): string[] {
  // Exit code 1: none ignored.
  const run = spawnSync('git', ['check-ignore', '--no-index', ...paths], { cwd: ROOT, encoding: 'utf8' });
  assert.ok(run.status === 0 || run.status === 1, run.stderr);
  return run.stdout.split('\n').filter(Boolean);
}

const status = () => execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' });

test('ignored: node_modules/, Playwright\'s output, the demos\', *.tsbuildinfo, *.log, the editor\'s settings, the OS\'s', () => {
  const paths = [
    'node_modules/yaml/package.json',
    'test-results/.last-run.json',
    'playwright-report/index.html',
    'blob-report/report.zip',
    'playwright/.cache/x',
    'demo-videos/web-view.webm',
    'demo-results/.last-run.json',
    'tsconfig.tsbuildinfo',
    'npm-debug.log',
    '.idea/workspace.xml',
    '.idea/runConfigurations/tests.xml',
    '.vscode/settings.json',
    '.fleet/settings.json',
    'src/.cli.ts.swp',
    '.DS_Store',
    'spec/.DS_Store',
    'Thumbs.db',
  ];
  assert.deepEqual(ignored(paths), paths);
});

test('never ignored: the code, the specs, the fixture, the demos\' scripts', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const paths = [...tracked, 'demo/feature.demo.ts', 'spec/feature.md', 'tests/feature.test.ts', 'src/core/feature.ts'];
  assert.deepEqual(ignored(paths), []);
});

test('the tests and ./skill-atlas scan ./fixture: git status as it was', () => {
  const before = status();
  // The other tests, not this one (it would run itself) nor tests/demo.test.ts (its own videos, in a temporary directory).
  const files = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.test.ts') && !['workspace.test.ts', 'demo.test.ts'].includes(f));
  const tests = spawnSync(process.execPath, ['--test', ...files.map((f) => `tests/${f}`)], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GITHUB_TOKEN: '' } });
  assert.equal(tests.status, 0, tests.stdout + tests.stderr);
  const scan = spawnSync('./skill-atlas', ['scan', './fixture'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(scan.status, 0, scan.stderr);
  assert.equal(status(), before);
});
