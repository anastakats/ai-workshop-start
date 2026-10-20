/** A skill found in a repository: its SKILL.md, its name and its copies. */
export type SkillFile = { path: string; name: string; copies: string[] };

/** Where agents keep a repository's own skills; the first one holds a skill found in several. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills'];

/**
 * Only `<root>/<name>/SKILL.md` under a skill root, named after its directory; any other
 * file is not a skill. The same name under several roots is one skill: the first root in
 * SKILL_ROOTS holds it, and the others are its copies.
 */
export function findSkills(paths: string[]): SkillFile[] {
  const found = [...paths]
    .sort()
    .flatMap((path) => {
      const root = SKILL_ROOTS.findIndex((root) => path.startsWith(`${root}/`));
      if (root < 0) return [];
      const [name, file, ...deeper] = path.slice(SKILL_ROOTS[root].length + 1).split('/');
      return file === 'SKILL.md' && deeper.length === 0 ? [{ path, name, root }] : [];
    })
    .sort((a, b) => a.root - b.root);
  const skills = new Map<string, SkillFile>();
  for (const { path, name } of found) {
    const skill = skills.get(name);
    if (skill) skill.copies.push(path);
    else skills.set(name, { path, name, copies: [] });
  }
  return [...skills.values()];
}
