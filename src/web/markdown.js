// @ts-check
// A SKILL.md's Markdown, rendered for the web view, with marked: GitHub's flavor. Plain JavaScript,
// for the page as it is (marked from /marked.js, by its import map) and for the tests.
import { Marked } from 'marked';

/**
 * The Markdown as HTML. Raw HTML in it is shown as text; links open in a new tab, but `#section`; relative links
 * and images resolved against `link`, where the SKILL.md is: on GitHub, at the scanned commit.
 * @param {string} markdown
 * @param {string} link
 * @returns {string}
 */
export function renderMarkdown(markdown, link) {
  const marked = new Marked({
    gfm: true,
    walkTokens(token) {
      if (token.type === 'link') token.href = resolve(token.href, link);
      if (token.type === 'image') token.href = resolve(token.href, raw(link));
    },
    renderer: {
      html({ text, block }) {
        return block ? `<p>${escape(text.trim())}</p>\n` : escape(text);
      },
      link({ href, title, tokens }) {
        const titled = title ? ` title="${escape(title)}"` : '';
        const away = href.startsWith('#') ? '' : ' target="_blank" rel="noopener"';
        return `<a href="${escape(href)}"${titled}${away}>${this.parser.parseInline(tokens)}</a>`;
      },
    },
  });
  return /** @type {string} */ (marked.parse(markdown, { async: false }));
}

/**
 * `references/x.md` → next to the SKILL.md; with a scheme, or `#section`, as it is.
 * @param {string} href
 * @param {string} base
 */
function resolve(href, base) {
  if (!href || href.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(href)) return href;
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

/** An image on GitHub: the file, `raw/`, not its page, `blob/`. @param {string} link */
const raw = (link) => link.replace(/^(https:\/\/github\.com\/[^/]+\/[^/]+)\/blob\//, '$1/raw/');

/** @type {Record<string, string>} */
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** @param {string} text */
const escape = (text) => text.replace(/[&<>"']/g, (char) => ENTITIES[char]);
