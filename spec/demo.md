# Demo
A video of a feature, for its pull request: a Playwright script, `demo/<feature>.demo.ts`; how to write one, [demo/README.md](../demo/README.md).
## Run
- `npm run demo`: every `demo/*.demo.ts`, in Chromium; each test a video, `demo-videos/<title>.webm`, the title in lower case, `-` for the rest: `Filter the skills!` → `filter-the-skills.webm`
- `npm run demo -- <name>`: only the demos whose file matches
- Against the web view's server with GitHub answered from the recording in [tests/helpers.ts](../tests/helpers.ts): *no network*
- A demo's `expect` that fails: the run fails; the video is still saved, to see what went wrong
- `demo-videos/` and `demo-results/` are not committed
## In the page
- A cursor, `#demo-cursor`: headless Chromium draws none
- `caption(page, text)`: the text at the bottom of the page, until the next one
- `terminal(page, command)`: the command run in the checkout, typed after `$ `, then what it prints, *stderr too*; returns that output, even when the command fails
## Tests
`tests/demo.test.ts`, on demos of its own, with Chromium; without it (`npx playwright install chromium` or `CHROMIUM_PATH`), skipped. In CI, run.
