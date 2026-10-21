// The GitHub token of the Node client (spec/cli.md): GITHUB_TOKEN, else the GitHub CLI's, with a
// stand-in `gh` on PATH.
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { githubToken } from '../src/token.ts';

/** A directory for PATH with a `gh` that runs the script; without a script, no `gh` at all. */
function path(t: { after(fn: () => void): void }, script?: string): string {
  const bin = mkdtempSync(join(tmpdir(), 'skill-atlas-gh-'));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  if (script !== undefined) {
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\n${script}\n`);
    chmodSync(join(bin, 'gh'), 0o755);
  }
  return bin;
}

const loggedIn = '[ "$*" = "auth token --hostname github.com" ] && echo gho_from-gh';

test('GITHUB_TOKEN, when set, wins over gh', (t) => {
  assert.equal(githubToken({ PATH: path(t, loggedIn), GITHUB_TOKEN: 'from-env' }), 'from-env');
});

test("without GITHUB_TOKEN, gh's token: gh auth token", (t) => {
  assert.equal(githubToken({ PATH: path(t, loggedIn) }), 'gho_from-gh');
  assert.equal(githubToken({ PATH: path(t, loggedIn), GITHUB_TOKEN: '' }), 'gho_from-gh');
});

test("gh's token for github.com, even with GH_HOST set to another host", (t) => {
  const byHost = 'case "$*" in *"--hostname github.com"*) echo gho_from-gh ;; *) echo ghe_enterprise ;; esac';
  assert.equal(githubToken({ PATH: path(t, byHost), GH_HOST: 'github.example.com' }), 'gho_from-gh');
});

test('no gh, gh not logged in, or nothing printed → no token', (t) => {
  assert.equal(githubToken({ PATH: path(t) }), undefined);
  assert.equal(githubToken({ PATH: path(t, 'echo "no oauth token found for github.com" >&2; exit 1') }), undefined);
  assert.equal(githubToken({ PATH: path(t, 'echo') }), undefined);
});
