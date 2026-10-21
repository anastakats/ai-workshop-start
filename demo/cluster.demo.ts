// A demo of clustering (spec/cluster.md): the skills in groups by a model, a group clustered again
// down to fewer than 3, back up by the path; then the whole tree on the command line. The model answers
// from the recording in tests/helpers.ts.
import { caption, expect, pause, terminal, test } from './demo.ts';

test('cluster the skills', async ({ page }) => {
  // A moment to think, as a model takes.
  await page.route('**/api/cluster', async (route) => {
    await page.waitForTimeout(1200);
    await route.continue();
  });
  await page.goto('/?repo=./fixture');
  const items = page.locator('#skills').getByRole('button');
  const cluster = page.locator('#cluster');
  await expect(items).toHaveCount(6);
  await caption(page, 'A repository scanned: 6 skills. Cluster asks a small model for groups');

  await cluster.click();
  await expect(cluster).toHaveText('Clustering…');
  await expect(items.locator('.name')).toHaveText(['Code and releases', 'Notes']);
  await caption(page, 'The skills in groups, the most skills first', 2500);

  await items.filter({ hasText: 'Code and releases' }).click();
  await expect(items).toHaveCount(3);
  await caption(page, 'A group opened: its skills; 3 or more, it can be clustered again');

  await cluster.click();
  await expect(items.locator('.name')).toHaveText(['Commits and releases', 'Code style']);
  await items.filter({ hasText: 'Commits and releases' }).click();
  await expect(cluster).toBeHidden();
  await caption(page, 'Fewer than 3 skills: the smallest group, nothing more to cluster', 2500);

  await items.filter({ hasText: 'commits' }).click();
  await expect(page.locator('article .title')).toHaveText('commits');
  await page.getByRole('list', { name: 'Groups' }).getByRole('button', { name: 'All skills' }).click();
  await expect(items.locator('.name')).toHaveText(['Code and releases', 'Notes']);
  await caption(page, 'The path goes back up; the skill stays on the right', 2500);

  const output = await terminal(page, 'SKILL_ATLAS_CLAUDE=tests/recorded-model.ts ./skill-atlas cluster ./fixture 2>/dev/null');
  expect(output).toContain('fixture · 6 skills · 2 groups');
  await caption(page, 'On the command line: the whole tree, every group down to fewer than 3', 3000);
  await pause(page);
});
