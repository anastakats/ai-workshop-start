// The skills in groups, by a model: one request a level, the skills' names and descriptions in, the
// groups out. Smaller groups are clustered the same way, until each has fewer than SMALLEST skills.
// No Node APIs here: the model comes in as `Ask`.
import { AtlasError } from './errors.ts';

/** What a model is asked for groups with: the skill's id, its name and its description. */
export type Clustered = { id: string; name: string; description: string };

/** The prompt to the model, its answer: the text it printed. */
export type Ask = (prompt: string, signal?: AbortSignal) => Promise<string>;

/** One group: its title, the ids of its skills. */
export type Group = { title: string; skills: string[] };

/** A group, and the groups it was clustered into; none when it has fewer than SMALLEST skills, or the model failed. */
export type Tree<S extends Clustered> = { title: string; skills: S[]; groups: Tree<S>[] };

/** A group with fewer skills is not clustered again. */
export const SMALLEST = 3;

/** The skills as the model reads them: numbered, a line each, `N. name — description`. */
export function clusterPrompt(skills: Clustered[]): string {
  const lines = skills.map(({ name, description }, index) => {
    const text = description.replace(/\s+/g, ' ').trim();
    return `${index + 1}. ${name}${text ? ` — ${text}` : ''}`;
  });
  return [
    `Group these ${skills.length} agent skills by what they are for: 2 to 5 groups, each skill in exactly one group.`,
    'Give each group a short title, 1 to 4 words, that tells it from the others.',
    'Answer with JSON only, no other text: {"groups": [{"title": "<title>", "skills": [<the numbers of its skills>]}]}',
    '',
    ...lines,
  ].join('\n');
}

/**
 * The model's answer as groups of the skills: its JSON, in a code block or not. A number out of range
 * is ignored; a skill in two groups, in the first; a skill in none, in `Other`; an empty group, dropped.
 * The most skills first, then by title; in a group, the skills in their order.
 */
export function parseGroups(answer: string, skills: Clustered[]): Group[] {
  const json = answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1);
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    data = undefined;
  }
  const listed = (data as { groups?: unknown } | undefined)?.groups;
  if (!Array.isArray(listed)) throw new AtlasError(`The model's answer is not groups: ${excerpt(answer)}`);
  const placed = new Set<number>();
  const groups: { title: string; numbers: number[] }[] = [];
  for (const group of listed as { title?: unknown; skills?: unknown }[]) {
    const title = typeof group?.title === 'string' && group.title.trim() ? group.title.trim() : `Group ${groups.length + 1}`;
    const numbers = (Array.isArray(group?.skills) ? group.skills : [])
      .map(Number)
      .filter((number) => {
        // Placed as it is read: a number twice, even in the same group, counts once.
        if (!Number.isInteger(number) || number < 1 || number > skills.length || placed.has(number)) return false;
        placed.add(number);
        return true;
      });
    groups.push({ title, numbers });
  }
  const rest = skills.map((_skill, index) => index + 1).filter((number) => !placed.has(number));
  if (rest.length) groups.push({ title: 'Other', numbers: rest });
  return groups
    .filter((group) => group.numbers.length > 0)
    .map(({ title, numbers }) => ({ title, skills: numbers.sort((a, b) => a - b).map((number) => skills[number - 1].id) }))
    .sort((a, b) => b.skills.length - a.skills.length || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
}

/** One level: the skills in groups, one request to the model. Fewer than SMALLEST skills, or one group only: an error. */
export async function clusterSkills(skills: Clustered[], ask: Ask, signal?: AbortSignal): Promise<Group[]> {
  if (skills.length < SMALLEST) throw new AtlasError(`Fewer than ${SMALLEST} skills: nothing to cluster`);
  const groups = parseGroups(await ask(clusterPrompt(skills), signal), skills);
  if (groups.length < 2) throw new AtlasError(`The model put all ${skills.length} skills in one group`);
  return groups;
}

/**
 * Every level: the skills in groups, each group of SMALLEST or more clustered again, the groups of a level
 * at the same time. A level the model fails below the first: not clustered, and a warning with its path,
 * `A › B: not clustered: <why>`, in the tree's order; the first: the error.
 */
export async function clusterTree<S extends Clustered>(skills: S[], ask: Ask): Promise<{ groups: Tree<S>[]; warnings: string[] }> {
  type Node = { title: string; skills: S[]; groups: Node[]; warning?: string };
  const level = async (skills: S[], path: string[]): Promise<Node[]> => {
    const byId = new Map(skills.map((skill) => [skill.id, skill]));
    const groups = (await clusterSkills(skills, ask)).map(({ title, skills }) => ({ title, skills: skills.map((id) => byId.get(id)!) }));
    return Promise.all(groups.map(async (group): Promise<Node> => {
      if (group.skills.length < SMALLEST) return { ...group, groups: [] };
      try {
        return { ...group, groups: await level(group.skills, [...path, group.title]) };
      } catch (error) {
        if (!(error instanceof AtlasError)) throw error;
        return { ...group, groups: [], warning: `${[...path, group.title].join(' › ')}: not clustered: ${error.message}` };
      }
    }));
  };
  if (skills.length < SMALLEST) return { groups: [], warnings: [] };
  const warnings: string[] = [];
  const strip = (groups: Node[]): Tree<S>[] => groups.map(({ warning, title, skills, groups }) => {
    if (warning) warnings.push(warning);
    return { title, skills, groups: strip(groups) };
  });
  return { groups: strip(await level(skills, [])), warnings };
}

/** The start of a long answer, on one line. */
function excerpt(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 120 ? `${line.slice(0, 120)}…` : line || '(empty)';
}
