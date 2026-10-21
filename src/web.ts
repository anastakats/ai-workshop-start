// The web view: one page, and the scan behind it as JSON. Local only, nothing stored; the
// GitHub token, if any, stays here.
import { readFile } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { parse, stringify } from 'yaml';
import { AtlasError } from './core/errors.ts';
import { skillLink } from './core/model.ts';
import type { OrganizationOptions, OrganizationResult } from './core/organization.ts';
import { parseSkill } from './core/parse.ts';
import { scan, type Source } from './core/scan.ts';

const PAGE = new URL('./web/index.html', import.meta.url);
// The page's scripts: the filter, the Markdown, and marked, which renders it.
const SCRIPTS: Record<string, URL> = {
  '/filter.js': new URL('./web/filter.js', import.meta.url),
  '/markdown.js': new URL('./web/markdown.js', import.meta.url),
  '/marked.js': new URL(import.meta.resolve('marked')),
};

export type WebContext = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source>;
  /** Scans every repository of a GitHub organization. */
  organization(input: string, options: Pick<OrganizationOptions, 'progress' | 'signal'>): Promise<OrganizationResult>;
};

/**
 * `GET /`, the page, and its scripts: `GET /filter.js`, `/markdown.js`, `/marked.js`; `GET /api/scan?repo=<input>`,
 * `{ repository, skills, warnings }`, each skill with its `link`, `frontMatter` and `body`, or `400 { error }`; `GET /api/organization?org=<input>`, see `scanOrganization` below.
 */
export function createWebServer(context: WebContext): Server {
  return createServer(async (request, response) => {
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
      response.end(body);
    };
    const json = (status: number, body: unknown) => send(status, 'application/json', JSON.stringify(body));
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method !== 'GET') return json(405, { error: `Not allowed: ${request.method}` });
    if (url.pathname === '/') return send(200, 'text/html', await readFile(PAGE, 'utf8'));
    if (url.pathname in SCRIPTS) return send(200, 'text/javascript', await readFile(SCRIPTS[url.pathname], 'utf8'));
    if (url.pathname === '/api/organization') return scanOrganization(url.searchParams.get('org')?.trim(), response, json);
    if (url.pathname !== '/api/scan') return json(404, { error: `Not found: ${url.pathname}` });
    const input = url.searchParams.get('repo')?.trim();
    if (!input) return json(400, { error: 'Enter owner/repo, a GitHub link or a directory' });
    try {
      const result = await scan(await context.open(input));
      const skills = result.skills.map((skill) => ({ ...skill, link: skillLink(result.repository, skill), ...preview(skill.content) }));
      json(200, { repository: result.repository, skills, warnings: result.warnings });
    } catch (error) {
      if (error instanceof AtlasError) json(400, { error: error.message });
      else json(500, { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  /**
   * One JSON object a line, as the scan goes: `{ organization }` once the repositories are listed,
   * `{ scanned }` after each one, then `{ organization, repositories, warnings }`. Before the first
   * line, a clear message is `400 { error }`; after it, a last line `{ error }`.
   */
  async function scanOrganization(input: string | undefined, response: ServerResponse, json: (status: number, body: unknown) => void) {
    if (!input) return json(400, { error: 'Enter github.com/<organization>' });
    const stopped = new AbortController();
    response.once('close', () => stopped.abort()); // the page went away: the scan stops asking GitHub
    const line = (body: unknown) => {
      if (response.destroyed) return;
      if (!response.headersSent) response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
      response.write(`${JSON.stringify(body)}\n`);
    };
    try {
      line(await context.organization(input, { progress: line, signal: stopped.signal }));
      response.end();
    } catch (error) {
      const message = error instanceof AtlasError ? error.message : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
      if (!response.headersSent) return json(error instanceof AtlasError ? 400 : 500, { error: message });
      line({ error: message });
      response.end();
    }
  }
}

/**
 * A SKILL.md as the page shows it: `frontMatter`, each key and its value as text, or the YAML as it is
 * when it cannot be read as a mapping, `null` without one; `body`, the Markdown after it.
 */
export function preview(content: string): { frontMatter: [string, string][] | string | null; body: string } {
  const { frontMatter, body } = parseSkill(content);
  if (!frontMatter.trim()) return { frontMatter: null, body };
  let data: unknown;
  try {
    data = parse(frontMatter);
  } catch {
    return { frontMatter, body };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { frontMatter, body };
  return { frontMatter: Object.entries(data).map(([key, value]) => [key, asText(value)]), body };
}

/** A value of the front matter: text and numbers as they are, a list of them joined by `, `, the rest as YAML. */
function asText(value: unknown): string {
  const scalar = (item: unknown) => item === null || typeof item !== 'object';
  if (scalar(value)) return String(value ?? '');
  if (Array.isArray(value) && value.every(scalar)) return value.map((item) => String(item ?? '')).join(', ');
  return stringify(value).trimEnd();
}

/** Listens on 127.0.0.1 only; the URL to open. */
export function listen(server: Server, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) =>
      reject(error.code === 'EADDRINUSE' ? new AtlasError(`Port ${port} is in use; try --port`) : error),
    );
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://localhost:${typeof address === 'object' && address ? address.port : port}`);
    });
  });
}
