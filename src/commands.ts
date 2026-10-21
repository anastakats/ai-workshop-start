// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { clusterTree, SMALLEST, type Ask, type Tree } from './core/cluster.ts';
import { AtlasError } from './core/errors.ts';
import { lastUpdated, skillLink, type Repository, type Skill } from './core/model.ts';
import { scan, type Source } from './core/scan.ts';

export type Context = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
  /** Starts the web view on the port; its URL. Only the Node CLI can. */
  serve?(port: number): Promise<string>;
  /** The model the skills are clustered by. Only the Node CLI has one. */
  cluster?: Ask;
};

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | owner/repo | directory>     find every skill in a repository and print it
  cluster <GitHub URL | owner/repo | directory>  the skills in groups, by a model, down to fewer than 3 a group
  serve [--port N]                               the web view, on port 3000 by default
  help                                           show this help`;

/** Runs one command; returns its exit code. */
export async function run(args: string[], context: Context): Promise<number> {
  const [command = 'help', ...rest] = args;
  try {
    if (command === 'scan') await scanCommand(rest, context);
    else if (command === 'cluster') await clusterCommand(rest, context);
    else if (command === 'serve') await serveCommand(rest, context);
    else if (command === 'help') context.print(usage);
    else throw new AtlasError(`Unknown command: ${command}\n\n${usage}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    context.error(error.message);
    return 1;
  }
}

async function scanCommand(args: string[], context: Context) {
  if (args.length !== 1) throw new AtlasError('Usage: skill-atlas scan <GitHub URL | owner/repo | directory>');
  const result = await scan(await context.open(args[0]));
  printRepository(result.repository, result.skills, context);
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
}

async function clusterCommand(args: string[], context: Context) {
  if (args.length !== 1) throw new AtlasError('Usage: skill-atlas cluster <GitHub URL | owner/repo | directory>');
  if (!context.cluster) throw new AtlasError('cluster runs only in the command line');
  const result = await scan(await context.open(args[0]));
  const { groups, warnings } = await clusterTree(result.skills, context.cluster);
  printTree(result.repository, result.skills, groups, context);
  for (const warning of [...result.warnings, ...warnings]) context.error(`warning: ${warning}`);
}

async function serveCommand(args: string[], context: Context) {
  const usage = 'Usage: skill-atlas serve [--port N]';
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--port')) throw new AtlasError(usage);
  const port = args.length ? Number(args[1]) : 3000;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new AtlasError(usage);
  if (!context.serve) throw new AtlasError('serve runs only in the command line');
  context.print(`Skill Atlas at ${await context.serve(port)}`);
}

/**
 * `<owner>/<repo> · N skills · last updated <date>`, then each skill's name, first sentence, link
 * and the day it was updated.
 */
function printRepository(repository: Repository, skills: Skill[], { print }: Context) {
  const last = lastUpdated(skills);
  print(`${repository.id} · ${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}${last ? ` · last updated ${day(last)}` : ''}`);
  for (const skill of skills) {
    print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
    print(`  ${skillLink(repository, skill)}`);
    if (skill.copies.length > 0) print(`  also in ${skill.copies.join(', ')}`);
    if (skill.updated) print(`  updated ${day(skill.updated)}`);
  }
}

/**
 * `<owner>/<repo> · N skills · K groups`, then each group, `<title> · N skills`, and under it, two spaces
 * deeper, its groups or else its skills: the name and the first sentence.
 */
function printTree(repository: Repository, skills: Skill[], groups: Tree<Skill>[], { print }: Context) {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const skill = (skill: Skill, indent: string) =>
    print(`${indent}${skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name}`);
  const group = (tree: Tree<Skill>, indent: string) => {
    print(`${indent}${tree.title} · ${count(tree.skills.length, 'skill', 'skills')}`);
    if (tree.groups.length) for (const inner of tree.groups) group(inner, `${indent}  `);
    else for (const each of tree.skills) skill(each, `${indent}  `);
  };
  const header = `${repository.id} · ${count(skills.length, 'skill', 'skills')}`;
  if (!groups.length) {
    // Fewer than SMALLEST: nothing to cluster, the model is not asked.
    print(`${header}${skills.length ? ` · fewer than ${SMALLEST}, not clustered` : ''}`);
    for (const each of skills) skill(each, '');
    return;
  }
  print(`${header} · ${count(groups.length, 'group', 'groups')}`);
  for (const tree of groups) group(tree, '');
}

/** `2026-10-12T09:30:00.000Z` → `2026-10-12`: the day, in UTC. */
function day(date: string): string {
  return date.slice(0, 10);
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
