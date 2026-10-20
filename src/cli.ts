#!/usr/bin/env node
// The Node client: a GitHub repository through the GitHub API, or a local directory; stdout and
// stderr, or the web view, which scans a GitHub organization too. Nothing is stored.
import { run } from './commands.ts';
import { scanOrganization } from './core/organization.ts';
import { openInput } from './local.ts';
import { createWebServer, listen, type WebContext } from './web.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const open = (input: string) => openInput(input, { fetch, token });
const organization: WebContext['organization'] = (input, options) => scanOrganization(input, { fetch, token, ...options });

process.exitCode = await run(process.argv.slice(2), {
  open,
  print: (text) => console.log(text),
  error: (text) => console.error(text),
  serve: (port) => listen(createWebServer({ open, organization }), port),
});
