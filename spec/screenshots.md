# Screenshots
Each pull request, as it looks: the e2e tests on its base (`main`) and on the pull request, a screenshot at each step, compared; what differs, *highlighted*, attached to the pull request.
## Steps
- An e2e test ([e2e/](../e2e/)) is split into steps: `step(title, body)` from [e2e/steps.ts](../e2e/steps.ts), a Playwright step
- After each step, a screenshot of the whole page: `screenshots/<spec>/<test>/<NN>-<step>.png`, the titles in lower case, `-` for the rest, `NN` from `01`
- The same pixels on every run: no animation, no caret; two steps with the same name in a test → the test fails
- `npm run e2e` makes them; a failing test, its screenshots until then; `screenshots/` is not committed
## Compare
`npm run screenshots:compare -- <base> <pr> <out>` ([scripts/compare-screenshots.ts](../scripts/compare-screenshots.ts)): two `screenshots/`, step by step
- A step is its test and its name, *not its number*: a step added before another does not change it
- Each step: `changed` (how many pixels), `added` (only in the pull request), `removed` (only in the base) or `unchanged`
- Pixel by pixel, with [pixelmatch](https://github.com/mapbox/pixelmatch); anti-aliasing is not a difference; of different sizes, the smaller one extended, the rest differs
- For a step that differs, in `<out>`, under its path: `.base.png`, `.pr.png` and `.diff.png`, the base faded and what differs in red; nothing for the others
- `report.md`: `N changed, N added, N removed, N unchanged, of N steps.` (or `No differences: N steps, the same pixels.`), then a row per step that differs, up to 40: the base, the pull request, the difference; `--images-url <url>`: the images there, not next to it; `--base-name`: the base's name, `main` without it
- `index.html`: the same, every step that differs, to open from the downloaded test results; `report.json`: every step and the counts
- The exit code: `0` with differences too, it is a report; `2` for a wrong command line
## CI
[.github/workflows/ci.yml](../.github/workflows/ci.yml), the `screenshots` job, for a pull request:
- The e2e tests of the pull request, then of its base, in the same directory; a failing test does not stop the comparison, the `test` job fails
- A base before `e2e/steps.ts`: no screenshots, every step `added`
- The comparison, in the run's summary and in *one comment* on the pull request, updated by each run; the images, on the branch `screenshots`, `pr-<N>/<run>/`, the pull request's earlier ones removed
- The artifact `screenshots`: `base/`, `pr/`, every screenshot; `diff/`, the report and the steps that differ
- A pull request from a fork cannot push or comment: then, only the artifact
- Every run, the `test` job's: `e2e-screenshots`, the screenshots of its e2e tests
## Tests
[tests/screenshots.test.ts](../tests/screenshots.test.ts): the comparison on screenshots of its own; the steps with Chromium, without it skipped. The CI job: not tested, it runs on each pull request.
