import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AtlasError } from './core/errors.ts';
import { SKILL_ROOTS } from './core/find.ts';
import { openGitHub, parseGitHubUrl, type GitHubOptions } from './core/github.ts';
import type { Missing, Source } from './core/scan.ts';

/** What the user typed: a GitHub repository, or a local directory; an existing directory wins. */
export async function openInput(input: string, github: GitHubOptions): Promise<Source> {
  const directory = await stat(input).then((entry) => entry.isDirectory(), () => false);
  return parseGitHubUrl(input) && !directory ? openGitHub(input, github) : openDirectory(input);
}

/** A local checkout as a repository: named after its directory, linked with file:// URLs. */
export async function openDirectory(input: string): Promise<Source> {
  const root = resolve(input);
  const name = basename(root);
  let top: Dirent[];
  try {
    top = await readdir(root, { withFileTypes: true });
  } catch {
    throw new AtlasError(`Not a GitHub URL or a readable directory: ${input}`);
  }
  const warnings: string[] = [];
  return {
    repository: { id: name, organization: 'local', name, url: pathToFileURL(root).href, commit: '' },
    paths: await skillFiles(root, top, warnings),
    warnings,
    read: (path) =>
      readFile(join(root, path)).then(
        (bytes) => new Uint8Array(bytes),
        (error: NodeJS.ErrnoException) => ({
          reason: error.code === 'ENOENT' ? 'deleted since the directory was listed' : `found in the directory, but cannot be read: ${error.message}`,
        }),
      ),
    updated: (directory) => lastChange(root, directory),
  };
}

/**
 * The date of the last commit that changed the directory; in a directory outside git, or not
 * committed yet, when its SKILL.md was last modified.
 */
async function lastChange(root: string, directory: string): Promise<string | Missing> {
  const committed = await new Promise<string>((resolve) =>
    execFile('git', ['-C', root, 'log', '-1', '--format=%cI', '--', directory], (error, stdout) => resolve(error ? '' : stdout.trim())),
  );
  if (committed) return committed;
  return stat(join(root, directory, 'SKILL.md')).then(
    (file) => file.mtime.toISOString(),
    (error: NodeJS.ErrnoException) => ({ reason: `cannot read ${directory}: ${error.message}` }),
  );
}

/**
 * The SKILL.md of each folder in a skill root, a regular file: no other folder can hold a skill,
 * so no other is read. One level at a time, folders only: a symbolic link is not followed. A
 * folder that cannot be read, a warning; the others are listed all the same.
 */
async function skillFiles(root: string, top: Dirent[], warnings: string[]): Promise<string[]> {
  const list = (directory: string) =>
    readdir(join(root, directory), { withFileTypes: true }).catch((error: NodeJS.ErrnoException): Dirent[] => {
      warnings.push(`${directory}: found in the directory, but cannot be read: ${error.message}; skipped`);
      return [];
    });
  const paths: string[] = [];
  for (const skillRoot of SKILL_ROOTS) {
    let entries = top;
    let directory = '';
    for (const segment of skillRoot.split('/')) {
      directory = directory ? `${directory}/${segment}` : segment;
      entries = entries.some((entry) => entry.name === segment && entry.isDirectory()) ? await list(directory) : [];
    }
    for (const skill of entries.filter((entry) => entry.isDirectory())) {
      const files = await list(`${directory}/${skill.name}`);
      if (files.some((entry) => entry.name === 'SKILL.md' && entry.isFile())) paths.push(`${directory}/${skill.name}/SKILL.md`);
    }
  }
  return paths;
}
