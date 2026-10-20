// The end-to-end tests, one step at a time: `step(title, body)` runs the body as a Playwright step,
// then screenshots the page, screenshots/<spec>/<test>/<NN>-<step>.png (spec/screenshots.md).
// CI compares them between main and a pull request: scripts/compare-screenshots.ts.
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

// SCREENSHOTS: another directory for them, as tests/screenshots.test.ts uses.
export const SCREENSHOTS = process.env.SCREENSHOTS ?? fileURLToPath(new URL('../screenshots', import.meta.url));

/** `The filter: N of M!` → `the-filter-n-of-m`. */
export const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export type Step = (title: string, body: () => Promise<void>) => Promise<void>;

export const test = base.extend<{ step: Step }>({
  step: async ({ page }, use, testInfo) => {
    const dir = join(SCREENSHOTS, slug(basename(testInfo.file).replace(/\.spec\.ts$/, '')), slug(testInfo.title));
    const seen = new Set<string>();
    await use(async (title, body) => {
      const name = slug(title);
      // A step is compared by its name: two of them alike in a test would be compared with each other.
      if (seen.has(name)) throw new Error(`Two steps named "${name}" in "${testInfo.title}"`);
      seen.add(name);
      const path = join(dir, `${String(seen.size).padStart(2, '0')}-${name}.png`);
      await test.step(title, async () => {
        await body();
        mkdirSync(dir, { recursive: true });
        // The same pixels on every run: no animation, no blinking caret.
        await page.screenshot({ path, fullPage: true, animations: 'disabled', caret: 'hide' });
        await testInfo.attach(title, { path, contentType: 'image/png' });
      });
    });
  },
});
