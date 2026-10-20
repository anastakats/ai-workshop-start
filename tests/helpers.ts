// Runs the commands the way the CLI does, with GitHub answering from EXAMPLE below.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { run } from '../src/commands.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { scanOrganization, type OrganizationOptions } from '../src/core/organization.ts';
import { openInput } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The commit GitHub answers for JetBrains/example. */
export const EXAMPLE_COMMIT = '5ab6270ab772d113e8ad52ebfcaa0109c522ae00';

/** When JetBrains/example's skill was last committed, as GitHub answers it: not in UTC. */
export const EXAMPLE_UPDATED = '2026-10-12T09:30:00+02:00';

/**
 * When the skills of ./fixture were last updated, by directory: fixed, unlike the commits of this
 * checkout, so the e2e screenshots stay the same. What git answers is tested on a repository of its own.
 */
export const FIXTURE_UPDATED: Record<string, string> = {
  '.agents/skills/plain-notes': '2026-09-01T08:00:00Z',
  '.agents/skills/release-checklist': '2026-09-15T12:00:00Z',
  '.claude/skills/commits': '2026-10-14T16:45:00Z',
  '.claude/skills/no-name': '2026-08-20T10:00:00Z',
  '.github/skills/code-style': '2026-10-02T09:15:00Z',
  '.github/skills/no-description': '2026-07-30T14:30:00Z',
};

/**
 * What GitHub answers for a small repository, JetBrains/example: one skill, its copy, and
 * SKILL.md files outside the skill roots. Only the skill itself is answered at raw: reading
 * a copy or a file that is not a skill fails the scan.
 */
const EXAMPLE: Recording = {
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1': {
    status: 200,
    body: {
      total_count: 7,
      items: [
        { path: 'SKILL.md' },
        { path: '.claude/skills/commits/SKILL.md' },
        { path: '.claude/skills/commits/examples/SKILL.md' },
        { path: '.github/skills/commits/SKILL.md' },
        { path: 'docs/skills/guide/SKILL.md' },
        { path: 'packages/app/.claude/skills/nested/SKILL.md' },
        { path: 'agent/skills/legacy/SKILL.md' },
      ],
    },
  },
  [`https://api.github.com/repos/JetBrains/example/commits?sha=${EXAMPLE_COMMIT}&path=.claude/skills/commits&per_page=1`]: {
    status: 200,
    body: [{ sha: EXAMPLE_COMMIT, commit: { committer: { date: EXAMPLE_UPDATED } } }],
  },
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
  },
};

const API = 'https://api.github.com';
const tree = (paths: string[], truncated = false) => ({
  status: 200,
  body: { truncated, tree: paths.map((path) => ({ path, mode: '100644', type: 'blob', sha: path })) },
});
const repository = (name: string, default_branch = 'main') => ({
  full_name: `JetBrains/${name}`,
  name,
  html_url: `https://github.com/JetBrains/${name}`,
  default_branch,
});

/**
 * What GitHub answers for a small organization, JetBrains: seven repositories. JetBrains/example
 * as above; four more with skills, mps with a tree too large to list at once; one without
 * skills, one empty, and one GitHub cannot find.
 */
const ORGANIZATION: Recording = {
  [`${API}/users/JetBrains`]: { status: 200, body: { login: 'JetBrains', type: 'Organization' } },
  [`${API}/orgs/JetBrains/repos?type=all&per_page=100&page=1`]: {
    status: 200,
    body: ['example', 'kotlin', 'docs', 'empty', 'ai-tools', 'moved', 'mps'].map((name) => repository(name, name === 'mps' ? 'master' : 'main')),
  },
  // The copy and the SKILL.md files outside a skill root are no skills.
  [`${API}/repos/JetBrains/example/git/trees/main?recursive=1`]: tree([
    'SKILL.md',
    '.claude/skills/commits/SKILL.md',
    '.claude/skills/commits/examples/SKILL.md',
    '.github/skills/commits/SKILL.md',
    'docs/skills/guide/SKILL.md',
  ]),
  [`${API}/repos/JetBrains/kotlin/git/trees/main?recursive=1`]: tree([
    '.agents/skills/bump-gradle/SKILL.md',
    '.claude/skills/run-tests/SKILL.md',
    '.github/skills/review/SKILL.md',
    'README.md',
  ]),
  [`${API}/repos/JetBrains/docs/git/trees/main?recursive=1`]: tree(['README.md', 'skills/SKILL.md']),
  [`${API}/repos/JetBrains/empty/git/trees/main?recursive=1`]: { status: 409, body: { message: 'Git Repository is empty.' } },
  [`${API}/repos/JetBrains/ai-tools/git/trees/main?recursive=1`]: tree(['.claude/skills/explain/SKILL.md', '.claude/skills/plan/SKILL.md']),
  [`${API}/repos/JetBrains/moved/git/trees/main?recursive=1`]: { status: 404, body: { message: 'Not Found' } },
  // Too large: only .claude/skills, the one skill root it has, is listed.
  [`${API}/repos/JetBrains/mps/git/trees/master?recursive=1`]: tree(['README.md'], true),
  [`${API}/repos/JetBrains/mps/git/trees/master`]: {
    status: 200,
    body: { truncated: false, tree: [{ path: '.claude', mode: '040000', type: 'tree', sha: 'mps-claude' }] },
  },
  [`${API}/repos/JetBrains/mps/git/trees/mps-claude`]: {
    status: 200,
    body: { truncated: false, tree: [{ path: 'skills', mode: '040000', type: 'tree', sha: 'mps-claude-skills' }] },
  },
  [`${API}/repos/JetBrains/mps/git/trees/mps-claude-skills?recursive=1`]: tree(['a/SKILL.md', 'b/SKILL.md', 'c/SKILL.md', 'd/SKILL.md', 'd/notes.md']),
};

const github = replay({ ...EXAMPLE, ...ORGANIZATION });

/**
 * What the user typed, opened as the CLI does, with GitHub answering from EXAMPLE through code
 * search; ./fixture with its dates from FIXTURE_UPDATED.
 */
export async function open(input: string) {
  const source = await openInput(input, { fetch: github, token: 'test' });
  if (source.repository.url !== pathToFileURL(FIXTURE).href) return source;
  return { ...source, updated: async (directory: string) => FIXTURE_UPDATED[directory] ?? { reason: `not in FIXTURE_UPDATED: ${directory}` } };
}

/** A GitHub organization, scanned as the web view does, with GitHub answering from ORGANIZATION. */
export const organization = (input: string, options: Pick<OrganizationOptions, 'progress' | 'signal'> = {}) =>
  scanOrganization(input, { fetch: github, token: 'test', ...options });

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from EXAMPLE. */
export async function atlas(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    open,
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}
