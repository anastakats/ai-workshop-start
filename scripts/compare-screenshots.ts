// Compares two runs of the end-to-end tests' screenshots (e2e/steps.ts), as CI does between main
// and a pull request (spec/screenshots.md): each step's, pixel by pixel; the differences in red.
//   node scripts/compare-screenshots.ts <base> <pr> <out> [--base-name main] [--images-url <url>]
// In <out>: report.md, index.html and report.json; for each step that differs, its screenshots.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { parseArgs } from 'node:util';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export type Status = 'changed' | 'added' | 'removed' | 'unchanged';

export interface StepResult {
  /** The test's directory, `web/the-empty-page`. */
  test: string;
  /** The step's file name, without `.png`: `01-the-empty-page`. */
  step: string;
  status: Status;
  /** Changed: how many pixels differ. */
  pixels?: number;
  /** Relative to <out>, the screenshots kept: the base's, the pull request's, their difference. */
  images: { base?: string; pr?: string; diff?: string };
}

export interface Report {
  counts: Record<Status, number>;
  steps: StepResult[];
}

/** At most this many steps in report.md: a pull request comment holds 65,536 characters. */
const MARKDOWN_STEPS = 40;

/** Every screenshot under a directory, by its path from there with `/`. */
function screenshots(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.png'))
    .map((path) => path.split(sep).join('/'))
    .sort();
}

/** A step is compared by its test and its name, not its number: a step added before it renumbers it. */
const key = (path: string) => path.replace(/(^|\/)\d+-([^/]+)$/, '$1$2');

/** The image, on a transparent canvas of the given size: screenshots of different sizes, compared. */
function resized(image: PNG, width: number, height: number): PNG {
  if (image.width === width && image.height === height) return image;
  const canvas = new PNG({ width, height });
  PNG.bitblt(image, canvas, 0, 0, image.width, image.height, 0, 0);
  return canvas;
}

/** How many pixels differ, and the difference: the base faded, what differs in red. */
export function difference(base: Buffer, pr: Buffer): { pixels: number; diff: PNG } {
  const [a, b] = [PNG.sync.read(base), PNG.sync.read(pr)];
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const diff = new PNG({ width, height });
  const pixels = pixelmatch(resized(a, width, height).data, resized(b, width, height).data, diff.data, width, height, { threshold: 0.1 });
  return { pixels, diff };
}

export function compare(baseDir: string, prDir: string, out: string): Report {
  const base = new Map(screenshots(baseDir).map((path) => [key(path), path]));
  const pr = new Map(screenshots(prDir).map((path) => [key(path), path]));
  const keys = [...new Set([...pr.keys(), ...base.keys()])].sort((x, y) => (pr.get(x) ?? base.get(x))!.localeCompare((pr.get(y) ?? base.get(y))!));
  const steps: StepResult[] = [];
  const keep = (path: string, data: Buffer) => {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), data);
    return path;
  };
  for (const name of keys) {
    const [basePath, prPath] = [base.get(name), pr.get(name)];
    const path = (prPath ?? basePath)!.replace(/\.png$/, '');
    const result: StepResult = { test: dirname(path), step: path.slice(dirname(path).length + 1), status: 'unchanged', images: {} };
    const baseData = basePath ? readFileSync(join(baseDir, basePath)) : undefined;
    const prData = prPath ? readFileSync(join(prDir, prPath)) : undefined;
    if (!baseData) {
      result.status = 'added';
      result.images.pr = keep(`${path}.pr.png`, prData!);
    } else if (!prData) {
      result.status = 'removed';
      result.images.base = keep(`${path}.base.png`, baseData);
    } else if (!baseData.equals(prData)) {
      const { pixels, diff } = difference(baseData, prData);
      if (pixels > 0) {
        Object.assign(result, { status: 'changed', pixels });
        result.images = { base: keep(`${path}.base.png`, baseData), pr: keep(`${path}.pr.png`, prData), diff: keep(`${path}.diff.png`, PNG.sync.write(diff)) };
      }
    }
    steps.push(result);
  }
  const counts: Record<Status, number> = { changed: 0, added: 0, removed: 0, unchanged: 0 };
  for (const step of steps) counts[step.status]++;
  return { counts, steps };
}

export function summary({ counts, steps }: Report): string {
  const differ = counts.changed + counts.added + counts.removed;
  if (steps.length === 0) return 'No screenshots to compare.';
  if (differ === 0) return `No differences: ${steps.length} steps, the same pixels.`;
  return `${counts.changed} changed, ${counts.added} added, ${counts.removed} removed, ${counts.unchanged} unchanged, of ${steps.length} steps.`;
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`);
const status = (step: StepResult) => (step.status === 'changed' ? `changed, ${step.pixels} pixels` : step.status);

/** The steps that differ, a row each: the base's screenshot, the pull request's, their difference. */
function table(report: Report, src: (path: string) => string, baseName: string, limit = Infinity): string {
  const img = (path?: string) => (path ? `<a href="${escape(src(path))}"><img src="${escape(src(path))}" width="260"></a>` : '');
  const differ = report.steps.filter((step) => step.status !== 'unchanged');
  const rows = differ.slice(0, limit).map(
    (step) => `<tr><td><code>${escape(step.test)}</code><br><b>${escape(step.step)}</b><br>${status(step)}</td><td>${img(step.images.base)}</td><td>${img(step.images.pr)}</td><td>${img(step.images.diff)}</td></tr>`,
  );
  const more = differ.length > limit ? `\n\n…and ${differ.length - limit} more steps that differ: in the test results.` : '';
  return rows.length === 0
    ? ''
    : `<table>\n<tr><th>Step</th><th>${escape(baseName)}</th><th>This pull request</th><th>Difference</th></tr>\n${rows.join('\n')}\n</table>${more}`;
}

/** report.md: for a pull request comment; the images under imagesUrl, else next to it. */
export function markdown(report: Report, { baseName = 'main', imagesUrl = '' } = {}): string {
  const src = (path: string) => (imagesUrl ? `${imagesUrl.replace(/\/$/, '')}/${path.split('/').map(encodeURIComponent).join('/')}` : path);
  const rows = table(report, src, baseName, MARKDOWN_STEPS);
  return `### Screenshots: ${baseName} → this pull request\n\n${summary(report)}\n${rows ? `\n${rows}\n` : ''}`;
}

/** index.html: the same, to open from the downloaded test results. */
export function html(report: Report, { baseName = 'main' } = {}): string {
  const src = (path: string) => path.split('/').map(encodeURIComponent).join('/');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Screenshots: ${escape(baseName)} → this pull request</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:24px}td,th{border:1px solid #ccc;padding:6px;vertical-align:top;text-align:left}table{border-collapse:collapse}</style>
</head><body>
<h1>Screenshots: ${escape(baseName)} → this pull request</h1>
<p id="summary">${escape(summary(report))}</p>
${table(report, src, baseName)}
</body></html>
`;
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'base-name': { type: 'string' }, 'images-url': { type: 'string' } } });
  if (positionals.length !== 3) {
    console.error('Usage: node scripts/compare-screenshots.ts <base> <pr> <out> [--base-name main] [--images-url <url>]');
    process.exit(2);
  }
  const [baseDir, prDir, out] = positionals;
  const options = { baseName: values['base-name'] ?? 'main', imagesUrl: values['images-url'] ?? '' };
  mkdirSync(out, { recursive: true });
  const report = compare(baseDir, prDir, out);
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(out, 'report.md'), markdown(report, options));
  writeFileSync(join(out, 'index.html'), html(report, options));
  console.log(`${summary(report)} The report: ${relative(process.cwd(), join(out, 'index.html')) || 'index.html'}`);
}
