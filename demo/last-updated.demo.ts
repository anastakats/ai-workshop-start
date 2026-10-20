// A demo of when the skills were last updated (spec/analysis.md, spec/cli.md, spec/web.md): the
// repository's latest, then each skill's, in the web view and on the command line.
import { caption, expect, pause, terminal, test, type } from './demo.ts';

test('last updated', async ({ page }) => {
  await page.goto('/');
  await caption(page, 'When was a skill last updated?');

  await type(page.getByRole('textbox', { name: 'Repository' }), 'JetBrains/example');
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(page.locator('#updated')).toHaveText('last updated 2026-10-12');
  await caption(page, 'By the repository: the day its most recently updated skill was');

  await page.getByRole('navigation', { name: 'Skills' }).getByRole('button').filter({ hasText: 'commits' }).click();
  await expect(page.locator('article .updated')).toHaveText('updated 2026-10-12');
  await caption(page, 'By each skill: the last commit that changed its directory');

  // Relative to the checkout, where the server runs; its dates fixed in tests/helpers.ts.
  await page.getByRole('textbox', { name: 'Repository' }).clear();
  await type(page.getByRole('textbox', { name: 'Repository' }), './fixture');
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(page.locator('#updated')).toHaveText('last updated 2026-10-14');
  await caption(page, 'A local directory: from git, or when its SKILL.md was modified');

  const output = await terminal(page, './skill-atlas scan ./fixture');
  expect(output).toMatch(/^fixture · 6 skills · last updated \d{4}-\d{2}-\d{2}\n/);
  await expect(page.locator('#terminal')).toContainText('updated');
  await caption(page, 'The command line too: under each skill, and in the first line', 2500);
  await pause(page);
});
