// The web view: one page, and the scan behind it as JSON. Local only, nothing stored; the
// GitHub token, if any, stays here.
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { parse, stringify } from 'yaml';
import { clusterSkills, type Ask, type Clustered } from './core/cluster.ts';
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
  /** The model the skills are clustered by; without one, `POST /api/cluster` answers that. */
  cluster?: Ask;
};

/** The largest `POST /api/cluster` body: thousands of skills' names and descriptions. */
const MAX_BODY = 4 * 1024 * 1024;

/**
 * `GET /`, the page, and its scripts: `GET /filter.js`, `/markdown.js`, `/marked.js`; `GET /api/scan?repo=<input>`,
 * `{ repository, skills, warnings }`, each skill with its `link`, `frontMatter` and `body`, or `400 { error }`; `GET /api/organization?org=<input>`, see `scanOrganization` below;
 * `POST /api/cluster`, see `cluster` below.
 */
export function createWebServer(context: WebContext): Server {
  return createServer(async (request, response) => {
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
      response.end(body);
    };
    const json = (status: number, body: unknown) => send(status, 'application/json', JSON.stringify(body));
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/api/cluster') return request.method === 'POST' ? cluster(request, response, json) : json(405, { error: `Not allowed: ${request.method}` });
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
   * `POST /api/cluster`, `{ skills: [{ id, name, description }] }`: one level, `{ groups: [{ title, skills }] }`,
   * each group the ids of its skills; or `400 { error }`. Nothing is stored: the page sends the skills.
   */
  async function cluster(request: IncomingMessage, response: ServerResponse, json: (status: number, body: unknown) => void) {
    const stopped = new AbortController();
    response.once('close', () => stopped.abort()); // the page went away: the model is not waited for
    // JSON only: another site's page cannot send it here without asking first, and the server never agrees.
    if (!/^application\/json\b/i.test(request.headers['content-type'] ?? '')) return json(415, { error: 'Send JSON: Content-Type: application/json' });
    try {
      if (!context.cluster) throw new AtlasError('Clustering is not set up on this server');
      const skills = clusteredSkills(await readBody(request));
      json(200, { groups: await clusterSkills(skills, context.cluster, stopped.signal) });
    } catch (error) {
      if (response.destroyed) return;
      // A body too large, not read to its end: the connection cannot be used again.
      if (!request.complete) response.setHeader('Connection', 'close');
      if (error instanceof AtlasError) json(400, { error: error.message });
      else json(500, { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

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

/** The request's body as JSON, up to MAX_BODY. */
async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw new AtlasError('Too many skills to cluster at once');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AtlasError('Send { skills: [{ id, name, description }] } as JSON');
  }
}

/** `{ skills: [{ id, name, description }] }`, each id once; else a clear message. */
function clusteredSkills(body: unknown): Clustered[] {
  const skills = (body as { skills?: unknown } | null)?.skills;
  const valid = (skill: unknown): skill is Clustered => {
    const { id, name, description } = (skill ?? {}) as Record<string, unknown>;
    return typeof id === 'string' && typeof name === 'string' && typeof description === 'string';
  };
  if (!Array.isArray(skills) || !skills.every(valid)) throw new AtlasError('Send { skills: [{ id, name, description }] } as JSON');
  if (new Set(skills.map((skill) => skill.id)).size !== skills.length) throw new AtlasError('Each skill once: an id is repeated');
  return skills.map(({ id, name, description }) => ({ id, name, description }));
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
