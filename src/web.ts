// The web view: one page, and the scan behind it as JSON. Local only, nothing stored; the
// GitHub token, if any, stays here.
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { AtlasError } from './core/errors.ts';
import { skillLink } from './core/model.ts';
import { scan, type Source } from './core/scan.ts';

const PAGE = new URL('./web/index.html', import.meta.url);
const FILTER = new URL('./web/filter.js', import.meta.url);

export type WebContext = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source>;
};

/** `GET /`, the page, and `GET /filter.js`, its filter; `GET /api/scan?repo=<input>`, `{ repository, skills, warnings }` or `400 { error }`. */
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
    if (url.pathname === '/filter.js') return send(200, 'text/javascript', await readFile(FILTER, 'utf8'));
    if (url.pathname !== '/api/scan') return json(404, { error: `Not found: ${url.pathname}` });
    const input = url.searchParams.get('repo')?.trim();
    if (!input) return json(400, { error: 'Enter owner/repo, a GitHub link or a directory' });
    try {
      const result = await scan(await context.open(input));
      const skills = result.skills.map((skill) => ({ ...skill, link: skillLink(result.repository, skill) }));
      json(200, { repository: result.repository, skills, warnings: result.warnings });
    } catch (error) {
      if (error instanceof AtlasError) json(400, { error: error.message });
      else json(500, { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
    }
  });
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
