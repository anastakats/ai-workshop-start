// The web view for the end-to-end tests: the real server, with GitHub and the model answering from
// the recordings in tests/helpers.ts, so a scan never reaches the network, nor clustering a model.
import { createWebServer, listen } from '../src/web.ts';
import { open, organization, recordedModel } from '../tests/helpers.ts';

console.log(`Skill Atlas at ${await listen(createWebServer({ open, organization, cluster: recordedModel() }), Number(process.env.PORT ?? 3100))}`);
