import { AtlasError, EmptyRepository, GitHubUnavailable } from './errors.ts';
import { findSkills } from './find.ts';
import { API, client, encodePath, treePaths, type Client, type GitHubOptions } from './github.ts';

/** A GitHub organization, or a user: everyone's repositories live under an owner. */
export type Organization = {
  /** The login, for example `JetBrains`. */
  id: string;
  /** `https://github.com/<login>`. */
  url: string;
  /** How many repositories it has: every one is scanned. */
  repositories: number;
};

/** A repository of the organization, and how many skills it has. */
export type RepositorySkills = { id: string; name: string; url: string; skills: number };

export type OrganizationResult = {
  organization: Organization;
  /** Only the repositories with skills: the most skills first, then by name. */
  repositories: RepositorySkills[];
  warnings: string[];
};

/** What a scan reports while it runs: the organization once listed, then each scanned repository. */
export type OrganizationProgress = { organization: Organization } | { scanned: number };

export type OrganizationOptions = GitHubOptions & {
  progress?(event: OrganizationProgress): void;
  /** Stops the scan: nobody waits for it any more. */
  signal?: AbortSignal;
};

/** Repositories scanned at the same time: each one is a request or a few. */
const CONCURRENCY = 8;

/** `https://github.com/<org>`, with or without the scheme or a trailing slash: an owner, no repository. */
export function parseGitHubOrganization(input: string): string | undefined {
  return /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-z\d-]+)\/?$/i.exec(input.trim())?.[1];
}

/**
 * Lists every repository of the organization, then counts the skills of each one from its tree
 * at the default branch, without reading them. A repository GitHub cannot list is a warning; a
 * GitHub that cannot answer at all, the rate limit say, ends the scan.
 */
export async function scanOrganization(input: string, options: OrganizationOptions): Promise<OrganizationResult> {
  const login = parseGitHubOrganization(input);
  if (!login) throw new AtlasError(`Not a GitHub organization: ${input}`);
  const github = client(options);
  const owner = await github.json<{ login: string; type: string }>(
    `${API}/users/${login}`,
    `Organization not found: https://github.com/${login}`,
  );
  const listed = await listRepositories(github, owner);
  const organization: Organization = { id: owner.login, url: `https://github.com/${owner.login}`, repositories: listed.length };
  options.progress?.({ organization });

  const counted: RepositorySkills[] = [];
  const warnings: string[] = [];
  let next = 0;
  let scanned = 0;
  let failed = false;
  async function worker() {
    while (next < listed.length && !failed && !options.signal?.aborted) {
      const repository = listed[next++];
      try {
        counted.push({ id: repository.full_name, name: repository.name, url: repository.html_url, skills: await countSkills(github, repository) });
      } catch (error) {
        if (error instanceof GitHubUnavailable || !(error instanceof AtlasError)) {
          failed = true; // the other workers stop asking
          throw error;
        }
        warnings.push(`${repository.full_name}: ${error.message}; skipped`);
      }
      options.progress?.({ scanned: ++scanned });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, listed.length) }, worker));

  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    organization,
    repositories: counted.filter((repository) => repository.skills > 0).sort((a, b) => b.skills - a.skills || compare(a.name, b.name)),
    warnings: warnings.sort(compare),
  };
}

type ListedRepository = { full_name: string; name: string; html_url: string; default_branch: string };

/** An organization's repositories, the private ones too if the token sees them; a user's own. 100 a page. */
async function listRepositories(github: Client, owner: { login: string; type: string }): Promise<ListedRepository[]> {
  const list = owner.type === 'Organization' ? `${API}/orgs/${owner.login}/repos?type=all` : `${API}/users/${owner.login}/repos?type=owner`;
  const repositories: ListedRepository[] = [];
  for (let page = 1; ; page++) {
    const items = await github.json<ListedRepository[]>(`${list}&per_page=100&page=${page}`);
    repositories.push(...items);
    if (items.length < 100) return repositories;
  }
}

/** The skills findSkills finds in the tree at the default branch; an empty repository has none. */
async function countSkills(github: Client, repository: ListedRepository): Promise<number> {
  try {
    // Only the skill roots matter here, so a tree too large to list at once is no warning.
    const paths = await treePaths(github, repository.full_name, encodePath(repository.default_branch), []);
    return findSkills(paths).length;
  } catch (error) {
    if (error instanceof EmptyRepository) return 0;
    throw error;
  }
}
