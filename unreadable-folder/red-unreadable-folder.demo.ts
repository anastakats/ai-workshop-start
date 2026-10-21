// Red agent: one unreadable folder anywhere in a local directory, and its whole scan fails.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { caption, expect, pause, test, type } from './demo.ts';

test('red unreadable folder', async ({ page }) => {
  // A project with a skill, and a database folder only its container can read, as Docker leaves one.
  const project = join(mkdtempSync(join(tmpdir(), 'red-')), 'my-app');
  mkdirSync(join(project, '.claude/skills/deploy'), { recursive: true });
  writeFileSync(join(project, '.claude/skills/deploy/SKILL.md'), '---\nname: deploy\ndescription: Deploy the app\n---\n# Deploy\n');
  mkdirSync(join(project, 'pgdata'));
  try {
    await page.goto('/');
    await caption(page, 'my-app: one skill, .claude/skills/deploy, and a folder pgdata/');
    await type(page.getByPlaceholder('owner/repo or a GitHub link'), project);
    await page.getByRole('button', { name: 'Scan' }).click();
    await expect(page.locator('#skills').getByRole('button')).toHaveText([/deploy/]);
    await caption(page, 'Scanned: the skill deploy', 2500);

    chmodSync(join(project, 'pgdata'), 0o000);
    await caption(page, 'Now pgdata/ cannot be read, as a database container leaves it', 2500);
    await page.getByRole('button', { name: 'Scan' }).click();
    await expect(page.locator('.error')).toHaveText(/Not a GitHub URL or a readable directory/);
    await expect(page.locator('#skills').getByRole('button')).toHaveCount(0);
    await caption(page, 'Expected: deploy, and a warning for pgdata/; actual: no skills, "not a readable directory"', 4000);
    await pause(page);
  } finally {
    chmodSync(join(project, 'pgdata'), 0o755);
    rmSync(join(project, '..'), { recursive: true, force: true });
  }
});
