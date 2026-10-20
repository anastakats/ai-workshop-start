// A demo of the screenshot comparison (spec/screenshots.md): a step's screenshot on main and in a
// pull request that changes the highlight's color; the comparison, and the difference in red.
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { caption, expect, pause, terminal, test, type } from './demo.ts';

// In demo-results/, not committed; relative to the checkout, where terminal() runs.
const DIR = 'demo-results/screenshots';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STEP = 'web/the-filter/02-commit-highlighted.png';

test('screenshots compared', async ({ page }) => {
  rmSync(`${ROOT}/${DIR}`, { recursive: true, force: true });
  mkdirSync(`${ROOT}/${DIR}`, { recursive: true });
  await page.goto('/');
  await caption(page, 'An e2e test, step by step: a screenshot after each step');
  await type(page.getByRole('textbox', { name: 'Repository' }), './fixture');
  await page.getByRole('button', { name: 'Scan' }).click();
  await type(page.getByRole('searchbox', { name: 'Filter the skills' }), 'commit');
  await expect(page.locator('#matches')).toHaveText('2 of 6');
  await caption(page, 'On main: the matches highlighted in yellow');
  await page.evaluate(() => document.getElementById('demo-caption')?.remove());
  await page.screenshot({ path: `${ROOT}/${DIR}/main/${STEP}`, fullPage: true, animations: 'disabled', caret: 'hide' });

  await page.addStyleTag({ content: 'mark { background: #a3d8f8 !important; }' });
  await caption(page, 'In the pull request: the same step, the highlight now blue');
  await page.evaluate(() => document.getElementById('demo-caption')?.remove());
  await page.screenshot({ path: `${ROOT}/${DIR}/pr/${STEP}`, fullPage: true, animations: 'disabled', caret: 'hide' });

  const output = await terminal(page, `npm run --silent screenshots:compare -- ${DIR}/main ${DIR}/pr ${DIR}/diff`);
  expect(output).toContain('1 changed, 0 added, 0 removed, 0 unchanged, of 1 steps.');
  await caption(page, 'CI compares every step of main and of the pull request', 2500);

  await page.goto(pathToFileURL(`${ROOT}/${DIR}/diff/index.html`).href);
  await expect(page.locator('#summary')).toHaveText('1 changed, 0 added, 0 removed, 0 unchanged, of 1 steps.');
  await caption(page, 'The report: main, the pull request, and what differs, in red', 2500);
  await page.locator('img').nth(2).click();
  await caption(page, 'In the pull request: a comment with these; in CI, every screenshot to download', 3000);
  await pause(page);
});
