// A demo of a local directory with a folder that cannot be read (spec/analysis.md): its skills all
// the same; a warning only for a folder in a skill root, the error only for the directory itself.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { caption, expect, pause, test, type } from './demo.ts';

test('unreadable folder', async ({ page }) => {
  // A project with two skills, and a database folder only its container can read, as Docker leaves one.
  const project = join(mkdtempSync(join(tmpdir(), 'demo-')), 'my-app');
  for (const name of ['deploy', 'secret']) {
    mkdirSync(join(project, `.claude/skills/${name}`), { recursive: true });
    writeFileSync(join(project, `.claude/skills/${name}/SKILL.md`), `---\nname: ${name}\ndescription: The ${name} skill\n---\n# ${name}\n`);
  }
  mkdirSync(join(project, 'pgdata'));
  chmodSync(join(project, 'pgdata'), 0o000);
  const skills = page.locator('#skills').getByRole('button');
  try {
    await page.goto('/');
    await caption(page, 'my-app: two skills in .claude/skills, and pgdata/, which cannot be read');
    await type(page.getByRole('textbox', { name: 'Repository' }), project);
    await page.getByRole('button', { name: 'Scan' }).click();
    await expect(skills).toHaveText([/deploy/, /secret/]);
    await expect(page.locator('.warning')).toHaveCount(0);
    await caption(page, 'Both skills: pgdata/ can never hold a skill, so it is not read', 2500);

    chmodSync(join(project, '.claude/skills/secret'), 0o000);
    await caption(page, 'Now a skill folder cannot be read: .claude/skills/secret');
    await page.getByRole('button', { name: 'Scan' }).click();
    await expect(skills).toHaveText([/deploy/]);
    await expect(page.locator('.warning')).toHaveText([/\.claude\/skills\/secret: found in the directory, but cannot be read: EACCES/]);
    await caption(page, 'The skills that can be read, and a warning for the one that cannot', 3000);
    await pause(page);
  } finally {
    chmodSync(join(project, 'pgdata'), 0o755);
    chmodSync(join(project, '.claude/skills/secret'), 0o755);
    rmSync(join(project, '..'), { recursive: true, force: true });
  }
});
