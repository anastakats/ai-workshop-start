# Workspace
`npm ci`, `npm test`, `npm run e2e`, `npm run demo` and the editor: after any of them, `git status` is *clean*. In [.gitignore](../.gitignore):
- `node_modules/`
- Playwright's output: `test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/`
- The demos' ([demo.md](demo.md)): `demo-videos/`, `demo-results/`
- `*.tsbuildinfo`, `*.log`
- The editor's settings, *all of them*: `.idea/`, `.vscode/`, `.fleet/`, `*.swp`; the OS's: `.DS_Store`, `Thumbs.db`
- The code, the specs, the fixture, the demos' scripts: *never ignored*
## Tests
None: `.gitignore` is not tested.
