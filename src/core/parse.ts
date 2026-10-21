import { parseDocument } from 'yaml';

/** What a SKILL.md says about itself. */
export type ParsedSkill = {
  /** Missing when the front matter has no name. */
  name?: string;
  description: string;
  /** The other front matter keys. */
  properties: Record<string, unknown>;
  /** The Markdown after the front matter. */
  body: string;
  /** The front matter's YAML, as it is, between its `---` lines; empty without one. */
  frontMatter: string;
};

/**
 * Reads the YAML front matter between the leading `---` lines and the body
 * after it. Malformed front matter is the skill's own text, not the scan's
 * problem: the skill keeps its directory name, without a warning, and the
 * preview shows the text as it is.
 */
export function parseSkill(text: string): ParsedSkill {
  const lines = text.split(/\r?\n/);
  if (lines[0].trim() !== '---') return fallback(text);
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end < 0) return fallback(text);
  const body = lines.slice(end + 1).join('\n');
  const frontMatter = lines.slice(1, end).join('\n');
  const document = parseDocument(frontMatter);
  if (document.errors.length) return fallback(body, frontMatter);
  const data: unknown = document.toJS();
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return fallback(body, frontMatter);
  const { name, description, ...properties } = data as Record<string, unknown>;
  return { name: asText(name) || undefined, description: asText(description), properties, body: trim(body), frontMatter };
}

function fallback(body: string, frontMatter = ''): ParsedSkill {
  return { description: '', properties: {}, body: trim(body), frontMatter };
}

function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

/** Without the blank lines around it; the first line keeps its indentation. */
function trim(body: string): string {
  return body.replace(/^(?:[ \t]*\n)+/, '').trimEnd();
}
