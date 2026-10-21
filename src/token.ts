// The GitHub token of the Node client: GITHUB_TOKEN, else the GitHub CLI's, so a user logged in
// with `gh auth login` gets the higher rate limit without setting anything.
import { execFileSync } from 'node:child_process';

/** `GITHUB_TOKEN`, else what `gh auth token` prints; undefined without either, or if gh fails. */
export function githubToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  try {
    const token = execFileSync('gh', ['auth', 'token'], { env, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return token || undefined;
  } catch {
    return undefined; // no gh, or not logged in: no token, as before
  }
}
