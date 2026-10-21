// The preview of spec/web.md: a SKILL.md's Markdown, rendered (src/web/markdown.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMarkdown } from '../src/web/markdown.js';

const LINK = 'https://github.com/JetBrains/example/blob/5ab6270/.claude/skills/commits/SKILL.md';
const render = (markdown: string, link = LINK, path = '.claude/skills/commits/SKILL.md') => renderMarkdown(markdown, link, path).trim();

test("GitHub's Markdown: headings, lists, code, tables, quotes", () => {
  assert.equal(render('# Commits\n\nStart with the **area**, then `what`.'), '<h1>Commits</h1>\n<p>Start with the <strong>area</strong>, then <code>what</code>.</p>');
  assert.equal(render('- one\n- two'), '<ul>\n<li>one</li>\n<li>two</li>\n</ul>');
  assert.equal(render('1. Tag'), '<ol>\n<li>Tag</li>\n</ol>');
  assert.equal(render('```kotlin\nval a = 1 < 2\n```'), '<pre><code class="language-kotlin">val a = 1 &lt; 2\n</code></pre>');
  assert.match(render('| a | b |\n|---|---|\n| 1 | 2 |'), /^<table>\n<thead>\n<tr>\n<th>a<\/th>\n<th>b<\/th>[\s\S]*<td>1<\/td>\n<td>2<\/td>[\s\S]*<\/table>$/);
  assert.equal(render('> Note'), '<blockquote>\n<p>Note</p>\n</blockquote>');
  assert.equal(render('~~old~~'), '<p><del>old</del></p>');
});

test('raw HTML: shown as text, not HTML', () => {
  assert.equal(render('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(render('Inline <b>bold</b>'), '<p>Inline &lt;b&gt;bold&lt;/b&gt;</p>');
  assert.equal(render('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
});

test('links: in a new tab; relative ones next to the SKILL.md, at the scanned commit', () => {
  const commit = 'https://github.com/JetBrains/example/blob/5ab6270/.claude/skills/commits';
  assert.equal(render('[the checklist](checklist.md)'), `<p><a href="${commit}/checklist.md" target="_blank" rel="noopener">the checklist</a></p>`);
  assert.equal(render('[up](../shared/a.md "Shared")'), `<p><a href="https://github.com/JetBrains/example/blob/5ab6270/.claude/skills/shared/a.md" title="Shared" target="_blank" rel="noopener">up</a></p>`);
  assert.equal(render('[site](https://example.com/a)'), '<p><a href="https://example.com/a" target="_blank" rel="noopener">site</a></p>');
  assert.equal(render('[mail](mailto:a@b.c)'), '<p><a href="mailto:a@b.c" target="_blank" rel="noopener">mail</a></p>');
  // From the repository's root, as on GitHub: at the scanned commit too.
  assert.equal(render('[docs](/docs/a.md)'), '<p><a href="https://github.com/JetBrains/example/blob/5ab6270/docs/a.md" target="_blank" rel="noopener">docs</a></p>');
  assert.equal(render('[docs](/docs/a.md)', 'https://github.com/JetBrains/example/blob/5ab6270/SKILL.md', 'SKILL.md'), '<p><a href="https://github.com/JetBrains/example/blob/5ab6270/docs/a.md" target="_blank" rel="noopener">docs</a></p>');
  assert.equal(render('[site](//example.com/a)'), '<p><a href="https://example.com/a" target="_blank" rel="noopener">site</a></p>');
  // Within the page: as it is, in the same tab.
  assert.equal(render('[below](#usage)'), '<p><a href="#usage">below</a></p>');
  // A local directory: next to the file.
  assert.equal(render('[a](a.md)', 'file:///repo/.claude/skills/x/SKILL.md'), '<p><a href="file:///repo/.claude/skills/x/a.md" target="_blank" rel="noopener">a</a></p>');
  assert.equal(render('[docs](/docs/a.md)', 'file:///repo/.claude/skills/x/SKILL.md'), '<p><a href="file:///repo/docs/a.md" target="_blank" rel="noopener">docs</a></p>');
});

test('images: relative ones, the file itself on GitHub, raw/, not its page', () => {
  assert.equal(render('![flow](images/flow.png)'), '<p><img src="https://github.com/JetBrains/example/raw/5ab6270/.claude/skills/commits/images/flow.png" alt="flow"></p>');
  assert.equal(render('![x](https://example.com/x.png)'), '<p><img src="https://example.com/x.png" alt="x"></p>');
  assert.equal(render('![x](x.png)', 'file:///repo/s/SKILL.md', 's/SKILL.md'), '<p><img src="file:///repo/s/x.png" alt="x"></p>');
  assert.equal(render('![logo](/images/logo.png)'), '<p><img src="https://github.com/JetBrains/example/raw/5ab6270/images/logo.png" alt="logo"></p>');
});
