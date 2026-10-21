// A demo of malformed front matter (spec/analysis.md#details): the skill's own text, no warning; its text in the preview.
import { caption, expect, pause, terminal, test } from './demo.ts';

test('malformed front matter', async ({ page }) => {
  const output = await terminal(page, './skill-atlas scan ./fixture');
  expect(output).toContain('release-checklist');
  expect(output).not.toContain('warning');
  await caption(page, 'release-checklist: its front matter is malformed, no warning', 2500);

  await page.goto('/?repo=./fixture');
  const skills = page.locator('#skills').getByRole('button');
  await expect(skills).toHaveCount(6);
  await expect(page.locator('.warning')).toHaveCount(0);
  await caption(page, 'In the browser: no warning under the header either');

  await skills.filter({ hasText: 'release-checklist' }).click();
  const skill = page.locator('article');
  await expect(skill.locator('pre.front-matter')).toHaveText('name: release-checklist\ndescription: Steps before a release: tag, notes, announce');
  await expect(skill.locator('.markdown ol > li')).toHaveCount(3);
  await caption(page, 'Its SKILL.md: the front matter as text, as it is, then the Markdown', 2500);
  await pause(page);
});
