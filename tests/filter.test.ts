// The filter of spec/web.md ("Filter the skills"), checked on the skills the web view's server
// answers for ./fixture: which match, and what the list shows highlighted.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createWebServer, listen } from '../src/web.ts';
import { filterSkills, matchSkill } from '../src/web/filter.js';
import { FIXTURE, open } from './helpers.ts';

const server = createWebServer({ open });
const base = await listen(server, 0);
after(() => server.close());

type Skill = { name: string; description: string };
const { skills } = (await (await fetch(`${base}/api/scan?repo=${encodeURIComponent(FIXTURE)}`)).json()) as { skills: Skill[] };

/** The skills a query keeps, each as its name and description, the matches in [brackets]. */
const shown = (query: string) =>
  filterSkills(skills, query).map(({ shown }) =>
    [shown.name, shown.description].map((parts) => parts.map(({ text, match }) => (match ? `[${text}]` : text)).join('')),
  );

test('no query, or only spaces: every skill, in its order, nothing highlighted', () => {
  const all = skills.map((skill) => [skill.name, skill.description]);
  assert.equal(all.length, 6);
  assert.deepEqual(shown(''), all);
  assert.deepEqual(shown('   '), all);
});

test('by name or by description, case-insensitive: every match highlighted, as it is written', () => {
  assert.deepEqual(shown('COMMIT'), [
    ['code-style', "…style. Use before [commit]ting Kotlin or Java changes."],
    ['[commit]s', 'Write [commit] messages the way this repository does. Use for every [commit].'],
  ]);
  assert.deepEqual(shown('name'), [['no-[name]', '[Name]d after its directory. Its front matter has no [name].']]);
});

test('a name that matches, a description that does not: the description as it is', () => {
  assert.deepEqual(shown('checklist'), [['release-[checklist]', '']]);
  assert.deepEqual(shown('code-'), [['[code-]style', "Follow the project's code style. Use before committing Kotlin or Java changes."]]);
});

test('a description: the words around the match, cut with … before', () => {
  assert.deepEqual(shown('java'), [['code-style', '…Kotlin or [Java] changes.']]);
  // Near its start: the description from its start, not cut.
  assert.deepEqual(shown('messages'), [['commits', 'Write commit [messages] the way this repository does. Use for every commit.']]);
  // Inside a long word: cut in it.
  const long = { name: 'mps-aspect-typesystem', description: 'Rules for IfInstanceOfWhenConcreteStatement blocks.' };
  assert.deepEqual(matchSkill(long, 'test')?.description, [
    { text: '…InstanceOfWhenConcre', match: false },
    { text: 'teSt', match: true },
    { text: 'atement blocks.', match: false },
  ]);
});

test('the text as it is typed, not a pattern; no match: no skill', () => {
  assert.deepEqual(
    shown('.').map(([name]) => name),
    ['code-style', 'commits', 'no-name'],
  );
  assert.deepEqual(shown('(.*)'), []);
  assert.deepEqual(shown('no such skill'), []);
});

test('the description on one line: its whitespace, one space', () => {
  const skill = { name: 'wrapped', description: '  Runs  the\n  module.\n' };
  assert.deepEqual(matchSkill(skill, 'module')?.description, [
    { text: 'Runs the ', match: false },
    { text: 'module', match: true },
    { text: '.', match: false },
  ]);
});
