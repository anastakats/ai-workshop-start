// A demo of the web view (spec/web.md): scan a repository, read a skill, filter the skills.
// The template for a new feature's demo: copy it, show the feature, keep the expects.
import { caption, expect, pause, test, type } from './demo.ts';

test('web view', async ({ page }) => {
  await page.goto('/');
  await caption(page, 'Skill Atlas: every SKILL.md in a repository');

  await caption(page, 'Scan a repository: owner/repo, a GitHub link or a directory', 600);
  // Relative to the checkout, where the server runs: the same on every machine, unlike FIXTURE.
  await type(page.getByRole('textbox', { name: 'Repository' }), './fixture');
  await page.getByRole('button', { name: 'Scan' }).click();
  const skills = page.getByRole('navigation', { name: 'Skills' }).locator('#skills').getByRole('button');
  await expect(skills).toHaveCount(6);
  await caption(page, 'Its skills, sorted by name; the warnings under the header');

  await caption(page, 'Select a skill to read its SKILL.md', 600);
  await skills.filter({ hasText: 'commits' }).click();
  await expect(page.locator('article .title')).toHaveText('commits');
  await caption(page, 'The SKILL.md, rendered, its link, and its copies');

  await caption(page, 'Filter the skills by name or description', 600);
  await type(page.getByRole('searchbox', { name: 'Filter the skills' }), 'commit');
  await expect(page.locator('#matches')).toHaveText('2 of 6');
  await caption(page, '2 of 6 match, every match highlighted', 2500);
  await pause(page);
});
