// @ts-check
// The filter over the skills in the web view: which skills match, and the parts to highlight.
// Plain JavaScript, for the page as it is and for the tests.

/** Characters kept before a match in a description, at most; then cut at a word. */
const BEFORE = 20;

/** @typedef {{ text: string, match: boolean }} Part */
/** @typedef {{ name: Part[], description: Part[] }} Shown */

/**
 * A skill as the list shows it for `query`: its name and description in parts, the matches
 * marked; `null` when neither matches. Case-insensitive; an empty query matches every skill.
 * A description that matches is cut to the words around its first match, with `…` before.
 * @param {{ name: string, description: string }} skill
 * @param {string} query
 * @returns {Shown | null}
 */
export function matchSkill(skill, query) {
  const description = skill.description.replace(/\s+/g, ' ').trim();
  const needle = query.trim();
  if (!needle) return { name: [{ text: skill.name, match: false }], description: [{ text: description, match: false }] };
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  const inName = skill.name.search(pattern) >= 0;
  const at = description.search(pattern);
  if (!inName && at < 0) return null;
  return {
    name: split(skill.name, pattern),
    description: at < 0 ? [{ text: description, match: false }] : split(around(description, at), pattern),
  };
}

/**
 * The skills that match `query`, in their order, with what to show.
 * @template {{ name: string, description: string }} S
 * @param {S[]} skills
 * @param {string} query
 * @returns {{ skill: S, shown: Shown }[]}
 */
export function filterSkills(skills, query) {
  return skills.flatMap((skill) => {
    const shown = matchSkill(skill, query);
    return shown ? [{ skill, shown }] : [];
  });
}

/**
 * `text` from a few words before `at`; `…` before, if cut.
 * @param {string} text
 * @param {number} at
 */
function around(text, at) {
  if (at <= BEFORE) return text;
  let from = at - BEFORE;
  const word = text.slice(from, at + 1).search(/\s\S/);
  if (word >= 0) from += word + 1;
  return `…${text.slice(from)}`;
}

/**
 * `text` in parts, every match of `pattern` (global) marked.
 * @param {string} text
 * @param {RegExp} pattern
 * @returns {Part[]}
 */
function split(text, pattern) {
  /** @type {Part[]} */
  const parts = [];
  let from = 0;
  for (const found of text.matchAll(pattern)) {
    if (found.index > from) parts.push({ text: text.slice(from, found.index), match: false });
    parts.push({ text: found[0], match: true });
    from = found.index + found[0].length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}
