// Clustering in the web view (spec/cluster.md), in a browser: the skills of ./fixture in groups, by the
// model answered from FIXTURE_CLUSTERS in tests/helpers.ts; one step at a time, each one screenshotted.
import { expect, test, type Page } from './steps.ts';
import { FIXTURE } from '../tests/helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

const items = (page: Page) => page.locator('#skills').getByRole('button');
const path = (page: Page) => page.getByRole('list', { name: 'Groups' });
const cluster = (page: Page) => page.locator('#cluster');
const filter = (page: Page) => page.getByRole('searchbox', { name: 'Filter the skills' });

async function scanFixture(page: Page) {
  await page.getByRole('textbox', { name: 'Repository' }).fill(FIXTURE);
  await page.getByRole('button', { name: 'Scan' }).click();
  await expect(items(page)).toHaveCount(6);
}

test('Cluster: the skills in groups; a group opened, clustered again down to fewer than 3; back up by the path', async ({ page, step }) => {
  // The model's answer held, to see the button while it thinks.
  let answer!: () => void;
  const held = new Promise<void>((resolve) => (answer = resolve));
  let asked = 0;
  await page.route('**/api/cluster', async (route) => {
    asked++;
    await held;
    await route.continue();
  });

  await step('scanned: All skills, and Cluster', async () => {
    await scanFixture(page);
    await expect(path(page).getByRole('listitem')).toHaveText(['All skills']);
    await expect(cluster(page)).toHaveText('Cluster');
    await expect(cluster(page)).toBeEnabled();
  });

  await step('clustering', async () => {
    await cluster(page).click();
    await expect(cluster(page)).toHaveText('Clustering…');
    await expect(cluster(page)).toBeDisabled();
    await expect(items(page)).toHaveCount(6);
  });

  await step('clustered: the groups, the most skills first', async () => {
    answer();
    await expect(items(page).locator('.name')).toHaveText(['Code and releases', 'Notes']);
    await expect(items(page).locator('.description')).toHaveText([
      '3 skills · code-style, commits, release-checklist',
      '3 skills · no-description, no-name, plain-notes',
    ]);
    await expect(cluster(page)).toHaveText('Ungroup');
  });

  await step('a group opened: its skills, and the path', async () => {
    await items(page).filter({ hasText: 'Code and releases' }).click();
    await expect(path(page).getByRole('listitem')).toHaveText(['All skills', 'Code and releases']);
    await expect(path(page).locator('[aria-current="page"]')).toHaveText('Code and releases');
    await expect(items(page).locator('.name')).toHaveText(['code-style', 'commits', 'release-checklist']);
    await expect(cluster(page)).toHaveText('Cluster');
  });

  await step('clustered again', async () => {
    await cluster(page).click();
    await expect(items(page).locator('.name')).toHaveText(['Commits and releases', 'Code style']);
    await expect(items(page).locator('.count')).toHaveText(['2 skills', '1 skill']);
  });

  await step('fewer than 3 skills: no Cluster', async () => {
    await items(page).filter({ hasText: 'Commits and releases' }).click();
    await expect(path(page).getByRole('listitem')).toHaveText(['All skills', 'Code and releases', 'Commits and releases']);
    await expect(items(page).locator('.name')).toHaveText(['commits', 'release-checklist']);
    await expect(cluster(page)).toBeHidden();
  });

  await step('a skill selected in it', async () => {
    await items(page).filter({ hasText: 'commits' }).click();
    await expect(page.locator('article .title')).toHaveText('commits');
  });

  await step('back up by the path: the groups as they were, the skill still on the right', async () => {
    await path(page).getByRole('button', { name: 'All skills' }).click();
    await expect(path(page).getByRole('listitem')).toHaveText(['All skills']);
    await expect(items(page).locator('.name')).toHaveText(['Code and releases', 'Notes']);
    await expect(page.locator('article .title')).toHaveText('commits');
    // Opened again: clustered as before, the model not asked again.
    await items(page).filter({ hasText: 'Code and releases' }).click();
    await expect(items(page).locator('.name')).toHaveText(['Commits and releases', 'Code style']);
    expect(asked).toBe(2);
    await path(page).getByRole('button', { name: 'All skills' }).click();
  });

  await step('Ungroup: every skill again', async () => {
    await cluster(page).click();
    await expect(items(page).locator('.name')).toHaveText(['code-style', 'commits', 'no-description', 'no-name', 'plain-notes', 'release-checklist']);
    await expect(items(page).filter({ hasText: 'commits' })).toHaveAttribute('aria-current', 'true');
    await expect(cluster(page)).toHaveText('Cluster');
  });
});

test('the filter in a clustered group: its skills that match; a new scan forgets the groups', async ({ page, step }) => {
  await step('clustered, Notes opened', async () => {
    await scanFixture(page);
    await cluster(page).click();
    await items(page).filter({ hasText: 'Notes' }).click();
    await cluster(page).click();
    await expect(items(page).locator('.name')).toHaveText(['Incomplete front matter', 'No front matter']);
  });

  await step('filtered: the skills of Notes that match, N of M', async () => {
    await filter(page).fill('no-');
    await expect(items(page).locator('.name')).toHaveText(['no-description', 'no-name']);
    await expect(page.locator('#matches')).toHaveText('2 of 3');
  });

  await step('the filter emptied: the groups again', async () => {
    await filter(page).fill('');
    await expect(items(page).locator('.name')).toHaveText(['Incomplete front matter', 'No front matter']);
  });

  await step('a new scan: All skills, not clustered', async () => {
    await page.getByRole('button', { name: 'Scan' }).click();
    await expect(path(page).getByRole('listitem')).toHaveText(['All skills']);
    await expect(items(page)).toHaveCount(6);
    await expect(cluster(page)).toHaveText('Cluster');
  });
});

test('fewer than 3 skills in the repository: nothing to cluster', async ({ page, step }) => {
  await step('JetBrains/example scanned: no Cluster', async () => {
    await page.getByRole('textbox', { name: 'Repository' }).fill('JetBrains/example');
    await page.getByRole('button', { name: 'Scan' }).click();
    await expect(items(page)).toHaveCount(1);
    await expect(page.locator('#groups')).toBeHidden();
  });
});

test('the model fails: its message, the skills as they were, Cluster again', async ({ page, step }) => {
  await page.route('**/api/cluster', (route) =>
    route.fulfill({ status: 400, json: { error: 'The model failed (haiku, exit code 1): JetBrains Central is not installed' } }),
  );

  await step('Cluster clicked: the error', async () => {
    await scanFixture(page);
    await cluster(page).click();
    await expect(page.locator('#messages .error')).toHaveText('The model failed (haiku, exit code 1): JetBrains Central is not installed');
    await expect(items(page)).toHaveCount(6);
    await expect(cluster(page)).toHaveText('Cluster');
    await expect(cluster(page)).toBeEnabled();
    // The scan has no warnings: ./fixture's malformed front matter is not one.
    await expect(page.locator('#messages .warning')).toHaveCount(0);
  });

  await step('clicked again: one error, not two', async () => {
    await cluster(page).click();
    await expect(page.locator('#messages .error')).toHaveCount(1);
  });
});
