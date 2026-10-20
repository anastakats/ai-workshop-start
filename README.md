# Skill Atlas

Every agent skill in a repository: `./skill-atlas scan` finds each `SKILL.md` and prints its name,
description and link.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
…
```

`owner/repo` works too. In the browser, `./skill-atlas serve` opens the [web view](spec/web.md) at
http://localhost:3000 (`--port N` for another port): the skills on the left, filtered by name or description,
the selected `SKILL.md` on the right. `github.com/<org>` in the same field scans a whole organization: its
repositories with skills, the most skills first.

Set `GITHUB_TOKEN` for a higher GitHub rate limit. `npm test` runs the tests; `npm run e2e`, the
web view in a browser (once: `npx playwright install chromium`; or `CHROMIUM_PATH=<chromium>`).

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
