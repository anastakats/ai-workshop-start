# Command line
`./skill-atlas scan <GitHub URL | owner/repo | directory>`
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
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
