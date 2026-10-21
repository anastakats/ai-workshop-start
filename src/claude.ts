// The model of the Node client, for clustering: `claude -p` in a Docker container, through
// scripts/claude-docker.sh, which gets the key from JetBrains Central. The prompt on stdin, the
// answer on stdout.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AtlasError } from './core/errors.ts';
import type { Ask } from './core/cluster.ts';

export const CLAUDE_DOCKER = fileURLToPath(new URL('../scripts/claude-docker.sh', import.meta.url));

/** The model's longest answer, before it is given up on. */
const TIMEOUT = 180_000;

/**
 * Asks the model: `SKILL_ATLAS_CLAUDE`, a command that reads the prompt on stdin and prints the answer,
 * scripts/claude-docker.sh by default; `SKILL_ATLAS_MODEL` goes to it, `haiku` by default.
 */
export function claude(env: NodeJS.ProcessEnv = process.env): Ask {
  const command = env.SKILL_ATLAS_CLAUDE || CLAUDE_DOCKER;
  const model = env.SKILL_ATLAS_MODEL || 'haiku';
  return (prompt, signal) =>
    new Promise((resolve, reject) => {
      // Its own timer, not spawn's: that one would keep the process alive after a command that cannot start.
      const timeout = AbortSignal.timeout(TIMEOUT);
      const stop = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const child = spawn(command, [], { env: { ...env, SKILL_ATLAS_MODEL: model }, stdio: ['pipe', 'pipe', 'pipe'], signal: stop });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const stopped = () => new AtlasError(timeout.aborted ? `The model did not answer in ${TIMEOUT / 1000} s` : 'Clustering stopped');
      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.stdin.on('error', () => {}); // a command that does not read its stdin: its exit code tells
      child.once('error', (error: NodeJS.ErrnoException) => {
        reject(error.name === 'AbortError' ? stopped() : new AtlasError(`Cannot run the model, ${command}: ${error.message}`));
      });
      child.once('close', (code) => {
        if (stop.aborted) return reject(stopped());
        if (code !== 0) {
          const why = Buffer.concat(stderr).toString('utf8').trim().split('\n').slice(-3).join('\n');
          return reject(new AtlasError(`The model failed (${model}, exit code ${code})${why ? `: ${why}` : ''}`));
        }
        resolve(Buffer.concat(stdout).toString('utf8'));
      });
      child.stdin.end(prompt);
    });
}
