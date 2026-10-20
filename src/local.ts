import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AtlasError } from './core/errors.ts';
import { openGitHub, parseGitHubUrl, type GitHubOptions } from './core/github.ts';
import type { Missing, Source } from './core/scan.ts';

/** Never part of a repository's own files. */
const SKIPPED = new Set(['.git', 'node_modules']);

/** What the user typed: a GitHub repository, or a local directory; an existing directory wins. */
export async function openInput(input: string, github: GitHubOptions): Promise<Source> {
  const directory = await stat(input).then((entry) => entry.isDirectory(), () => false);
  return parseGitHubUrl(input) && !directory ? openGitHub(input, github) : openDirectory(input);
}

/** A local checkout as a repository: named after its directory, linked with file:// URLs. */
export async function openDirectory(input: string): Promise<Source> {
  const root = resolve(input);
  const name = basename(root);
  let paths: string[];
  try {
    paths = await walk(root, '');
  } catch {
    throw new AtlasError(`Not a GitHub URL or a readable directory: ${input}`);
  }
  return {
    repository: { id: name, organization: 'local', name, url: pathToFileURL(root).href, commit: '' },
    paths,
    warnings: [],
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

/** Every regular file under the directory, as a path relative to the root. */
async function walk(root: string, directory: string, paths: string[] = []): Promise<string[]> {
  // One list for the whole walk: a large repository has more files than a spread can pass.
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory() && !SKIPPED.has(entry.name)) await walk(root, path, paths);
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}
