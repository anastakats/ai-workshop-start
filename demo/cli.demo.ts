// A demo of the command line (spec/cli.md), shown in a terminal on the page.
import { expect, pause, test, terminal } from './demo.ts';

test('command line', async ({ page }) => {
  const output = await terminal(page, './skill-atlas scan ./fixture');
  expect(output).toContain('fixture · 6 skills');
  await expect(page.locator('#terminal')).toContainText('also in .github/skills/commits/SKILL.md');
  await pause(page, 3000);
});
