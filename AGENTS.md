# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Tests
Integration tests for every case in the spec.
E2E tests: one `step()` at a time, each one screenshotted; see [spec/screenshots.md](spec/screenshots.md).
## Definition of done
- All tests pass locally
## Demo
A new feature: a video of it in the pull request, `demo/<feature>.demo.ts`; see [demo/README.md](demo/README.md).

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests
- `npm run demo`: the demos, as videos in `demo-videos/`
