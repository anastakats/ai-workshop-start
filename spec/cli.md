# Command line
`./skill-atlas scan <GitHub URL | owner/repo | directory>`
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit. Without it, the GitHub CLI's token for github.com, if `gh auth login` was run: `gh auth token --hostname github.com`, not `GH_HOST`'s; no `gh`, or not logged in, no token.
The rate limit without a token: `GitHub rate limit reached; set GITHUB_TOKEN or log in with gh auth login`; with one, `try again in a minute`.
A token GitHub rejects: `GitHub rejected the token; check GITHUB_TOKEN, or gh auth status`.
## Output
```
JetBrains/kotlin · 6 skills · last updated 2026-10-12
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
  updated 2026-10-12
```
- Sorted by **name**; the description's *first sentence*
- `also in <paths>` for copies; warnings go to *stderr*
- `updated <day>` under each skill, and `· last updated <day>`, the latest, in the first line; unknown, not printed ([Last updated](analysis.md#last-updated))
## Web
`./skill-atlas serve [--port N]`: the [web view](web.md) at `http://localhost:3000`, port 3000 by default
