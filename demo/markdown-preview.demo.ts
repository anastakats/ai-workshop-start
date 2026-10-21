// A demo of the preview (spec/web.md#preview): the selected SKILL.md rendered, its front matter a table.
import { caption, expect, pause, test } from './demo.ts';

test('markdown preview', async ({ page }) => {
  await page.goto('/?repo=./fixture');
  const skills = page.locator('#skills').getByRole('button');
  await expect(skills).toHaveCount(6);
  await caption(page, 'A repository scanned: select a skill to read its SKILL.md');

  await skills.filter({ hasText: 'code-style' }).click();
  const skill = page.locator('article');
  await expect(skill.locator('.front-matter th')).toHaveText(['name', 'description', 'allowed-tools']);
  await caption(page, 'The front matter: a small table, a row a key', 2500);

  const markdown = skill.locator('.markdown');
  await expect(markdown.getByRole('heading', { level: 1 })).toHaveText('Code style');
  await caption(page, 'Then the Markdown, rendered: headings, lists, code', 2500);

  await skill.evaluate((article) => article.scrollTo(0, article.scrollHeight));
  await expect(markdown.locator('table')).toBeVisible();
  await caption(page, 'Tables, code blocks, quotes; a relative link, next to the SKILL.md', 2500);

  await skills.filter({ hasText: 'release-checklist' }).click();
  await expect(markdown.locator('ol > li')).toHaveCount(3);
  await caption(page, 'Front matter YAML cannot read: as it is, the Markdown still rendered', 2500);
  await pause(page);
});
