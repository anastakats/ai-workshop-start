# Skill Atlas

Every agent skill in a repository: `./skill-atlas scan` finds each `SKILL.md` and prints its name,
description, link and when it was last updated.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills · last updated 2026-10-12
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
  updated 2026-10-12
…
```

`owner/repo` works too. In the browser, `./skill-atlas serve` opens the [web view](spec/web.md) at
http://localhost:3000 (`--port N` for another port): the skills on the left, filtered by name or description,
the selected `SKILL.md` on the right, rendered, its front matter a table. `github.com/<org>` in the same field scans a whole organization: its
repositories with skills, the most skills first. Before a scan, examples to click; the page's URL keeps the scan
and the selected skill (`?repo=JetBrains/kotlin&skill=…`), to reload or share; **Copy link** copies a skill's link.

Set `GITHUB_TOKEN`, or log in with `gh auth login`, for a higher GitHub rate limit: scanning
`github.com/JetBrains` needs it. `npm test` runs the tests; `npm run e2e`, the
web view in a browser (once: `npx playwright install chromium`; or `CHROMIUM_PATH=<chromium>`).
`npm run demo` records a video of a feature, to show it working in its pull request: [demo/](demo/README.md).
Each step of the e2e tests is screenshotted; on a pull request, CI compares the screenshots with its base's and
comments with the steps that differ, highlighted: [spec/screenshots.md](spec/screenshots.md).

- [spec/](spec/): what it does; after the tests and the demos, `git status` is clean ([spec/workspace.md](spec/workspace.md)). [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
