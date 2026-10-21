// Red agent: the server answers any Host, so a web page rebound to 127.0.0.1 (DNS rebinding) reads its API.
import { caption, expect, pause, test, terminal } from './demo.ts';

test('red any host', async ({ page }) => {
  const port = 3200; // playwright.demo.config.ts
  const own = await terminal(page, `curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:${port}/`);
  expect(own.trim()).toBe('200');
  await caption(page, 'Skill Atlas, running locally: the page, for this browser', 2500);

  // What a browser sends to it from another site, once that site's name resolves to 127.0.0.1.
  const output = await terminal(page, `curl -s -H 'Host: attacker.example:${port}' 'http://127.0.0.1:${port}/api/scan?repo=./fixture' | grep -o '"content":"[^"]\\{0,70\\}' | head -4`);
  expect(output).toContain('"content"');
  await caption(page, 'Host: attacker.example, and it still answers: every SKILL.md, content included', 3500);
  await caption(page, 'A site rebound to 127.0.0.1 reads any local directory, or a private repository with the token', 3500);
  await caption(page, 'Expected: only Host localhost or 127.0.0.1; actual: any Host', 3000);
  await pause(page);
});
