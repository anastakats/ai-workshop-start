// The web view for the end-to-end tests: the real server, with GitHub answering from the
// recording in tests/helpers.ts, so a scan never reaches the network.
import { createWebServer, listen } from '../src/web.ts';
import { open } from '../tests/helpers.ts';

console.log(`Skill Atlas at ${await listen(createWebServer({ open }), Number(process.env.PORT ?? 3100))}`);
