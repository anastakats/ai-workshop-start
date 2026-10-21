// A demo of the web view's server, local only (spec/web.md#server): the page and the API for
// Host: localhost or 127.0.0.1 with its port; another Host, as a browser sends after a DNS rebinding, refused.
import { caption, expect, pause, test, terminal } from './demo.ts';

test('local only', async ({ page }) => {
  const scan = "'http://127.0.0.1:3200/api/scan?repo=./fixture'";
  const local = await terminal(page, `curl -s -H 'Host: localhost:3200' ${scan} | head -c 160`);
  expect(local).toContain('"repository"');
  await caption(page, 'Host: localhost:3200: the scan, every SKILL.md');

  const rebound = await terminal(page, `curl -s -w ' %{http_code}' -H 'Host: attacker.example:3200' ${scan}`);
  expect(rebound).toContain('{"error":"Not allowed: Host attacker.example:3200"} 403');
  await caption(page, 'Another site\'s name, resolved to 127.0.0.1: refused, 403', 2500);
  await pause(page);
});
