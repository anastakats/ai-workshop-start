// The base scenarios of spec/web.md, in a browser: what a user types, clicks and sees; one step at
// a time, each one screenshotted (e2e/steps.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXAMPLE_COMMIT, FIXTURE } from '../tests/helpers.ts';
import { expect, test, type Page } from './steps.ts';

const FIXTURE_SKILLS = ['code-style', 'commits', 'no-description', 'no-name', 'plain-notes', 'release-checklist'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const field = (page: Page) => page.getByRole('textbox', { name: 'Repository' });
const scanButton = (page: Page) => page.getByRole('button', { name: 'Scan' });
const skills = (page: Page) => page.getByRole('navigation', { name: 'Skills' }).locator('#skills').getByRole('button');

test('the empty page: the title, the field, Scan, and the placeholder', async ({ page, step }) => {
  await step('the empty page', async () => {
    await expect(page).toHaveTitle('Skill Atlas');
    await expect(page.getByRole('heading', { name: 'Skill Atlas' })).toBeVisible();
    await expect(field(page)).toHaveAttribute('placeholder', 'owner/repo or a GitHub link');
    await expect(scanButton(page)).toBeEnabled();
    await expect(page.getByText('Select a skill to read its SKILL.md.')).toBeVisible();
    await expect(skills(page)).toHaveCount(0);
    await expect(page.locator('#repository')).toBeHidden();
    // Nothing above the header: the icons' sprite takes no room.
    expect((await page.locator('header').boundingBox())?.y).toBe(0);
  });
});

test('a local directory, scanned with Enter: the repository, its skills sorted by name, the warnings', async ({ page, step }) => {
  await step('a local directory typed', async () => {
    await field(page).fill(FIXTURE);
    await expect(field(page)).toHaveValue(FIXTURE);
  });

  await step('scanned with Enter', async () => {
    await field(page).press('Enter');
    await expect(page.locator('#repository')).toHaveText('fixture6 skills');
    // The most recently updated skill's day: commits, in tests/helpers.ts.
    await expect(page.locator('#updated')).toHaveText('last updated 2026-10-14');
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
});

test('selecting a skill shows its SKILL.md as it is, its link and its copies; another selection replaces it', async ({ page, step }) => {
  await step('scanned', async () => {
    await field(page).fill(FIXTURE);
    await scanButton(page).click();
    await expect(skills(page)).toHaveCount(FIXTURE_SKILLS.length);
  });

  const commits = skills(page).filter({ hasText: 'commits' });
  const skill = page.locator('article');
  await step('commits selected', async () => {
    await commits.click();
    await expect(commits).toHaveAttribute('aria-current', 'true');
    await expect(skill.getByRole('heading')).toHaveText('commits');
    const link = `${pathToFileURL(FIXTURE).href}/.claude/skills/commits/SKILL.md`;
    await expect(skill.getByRole('link')).toHaveAttribute('href', link);
    await expect(skill.locator('.copies')).toHaveText('also in .github/skills/commits/SKILL.md');
    await expect(skill.locator('.updated')).toHaveText('updated 2026-10-14');
    // Front matter and Markdown, as text: not rendered.
    await expect(skill.locator('pre')).toHaveText(readFileSync(join(FIXTURE, '.claude/skills/commits/SKILL.md'), 'utf8'));
  });

  await step('code-style selected instead', async () => {
    const codeStyle = skills(page).filter({ hasText: 'code-style' });
    await codeStyle.click();
    await expect(codeStyle).toHaveAttribute('aria-current', 'true');
    await expect(commits).toHaveAttribute('aria-current', 'false');
    await expect(skill.getByRole('heading')).toHaveText('code-style');
    await expect(skill.locator('.copies')).toHaveCount(0);
    await expect(skill.locator('.updated')).toHaveText('updated 2026-10-02');
  });
});

test('owner/repo on GitHub: the skill, linked at the scanned commit, with its SKILL.md', async ({ page, step }) => {
  await step('JetBrains/example scanned', async () => {
    await field(page).fill('JetBrains/example');
    await scanButton(page).click();
    await expect(page.locator('#repository')).toHaveText('JetBrains/example1 skill');
    await expect(page.locator('#updated')).toHaveText('last updated 2026-10-12');
    await expect(page.locator('nav .name')).toHaveText(['commits']);
  });

  await step('its skill selected', async () => {
    await skills(page).first().click();
    await expect(page.locator('article').getByRole('link')).toHaveAttribute(
      'href',
      `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    );
    await expect(page.locator('article pre')).toContainText('# Commits');
    // On GitHub, when the skill was last committed, in UTC.
    await expect(page.locator('article .updated')).toHaveText('updated 2026-10-12');
  });
});

test("an unreachable repository: the CLI's message, no skills; the next scan works", async ({ page, step }) => {
  await step('a skill selected', async () => {
    await field(page).fill(FIXTURE);
    await scanButton(page).click();
    await skills(page).first().click();
    await expect(page.locator('article').getByRole('heading')).toHaveText('code-style');
  });

  await step('an unreachable repository', async () => {
    const missing = join(FIXTURE, 'no-such-directory');
    await field(page).fill(missing);
    await scanButton(page).click();
    await expect(page.locator('.error')).toHaveText(`Not a GitHub URL or a readable directory: ${missing}`);
    await expect(skills(page)).toHaveCount(0);
    await expect(page.locator('#repository')).toBeHidden();
    await expect(page.locator('#updated')).toBeHidden();
    await expect(page.getByText('Select a skill to read its SKILL.md.')).toBeVisible();
  });

  await step('the next scan works', async () => {
    await field(page).fill(FIXTURE);
    await scanButton(page).click();
    await expect(page.locator('.error')).toHaveCount(0);
    await expect(skills(page)).toHaveCount(FIXTURE_SKILLS.length);
  });
});

test('while it scans, Scan waits as Scanning…', async ({ page, step }) => {
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  await page.route('**/api/scan?*', async (route) => {
    await answered;
    await route.continue();
  });
  await step('scanning', async () => {
    await field(page).fill(FIXTURE);
    await scanButton(page).click();
    await expect(page.getByRole('button', { name: 'Scanning…' })).toBeDisabled();
  });

  await step('scanned', async () => {
    answer();
    await expect(scanButton(page)).toBeEnabled();
    await expect(skills(page)).toHaveCount(FIXTURE_SKILLS.length);
  });
});

test('a long description stays on one line, cut with …', async ({ page, step }) => {
  await step('scanned in a narrow window', async () => {
    await page.setViewportSize({ width: 900, height: 700 });
    await field(page).fill(FIXTURE);
    await scanButton(page).click();

    const description = skills(page).filter({ hasText: 'commits' }).locator('.description');
    await expect(description).toHaveCSS('text-overflow', 'ellipsis');
    await expect(description).toHaveCSS('white-space', 'nowrap');
    const { scrollWidth, clientWidth } = await description.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });
});

const filter = (page: Page) => page.getByRole('searchbox', { name: 'Filter the skills' });

test('the filter: N of M, by name or description, case-insensitive, the matches highlighted', async ({ page, step }) => {
  await step('scanned: the filter, empty', async () => {
    await expect(filter(page)).toBeHidden();
    await field(page).fill(FIXTURE);
    await scanButton(page).click();
    await expect(filter(page)).toBeVisible();
    await expect(filter(page)).toHaveAttribute('placeholder', 'Filter the skills');
    await expect(page.locator('#matches')).toBeHidden();
  });

  await step('COMMIT: 2 of 6, highlighted', async () => {
    await filter(page).fill('COMMIT');
    await expect(page.locator('#matches')).toHaveText('2 of 6');
    await expect(page.locator('nav .name')).toHaveText(['code-style', 'commits']);
    await expect(page.locator('nav .name mark')).toHaveText(['commit']);
    const codeStyle = skills(page).filter({ hasText: 'code-style' }).locator('.description');
    await expect(codeStyle).toHaveText('…style. Use before committing Kotlin or Java changes.');
    await expect(codeStyle.locator('mark')).toHaveText(['commit']);
    await expect(skills(page).filter({ hasText: 'commits' }).locator('.description mark')).toHaveText(['commit', 'commit']);
  });

  await step('no such skill: 0 of 6', async () => {
    await filter(page).fill('no such skill');
    await expect(page.locator('#matches')).toHaveText('0 of 6');
    await expect(skills(page)).toHaveCount(0);
  });

  await step('emptied: every skill', async () => {
    await filter(page).fill('');
    await expect(page.locator('#matches')).toBeHidden();
    await expect(page.locator('nav .name')).toHaveText(FIXTURE_SKILLS);
    await expect(page.locator('nav mark')).toHaveCount(0);
  });
});

test('the filter keeps the selection; a new scan clears it, an error hides it', async ({ page, step }) => {
  await step('commits selected', async () => {
    await field(page).fill(FIXTURE);
    await scanButton(page).click();
    await skills(page).filter({ hasText: 'commits' }).click();
    await expect(page.locator('article').getByRole('heading')).toHaveText('commits');
  });

  await step('filtered: the selection kept', async () => {
    await filter(page).fill('commit');
    await expect(skills(page).filter({ hasText: 'commits' })).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('article').getByRole('heading')).toHaveText('commits');
  });

  await step('code-style selected in the filtered list', async () => {
    await skills(page).filter({ hasText: 'code-style' }).click();
    await expect(page.locator('article').getByRole('heading')).toHaveText('code-style');
  });

  await step('a new scan: the filter emptied', async () => {
    await scanButton(page).click();
    await expect(filter(page)).toHaveValue('');
    await expect(skills(page)).toHaveCount(FIXTURE_SKILLS.length);
  });

  await step('an error: the filter hidden', async () => {
    await field(page).fill(join(FIXTURE, 'no-such-directory'));
    await scanButton(page).click();
    await expect(page.locator('.error')).toBeVisible();
    await expect(filter(page)).toBeHidden();
  });
});

const organization = (page: Page) => page.getByRole('region', { name: 'Organization' });

test('github.com/<org>: the number of repositories, a progress bar, then a few with their skills and +K more', async ({ page, step }) => {
  const card = organization(page);
  const rows = card.locator('#org-result button');
  await step('github.com/JetBrains scanned', async () => {
    await field(page).fill('github.com/JetBrains');
    await scanButton(page).click();

    await expect(card.getByRole('heading')).toHaveText('Scan the organization');
    await expect(card.locator('.org')).toHaveText('github.com/JetBrains7 repositories');
    await expect(card.getByRole('progressbar')).toHaveJSProperty('value', 7);
    await expect(card.getByRole('progressbar')).toHaveJSProperty('max', 7);
    await expect(card.locator('.among')).toHaveText('4 with skills, among them');
    // Uppercase, as in the mockup: only the look.
    await expect(card.locator('.among')).toHaveCSS('text-transform', 'uppercase');
    await expect(rows).toHaveText(['mps4 skills', 'kotlin3 skills', 'ai-tools2 skills', '+1 more']);
    await expect(page.locator('.warning')).toHaveText([/^warning: JetBrains\/moved: Not found on GitHub/]);
    await expect(page.getByRole('navigation', { name: 'Skills' })).toBeHidden();
  });

  await step('+1 more: every repository', async () => {
    await card.getByRole('button', { name: '+1 more' }).click();
    await expect(rows).toHaveText(['mps4 skills', 'kotlin3 skills', 'ai-tools2 skills', 'example1 skill']);
  });
});

test('while an organization scans: Scanning…, its name and a progress bar, then a repository from it is scanned on a click', async ({ page, step }) => {
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  await page.route('**/api/organization?*', async (route) => {
    await answered;
    await route.continue();
  });
  await step('scanning the organization', async () => {
    await field(page).fill('https://github.com/JetBrains/');
    await scanButton(page).click();
    await expect(page.getByRole('button', { name: 'Scanning…' })).toBeDisabled();
    await expect(organization(page).locator('#org-id')).toHaveText('github.com/JetBrains');
    await expect(organization(page).getByRole('progressbar')).toBeVisible();
    await expect(page.locator('#updated')).toBeHidden();
  });

  await step('the organization scanned', async () => {
    answer();
    await expect(scanButton(page)).toBeEnabled();
    await page.getByRole('button', { name: '+1 more' }).click();
    await expect(page.getByRole('button', { name: /^example/ })).toBeVisible();
  });

  await step('a repository from it scanned', async () => {
    await page.getByRole('button', { name: /^example/ }).click();
    await expect(field(page)).toHaveValue('JetBrains/example');
    await expect(organization(page)).toBeHidden();
    await expect(page.locator('#repository')).toHaveText('JetBrains/example1 skill');
    await expect(page.locator('#updated')).toHaveText('last updated 2026-10-12');
    await expect(page.locator('nav .name')).toHaveText(['commits']);
    await expect(page.getByRole('searchbox', { name: 'Filter the skills' })).toBeVisible();
  });
});

test('an organization GitHub cannot answer: the message, no organization; a repository scans again', async ({ page, step }) => {
  await step('the message', async () => {
    await field(page).fill('github.com/not-answered');
    await scanButton(page).click();
    await expect(page.locator('.error')).toHaveText('Cannot reach GitHub: not recorded: https://api.github.com/users/not-answered');
    await expect(organization(page)).toBeHidden();
    await expect(skills(page)).toHaveCount(0);
  });

  await step('a repository scans again', async () => {
    await field(page).fill(FIXTURE);
    await scanButton(page).click();
    await expect(page.locator('.error')).toHaveCount(0);
    await expect(skills(page)).toHaveCount(FIXTURE_SKILLS.length);
  });
});

test('3 or fewer with skills: all of them, no +K more; none: No repositories with skills', async ({ page, step }) => {
  const answers: Record<string, unknown[]> = {
    Few: [{ name: 'a', skills: 1 }, { name: 'b', skills: 5 }].map(({ name, skills }) => ({ id: `Few/${name}`, name, url: `https://github.com/Few/${name}`, skills })),
    None: [],
  };
  await page.route('**/api/organization?*', (route) => {
    const id = new URL(route.request().url()).searchParams.get('org')!.split('/').pop()!;
    const organization = { id, url: `https://github.com/${id}`, repositories: 2 };
    const lines = [{ organization }, { scanned: 1 }, { scanned: 2 }, { organization, repositories: answers[id], warnings: [] }];
    return route.fulfill({ contentType: 'application/x-ndjson', body: lines.map((line) => `${JSON.stringify(line)}\n`).join('') });
  });
  const card = organization(page);

  await step('2 with skills: both', async () => {
    await field(page).fill('github.com/Few');
    await scanButton(page).click();
    await expect(card.locator('.among')).toHaveText('2 with skills');
    await expect(card.locator('#org-result button')).toHaveText(['a1 skill', 'b5 skills']);
  });

  await step('none: No repositories with skills', async () => {
    await field(page).fill('github.com/None');
    await scanButton(page).click();
    await expect(card.locator('.among')).toHaveText('No repositories with skills');
    await expect(card.locator('#org-result button')).toHaveCount(0);
  });
});

const examples = (page: Page) => page.locator('#start');

test('before a scan, the examples: a click scans one; hidden once scanned, back after an error', async ({ page, step }) => {
  await step('the examples', async () => {
    await expect(examples(page)).toBeVisible();
    await expect(examples(page).locator('p').first()).toHaveText('Scan a repository to see its skills. Try:');
    await expect(examples(page).getByRole('button')).toHaveText(['JetBrains/kotlin', 'github.com/JetBrains']);
    await expect(examples(page).locator('li')).toHaveText(['JetBrains/kotlina repository', 'github.com/JetBrainsan organization']);
    await expect(examples(page).locator('p').last()).toHaveText('or the path to a local directory.');
  });

  await step('JetBrains/kotlin clicked: typed and scanned', async () => {
    const asked: string[] = [];
    await page.route('**/api/scan?*', (route) => {
      asked.push(new URL(route.request().url()).searchParams.get('repo')!);
      return route.fulfill({ json: { repository: { id: 'JetBrains/kotlin' }, skills: [], warnings: [] } });
    });
    await examples(page).getByRole('button', { name: 'JetBrains/kotlin' }).click();
    await expect(field(page)).toHaveValue('JetBrains/kotlin');
    await expect(page.locator('#repository')).toHaveText('JetBrains/kotlin0 skills');
    expect(asked).toEqual(['JetBrains/kotlin']);
    await expect(examples(page)).toBeHidden();
    await page.unroute('**/api/scan?*');
  });

  await step('an error: the examples again', async () => {
    await field(page).fill(join(FIXTURE, 'no-such-directory'));
    await scanButton(page).click();
    await expect(page.locator('.error')).toBeVisible();
    await expect(examples(page)).toBeVisible();
  });

  await step('github.com/JetBrains clicked: the organization scanned', async () => {
    await examples(page).getByRole('button', { name: 'github.com/JetBrains' }).click();
    await expect(field(page)).toHaveValue('github.com/JetBrains');
    await expect(organization(page).locator('.among')).toHaveText('4 with skills, among them');
    await expect(examples(page)).toBeHidden();
  });
});

const article = (page: Page) => page.locator('article');
const query = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);

test('the URL: what is scanned and the selected skill; reloaded, the same; Back and Forward, from one scan to another; only the latest scan shown', async ({ page, step }) => {
  await step('scanned: ?repo=', async () => {
    await field(page).fill(FIXTURE);
    await scanButton(page).click();
    await expect(skills(page)).toHaveCount(FIXTURE_SKILLS.length);
    expect(query(page)).toEqual({ repo: FIXTURE });
    // Slashes as they are: the link reads as what was typed.
    expect(page.url()).toContain(`?repo=${FIXTURE}`);
  });

  await step('commits selected: &skill=commits', async () => {
    await skills(page).filter({ hasText: 'commits' }).click();
    expect(query(page)).toEqual({ repo: FIXTURE, skill: 'commits' });
  });

  await step('reloaded: the same scan and skill', async () => {
    await page.reload();
    await expect(field(page)).toHaveValue(FIXTURE);
    await expect(skills(page).filter({ hasText: 'commits' })).toHaveAttribute('aria-current', 'true');
    await expect(article(page).getByRole('heading')).toHaveText('commits');
  });

  await step('another repository scanned: no skill', async () => {
    await field(page).fill('JetBrains/example');
    await scanButton(page).click();
    await expect(page.locator('#repository')).toHaveText('JetBrains/example1 skill');
    expect(query(page)).toEqual({ repo: 'JetBrains/example' });
    expect(page.url()).toMatch(/\/\?repo=JetBrains\/example$/);
  });

  await step('Back: the scan before, its skill selected', async () => {
    await page.goBack();
    await expect(field(page)).toHaveValue(FIXTURE);
    await expect(page.locator('#repository')).toHaveText('fixture6 skills');
    await expect(article(page).getByRole('heading')).toHaveText('commits');
  });

  await step('Back again: the empty page', async () => {
    await page.goBack();
    await expect(field(page)).toHaveValue('');
    await expect(skills(page)).toHaveCount(0);
    await expect(page.locator('#repository')).toBeHidden();
    await expect(examples(page)).toBeVisible();
  });

  await step('Forward: the scan again', async () => {
    await page.goForward();
    await expect(field(page)).toHaveValue(FIXTURE);
    await expect(article(page).getByRole('heading')).toHaveText('commits');
  });

  await step('Back to the empty page while a scan answers: the empty page stays', async () => {
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route('**/api/scan?*', async (route) => {
      await answered;
      await route.continue();
    });
    await page.goBack();
    await expect(field(page)).toHaveValue('');
    await page.goForward();
    await expect(page.getByRole('button', { name: 'Scanning…' })).toBeDisabled();
    await page.goBack();
    await expect(scanButton(page)).toBeEnabled();
    answer();
    await page.waitForResponse('**/api/scan?*');
    await expect(skills(page)).toHaveCount(0);
    await expect(examples(page)).toBeVisible();
    await page.unroute('**/api/scan?*');
    await page.goForward();
    await expect(article(page).getByRole('heading')).toHaveText('commits');
  });

  await step('the same repository scanned again: no new entry, the skill dropped', async () => {
    await scanButton(page).click();
    await expect(skills(page)).toHaveCount(FIXTURE_SKILLS.length);
    expect(query(page)).toEqual({ repo: FIXTURE });
    await page.goBack();
    await expect(field(page)).toHaveValue('');
  });
});

test('the URL: a skill of the earlier scan selected while another scan answers, dropped once that scan is shown', async ({ page, step }) => {
  await step('scanned', async () => {
    await field(page).fill(FIXTURE);
    await scanButton(page).click();
    await expect(skills(page)).toHaveCount(FIXTURE_SKILLS.length);
  });

  await step('another repository scanning, commits selected meanwhile', async () => {
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    await page.route('**/api/scan?*', async (route) => {
      await answered;
      await route.continue();
    });
    await field(page).fill('JetBrains/example');
    await scanButton(page).click();
    await expect(page.getByRole('button', { name: 'Scanning…' })).toBeDisabled();
    await skills(page).filter({ hasText: 'commits' }).click();
    answer();
    await expect(page.locator('#repository')).toHaveText('JetBrains/example1 skill');
    await page.unroute('**/api/scan?*');
    await expect(page.getByText('Select a skill to read its SKILL.md.')).toBeVisible();
    expect(query(page)).toEqual({ repo: 'JetBrains/example' });
  });
});

test('a shared link: the repository scanned and its skill selected; a skill it does not have, none; an organization', async ({ page, step }) => {
  await step('?repo=JetBrains/example&skill=commits opened', async () => {
    await page.goto('/?repo=JetBrains/example&skill=commits');
    await expect(field(page)).toHaveValue('JetBrains/example');
    await expect(skills(page).filter({ hasText: 'commits' })).toHaveAttribute('aria-current', 'true');
    await expect(article(page).getByRole('heading')).toHaveText('commits');
  });

  await step('a skill it does not have: none selected, dropped from the URL', async () => {
    await page.goto('/?repo=JetBrains/example&skill=no-such-skill');
    await expect(skills(page)).toHaveCount(1);
    await expect(page.getByText('Select a skill to read its SKILL.md.')).toBeVisible();
    expect(query(page)).toEqual({ repo: 'JetBrains/example' });
  });

  await step('?repo=github.com/JetBrains: the organization', async () => {
    await page.goto('/?repo=github.com/JetBrains');
    await expect(field(page)).toHaveValue('github.com/JetBrains');
    await expect(organization(page).locator('.among')).toHaveText('4 with skills, among them');
  });

  await step('a repository from it: a new entry, Back to the organization', async () => {
    await organization(page).getByRole('button', { name: '+1 more' }).click();
    await organization(page).getByRole('button', { name: /^example/ }).click();
    await expect(page.locator('#repository')).toHaveText('JetBrains/example1 skill');
    expect(query(page)).toEqual({ repo: 'JetBrains/example' });
    await page.goBack();
    await expect(field(page)).toHaveValue('github.com/JetBrains');
    await expect(organization(page).locator('.among')).toHaveText('4 with skills, among them');
  });

  await step('Back while a scan answers: the later scan shown, not the earlier', async () => {
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    let asked = 0;
    await page.route('**/api/scan?*', async (route) => {
      asked++;
      await answered;
      await route.continue();
    });
    await organization(page).getByRole('button', { name: '+1 more' }).click();
    await organization(page).getByRole('button', { name: /^example/ }).click();
    await expect.poll(() => asked).toBe(1);
    await page.goBack();
    await expect(organization(page).locator('.among')).toHaveText('4 with skills, among them');
    answer();
    await page.waitForResponse('**/api/scan?*');
    await expect(scanButton(page)).toBeEnabled();
    await expect(organization(page)).toBeVisible();
    await expect(field(page)).toHaveValue('github.com/JetBrains');
    await expect(page.locator('#repository')).toBeHidden();
  });
});

test("Copy link: the selected skill's link on the clipboard, Copied for a moment; Cannot copy without the clipboard", async ({ page, context, step }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // The moment Copied stays, run by the test: the same screenshots on every run.
  await page.clock.install();
  await page.goto('/');
  const copy = article(page).getByRole('button', { name: /Copy link|Copied|Cannot copy/ });
  const link = `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`;

  await step('commits selected: Copy link, next to its link', async () => {
    await field(page).fill('JetBrains/example');
    await scanButton(page).click();
    await skills(page).filter({ hasText: 'commits' }).click();
    await expect(copy).toHaveText('Copy link');
    await expect(copy).toHaveAttribute('title', 'Copy the link to this SKILL.md');
    await expect(article(page).locator('.link').getByRole('link')).toHaveAttribute('href', link);
  });

  await step('clicked: Copied, the link on the clipboard', async () => {
    await copy.click();
    await expect(copy).toHaveText('Copied');
    // As strings: the e2e tests are typed without the DOM.
    expect(await page.evaluate('navigator.clipboard.readText()')).toBe(link);
  });

  await step('a moment later: Copy link again', async () => {
    await page.clock.runFor(2000);
    await expect(copy).toHaveText('Copy link');
  });

  await step('the clipboard refused: Cannot copy', async () => {
    await page.evaluate("navigator.clipboard.writeText = () => Promise.reject(new Error('denied'))");
    await copy.click();
    await expect(copy).toHaveText('Cannot copy');
    await page.clock.runFor(2000);
    await expect(copy).toHaveText('Copy link');
  });
});
