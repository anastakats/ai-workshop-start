// The base scenarios of spec/web.md, in a browser: what a user types, clicks and sees.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { EXAMPLE_COMMIT, FIXTURE } from '../tests/helpers.ts';

const FIXTURE_SKILLS = ['code-style', 'commits', 'no-description', 'no-name', 'plain-notes', 'release-checklist'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const field = (page: Page) => page.getByRole('textbox', { name: 'Repository' });
const scanButton = (page: Page) => page.getByRole('button', { name: 'Scan' });
const skills = (page: Page) => page.getByRole('navigation', { name: 'Skills' }).getByRole('button');

test('the empty page: the title, the field, Scan, and the placeholder', async ({ page }) => {
  await expect(page).toHaveTitle('Skill Atlas');
  await expect(page.getByRole('heading', { name: 'Skill Atlas' })).toBeVisible();
  await expect(field(page)).toHaveAttribute('placeholder', 'owner/repo or a GitHub link');
  await expect(scanButton(page)).toBeEnabled();
  await expect(page.getByText('Select a skill to read its SKILL.md.')).toBeVisible();
  await expect(skills(page)).toHaveCount(0);
  await expect(page.locator('#repository')).toBeHidden();
});

test('a local directory, scanned with Enter: the repository, its skills sorted by name, the warnings', async ({ page }) => {
  await field(page).fill(FIXTURE);
  await field(page).press('Enter');

  await expect(page.locator('#repository')).toHaveText('fixture6 skills');
  await expect(page.locator('nav .name')).toHaveText(FIXTURE_SKILLS);
  await expect(skills(page).filter({ hasText: 'commits' }).locator('.description')).toHaveText(
    'Write commit messages the way this repository does. Use for every commit.',
  );
  await expect(page.locator('.warning')).toHaveText([
    /^warning: \.agents\/skills\/plain-notes\/SKILL\.md: no front matter/,
    /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter/,
  ]);
  await expect(page.getByText('Select a skill to read its SKILL.md.')).toBeVisible();
});

test('selecting a skill shows its SKILL.md as it is, its link and its copies; another selection replaces it', async ({ page }) => {
  await field(page).fill(FIXTURE);
  await scanButton(page).click();

  const commits = skills(page).filter({ hasText: 'commits' });
  await commits.click();
  await expect(commits).toHaveAttribute('aria-current', 'true');
  const skill = page.locator('article');
  await expect(skill.getByRole('heading')).toHaveText('commits');
  const link = `${pathToFileURL(FIXTURE).href}/.claude/skills/commits/SKILL.md`;
  await expect(skill.getByRole('link')).toHaveAttribute('href', link);
  await expect(skill.locator('.copies')).toHaveText('also in .github/skills/commits/SKILL.md');
  // Front matter and Markdown, as text: not rendered.
  await expect(skill.locator('pre')).toHaveText(readFileSync(join(FIXTURE, '.claude/skills/commits/SKILL.md'), 'utf8'));

  const codeStyle = skills(page).filter({ hasText: 'code-style' });
  await codeStyle.click();
  await expect(codeStyle).toHaveAttribute('aria-current', 'true');
  await expect(commits).toHaveAttribute('aria-current', 'false');
  await expect(skill.getByRole('heading')).toHaveText('code-style');
  await expect(skill.locator('.copies')).toHaveCount(0);
});

test('owner/repo on GitHub: the skill, linked at the scanned commit, with its SKILL.md', async ({ page }) => {
  await field(page).fill('JetBrains/example');
  await scanButton(page).click();

  await expect(page.locator('#repository')).toHaveText('JetBrains/example1 skill');
  await expect(page.locator('nav .name')).toHaveText(['commits']);
  await skills(page).first().click();
  await expect(page.locator('article').getByRole('link')).toHaveAttribute(
    'href',
    `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
  );
  await expect(page.locator('article pre')).toContainText('# Commits');
});

test("an unreachable repository: the CLI's message, no skills; the next scan works", async ({ page }) => {
  await field(page).fill(FIXTURE);
  await scanButton(page).click();
  await skills(page).first().click();

  const missing = join(FIXTURE, 'no-such-directory');
  await field(page).fill(missing);
  await scanButton(page).click();
  await expect(page.locator('.error')).toHaveText(`Not a GitHub URL or a readable directory: ${missing}`);
  await expect(skills(page)).toHaveCount(0);
  await expect(page.locator('#repository')).toBeHidden();
  await expect(page.getByText('Select a skill to read its SKILL.md.')).toBeVisible();

  await field(page).fill(FIXTURE);
  await scanButton(page).click();
  await expect(page.locator('.error')).toHaveCount(0);
  await expect(skills(page)).toHaveCount(FIXTURE_SKILLS.length);
});

test('while it scans, Scan waits as Scanning…', async ({ page }) => {
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  await page.route('**/api/scan?*', async (route) => {
    await answered;
    await route.continue();
  });
  await field(page).fill(FIXTURE);
  await scanButton(page).click();
  await expect(page.getByRole('button', { name: 'Scanning…' })).toBeDisabled();
  answer();
  await expect(scanButton(page)).toBeEnabled();
  await expect(skills(page)).toHaveCount(FIXTURE_SKILLS.length);
});

test('a long description stays on one line, cut with …', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await field(page).fill(FIXTURE);
  await scanButton(page).click();

  const description = skills(page).filter({ hasText: 'commits' }).locator('.description');
  await expect(description).toHaveCSS('text-overflow', 'ellipsis');
  await expect(description).toHaveCSS('white-space', 'nowrap');
  const { scrollWidth, clientWidth } = await description.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);
});

const filter = (page: Page) => page.getByRole('searchbox', { name: 'Filter the skills' });

test('the filter: N of M, by name or description, case-insensitive, the matches highlighted', async ({ page }) => {
  await expect(filter(page)).toBeHidden();
  await field(page).fill(FIXTURE);
  await scanButton(page).click();
  await expect(filter(page)).toBeVisible();
  await expect(filter(page)).toHaveAttribute('placeholder', 'Filter the skills');
  await expect(page.locator('#matches')).toBeHidden();

  await filter(page).fill('COMMIT');
  await expect(page.locator('#matches')).toHaveText('2 of 6');
  await expect(page.locator('nav .name')).toHaveText(['code-style', 'commits']);
  await expect(page.locator('nav .name mark')).toHaveText(['commit']);
  const codeStyle = skills(page).filter({ hasText: 'code-style' }).locator('.description');
  await expect(codeStyle).toHaveText('…style. Use before committing Kotlin or Java changes.');
  await expect(codeStyle.locator('mark')).toHaveText(['commit']);
  await expect(skills(page).filter({ hasText: 'commits' }).locator('.description mark')).toHaveText(['commit', 'commit']);

  await filter(page).fill('no such skill');
  await expect(page.locator('#matches')).toHaveText('0 of 6');
  await expect(skills(page)).toHaveCount(0);

  await filter(page).fill('');
  await expect(page.locator('#matches')).toBeHidden();
  await expect(page.locator('nav .name')).toHaveText(FIXTURE_SKILLS);
  await expect(page.locator('nav mark')).toHaveCount(0);
});

test('the filter keeps the selection; a new scan clears it, an error hides it', async ({ page }) => {
  await field(page).fill(FIXTURE);
  await scanButton(page).click();
  await skills(page).filter({ hasText: 'commits' }).click();

  await filter(page).fill('commit');
  await expect(skills(page).filter({ hasText: 'commits' })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('article').getByRole('heading')).toHaveText('commits');
  await skills(page).filter({ hasText: 'code-style' }).click();
  await expect(page.locator('article').getByRole('heading')).toHaveText('code-style');

  await scanButton(page).click();
  await expect(filter(page)).toHaveValue('');
  await expect(skills(page)).toHaveCount(FIXTURE_SKILLS.length);

  await field(page).fill(join(FIXTURE, 'no-such-directory'));
  await scanButton(page).click();
  await expect(page.locator('.error')).toBeVisible();
  await expect(filter(page)).toBeHidden();
});
