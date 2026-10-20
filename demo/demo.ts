// What a demo is made of: Playwright's test, with a visible cursor, captions, typing at a human
// pace and a terminal for the CLI; each test's video saved as demo-videos/<its title>.webm.
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test as base, type Locator, type Page } from '@playwright/test';

export { expect } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// DEMO_VIDEOS: another directory for the videos, as tests/demo.test.ts uses.
export const VIDEOS = process.env.DEMO_VIDEOS ?? fileURLToPath(new URL('../demo-videos', import.meta.url));

/** `filter the skills` → `filter-the-skills`. */
export const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// A headless browser draws no cursor: a dot follows the mouse, and grows on a click.
function showCursor() {
  const add = () => {
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.style.cssText =
      'position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;z-index:2147483647;' +
      'pointer-events:none;background:rgba(255,80,80,.55);border:2px solid #fff;box-shadow:0 0 4px #0008;transition:transform .15s';
    document.body.append(cursor);
    document.addEventListener('mousemove', (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    }, true);
    document.addEventListener('mousedown', () => (cursor.style.transform = 'scale(1.8)'), true);
    document.addEventListener('mouseup', () => (cursor.style.transform = ''), true);
  };
  if (document.body) add();
  else document.addEventListener('DOMContentLoaded', add);
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    await page.addInitScript(showCursor);
    await use(page);
    await page.close();
    mkdirSync(VIDEOS, { recursive: true });
    await page.video()?.saveAs(`${VIDEOS}/${slug(testInfo.title)}.webm`);
  },
});

/** Waits, so a viewer sees what just happened. */
export const pause = (page: Page, ms = 1000) => page.waitForTimeout(ms);

/** A caption at the bottom of the page, what this step shows; it stays until the next one. */
export async function caption(page: Page, text: string, ms = 1800) {
  await page.evaluate((text) => {
    let caption = document.getElementById('demo-caption');
    if (!caption) {
      caption = document.createElement('div');
      caption.id = 'demo-caption';
      caption.style.cssText =
        'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:80%;padding:10px 18px;border-radius:8px;' +
        'z-index:2147483646;pointer-events:none;background:#000c;color:#fff;font:600 20px/1.4 system-ui,sans-serif;text-align:center';
      document.body.append(caption);
    }
    caption.textContent = text;
  }, text);
  await pause(page, ms);
}

/** Types into a field the way a person does: a click, then one key at a time. */
export async function type(field: Locator, text: string) {
  await field.click();
  await field.pressSequentially(text, { delay: 70 });
}

/**
 * Runs a shell command in this checkout, as `./skill-atlas scan ./fixture`, and shows it in a
 * terminal on the page: the command typed, then what it prints, stderr too. Returns its output.
 */
export async function terminal(page: Page, command: string): Promise<string> {
  const { stdout } = await promisify(execFile)('sh', ['-c', `exec 2>&1; ${command}`], { cwd: ROOT, env: process.env }).catch(
    (error: { stdout?: string }) => ({ stdout: error.stdout ?? '' }),
  );
  await page.setContent(
    '<body style="margin:0;background:#1e1e1e"><pre id="terminal" style="margin:0;padding:24px;color:#ddd;white-space:pre-wrap;' +
      'font:16px/1.5 ui-monospace,Menlo,Consolas,monospace"></pre></body>',
  );
  const screen = page.locator('#terminal');
  const write = async (text: string, ms: number) => {
    await screen.evaluate((node, text) => (node.textContent += text), text);
    await page.waitForTimeout(ms);
  };
  await write('$ ', 300);
  for (const key of command) await write(key, 45);
  await pause(page, 500);
  for (const line of stdout.trimEnd().split('\n')) await write(`\n${line}`, 60);
  return stdout;
}
