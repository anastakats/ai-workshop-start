// A demo of when the skills were last updated (spec/analysis.md, spec/cli.md, spec/web.md): in the
// web view, each skill's own day, not the repository's; then on the command line.
import { caption, expect, pause, terminal, test, type } from './demo.ts';

test('last updated', async ({ page }) => {
  await page.goto('/');
  await caption(page, 'When was a skill last updated?');

  await type(page.getByRole('textbox', { name: 'Repository' }), 'JetBrains/example');
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(page.locator('nav .updated')).toHaveText(['updated 2026-10-12']);
  await expect(page.locator('header')).not.toContainText('updated');
  await caption(page, "Under each skill: its own day, not the repository's");

  await page.getByRole('navigation', { name: 'Skills' }).getByRole('button').filter({ hasText: 'commits' }).click();
  await expect(page.locator('article .updated')).toHaveText('updated 2026-10-12');
  await caption(page, 'Selected, too: the last commit that changed its directory');

  // Relative to the checkout, where the server runs; its dates fixed in tests/helpers.ts.
  await page.getByRole('textbox', { name: 'Repository' }).clear();
  await type(page.getByRole('textbox', { name: 'Repository' }), './fixture');
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(page.locator('nav .updated')).toHaveCount(6);
  await expect(page.locator('nav .updated').first()).toHaveText('updated 2026-10-02');
  await caption(page, 'A local directory: each skill from git, or when its SKILL.md was modified');

  const output = await terminal(page, './skill-atlas scan ./fixture');
  expect(output).toMatch(/^fixture · 6 skills · last updated \d{4}-\d{2}-\d{2}\n/);
  await expect(page.locator('#terminal')).toContainText('updated');
  await caption(page, 'The command line: under each skill, and in the first line', 2500);
  await pause(page);
});
