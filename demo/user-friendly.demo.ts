// A demo of a friendlier web view (spec/web.md): examples before a scan, the scan and the selected
// skill in the URL, to reload or share, and Copy link.
import { caption, expect, pause, test } from './demo.ts';

test('user friendly', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const examples = page.locator('#start');
  await expect(examples).toBeVisible();
  await caption(page, 'Not sure what to type? Examples, before a scan');

  await examples.getByRole('button', { name: 'github.com/JetBrains' }).click();
  const card = page.getByRole('region', { name: 'Organization' });
  await expect(card.locator('.among')).toHaveText('4 with skills, among them');
  await caption(page, 'A click scans one: here, an organization');

  await card.getByRole('button', { name: '+1 more' }).click();
  await card.getByRole('button', { name: /^example/ }).click();
  const skills = page.locator('#skills').getByRole('button');
  await skills.filter({ hasText: 'commits' }).click();
  await expect(page.locator('article').getByRole('heading')).toHaveText('commits');
  const search = () => decodeURIComponent(new URL(page.url()).search);
  expect(search()).toBe('?repo=JetBrains/example&skill=commits');
  await caption(page, `In the URL: ${search()}`, 2500);

  await page.reload();
  await expect(page.locator('article').getByRole('heading')).toHaveText('commits');
  await caption(page, 'Reloaded, or shared: the same repository, the same skill');

  await page.goBack();
  await expect(card.locator('.among')).toHaveText('4 with skills, among them');
  await caption(page, 'Back: the organization again');
  await page.goForward();
  await expect(page.locator('article').getByRole('heading')).toHaveText('commits');

  const copy = page.locator('article .copy');
  await copy.click();
  // Out of the way: Copied, in sight.
  await page.mouse.move(700, 600);
  await expect(copy).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^https:\/\/github\.com\/JetBrains\/example\/blob\/.*\/SKILL\.md$/);
  await caption(page, 'Copy link: the SKILL.md link on the clipboard, Copied');
  await expect(copy).toHaveText('Copy link');
  await pause(page, 500);
});
