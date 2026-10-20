// The organization scan in spec/web.md, checked on what the core answers for the small
// organization answered in tests/helpers.ts, and for a few more GitHub answers here.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGitHubOrganization, scanOrganization, type OrganizationProgress } from '../src/core/organization.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { organization } from './helpers.ts';

const API = 'https://api.github.com';
const repositories = (owner: string, names: string[]) =>
  names.map((name) => ({ full_name: `${owner}/${name}`, name, html_url: `https://github.com/${owner}/${name}`, default_branch: 'main' }));
const skills = (count: number) => ({
  status: 200,
  body: { truncated: false, tree: Array.from({ length: count }, (_, i) => ({ path: `.claude/skills/s${i}/SKILL.md`, mode: '100644', type: 'blob', sha: `${i}` })) },
});

test('github.com/<org>, with or without https:// and a trailing slash, is an organization; owner/repo is not', () => {
  for (const input of ['github.com/JetBrains', 'https://github.com/JetBrains', 'https://www.github.com/JetBrains/', ' github.com/JetBrains ']) {
    assert.equal(parseGitHubOrganization(input), 'JetBrains', input);
  }
  for (const input of ['JetBrains', 'JetBrains/kotlin', 'github.com/JetBrains/kotlin', 'gitlab.com/JetBrains', './fixture', 'github.com/']) {
    assert.equal(parseGitHubOrganization(input), undefined, input);
  }
});

test('the organization: its repositories counted, then the ones with skills, the most skills first', async () => {
  const events: OrganizationProgress[] = [];
  const result = await organization('github.com/JetBrains', { progress: (event) => events.push(event) });
  const listed = { id: 'JetBrains', url: 'https://github.com/JetBrains', repositories: 7 };
  assert.deepEqual(result.organization, listed);
  // Skills as findSkills finds them: a copy, a file deeper or outside a skill root is no skill.
  assert.deepEqual(
    result.repositories.map(({ id, name, url, skills }) => [id, name, url, skills]),
    [
      ['JetBrains/mps', 'mps', 'https://github.com/JetBrains/mps', 4],
      ['JetBrains/kotlin', 'kotlin', 'https://github.com/JetBrains/kotlin', 3],
      ['JetBrains/ai-tools', 'ai-tools', 'https://github.com/JetBrains/ai-tools', 2],
      ['JetBrains/example', 'example', 'https://github.com/JetBrains/example', 1],
    ],
  );
  // An empty repository has no skills; one GitHub cannot find is a warning, and the scan goes on.
  assert.deepEqual(result.warnings, [
    `JetBrains/moved: Not found on GitHub: ${API}/repos/JetBrains/moved/git/trees/main?recursive=1; skipped`,
  ]);
  // The number of repositories first, then the progress, one repository at a time.
  assert.deepEqual(events, [{ organization: listed }, ...[1, 2, 3, 4, 5, 6, 7].map((scanned) => ({ scanned }))]);
});

test('a user: their own repositories; more than 100 repositories: every page', async () => {
  const names = Array.from({ length: 101 }, (_, i) => `r${String(i).padStart(3, '0')}`);
  const recording: Recording = {
    [`${API}/users/someone`]: { status: 200, body: { login: 'someone', type: 'User' } },
    [`${API}/users/someone/repos?type=owner&per_page=100&page=1`]: { status: 200, body: repositories('someone', names.slice(0, 100)) },
    [`${API}/users/someone/repos?type=owner&per_page=100&page=2`]: { status: 200, body: repositories('someone', names.slice(100)) },
  };
  for (const [i, name] of names.entries()) recording[`${API}/repos/someone/${name}/git/trees/main?recursive=1`] = skills(i % 3);
  const result = await scanOrganization('https://github.com/someone', { fetch: replay(recording) });
  assert.equal(result.organization.repositories, 101);
  assert.equal(result.repositories.length, names.filter((_, i) => i % 3 > 0).length);
  assert.deepEqual(result.repositories.slice(0, 2).map((repository) => [repository.name, repository.skills]), [['r002', 2], ['r005', 2]]);
});

test('not an organization, or one GitHub does not know → a clear message', async () => {
  await assert.rejects(organization('JetBrains/kotlin'), { message: 'Not a GitHub organization: JetBrains/kotlin' });
  const notFound = replay({ [`${API}/users/no-such-org`]: { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(scanOrganization('github.com/no-such-org', { fetch: notFound }), {
    message: 'Organization not found: https://github.com/no-such-org',
  });
});

test('the rate limit during the scan ends it, with a message that asks for GITHUB_TOKEN', async () => {
  const recording: Recording = {
    [`${API}/users/Big`]: { status: 200, body: { login: 'Big', type: 'Organization' } },
    [`${API}/orgs/Big/repos?type=all&per_page=100&page=1`]: { status: 200, body: repositories('Big', ['a', 'b']) },
    [`${API}/repos/Big/a/git/trees/main?recursive=1`]: skills(1),
    [`${API}/repos/Big/b/git/trees/main?recursive=1`]: { status: 403, body: { message: 'API rate limit exceeded for 192.0.2.1.' } },
  };
  await assert.rejects(scanOrganization('github.com/Big', { fetch: replay(recording) }), { message: 'GitHub rate limit reached; set GITHUB_TOKEN' });
});

test('stopped: no repository is asked for any more', async () => {
  const asked: string[] = [];
  const stopped = new AbortController();
  const recording: Recording = {
    [`${API}/users/Big`]: { status: 200, body: { login: 'Big', type: 'Organization' } },
    [`${API}/orgs/Big/repos?type=all&per_page=100&page=1`]: { status: 200, body: repositories('Big', Array.from({ length: 20 }, (_, i) => `r${i}`)) },
  };
  const github = replay(recording, async (url) => {
    asked.push(url);
    stopped.abort(); // the page goes away at the first repository
    return new Response(JSON.stringify(skills(1).body));
  });
  await scanOrganization('github.com/Big', { fetch: github, signal: stopped.signal });
  // At most the repositories already under way, one for each of the 8 at a time, of the 20.
  assert.ok(asked.length <= 8, `${asked.length} asked`);
  assert.ok(asked.every((url) => url.includes('/git/trees/')));
});

// Live GitHub, so only with GITHUB_TOKEN: JetBrains has close to 900 repositories, a request or
// more each, and without a token the rate limit allows 60 an hour.
test('https://github.com/JetBrains, live: every repository scanned, intellij-community among the ones with skills', { skip: !process.env.GITHUB_TOKEN && 'needs GITHUB_TOKEN', timeout: 180_000 }, async () => {
  let scanned = 0;
  const result = await scanOrganization('https://github.com/JetBrains', {
    fetch,
    token: process.env.GITHUB_TOKEN,
    progress: (event) => {
      if ('scanned' in event) scanned = event.scanned;
    },
  });
  assert.equal(result.organization.id, 'JetBrains');
  assert.ok(result.organization.repositories > 500, `${result.organization.repositories} repositories`);
  assert.equal(scanned, result.organization.repositories);
  const ids = result.repositories.map((repository) => repository.id);
  assert.ok(ids.includes('JetBrains/intellij-community'), ids.join(', '));
  for (const repository of result.repositories) assert.ok(repository.skills > 0, repository.id);
  const counts = result.repositories.map((repository) => repository.skills);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
});
