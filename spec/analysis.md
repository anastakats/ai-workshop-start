# Repository analysis
## Input
A **GitHub repository**: a URL or `owner/repo`; or a local directory
- An existing directory wins over `owner/repo`
## Output
Every skill: **name**, **description**, **link**, its `SKILL.md`, when it was **last updated**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit, updated
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community, with `GITHUB_TOKEN`
- With `GITHUB_TOKEN`, private repositories it sees too: `SKILL.md` is read with the token
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- A listed `SKILL.md` that cannot be read → a *warning* that says why, the scan goes on:
  - GitHub code search lists a file not in the scanned commit → its index lags behind the default branch, the file was probably moved or deleted
  - In the tree, but GitHub answers 404 for it → the commit and the 404
  - A local file deleted since the directory was listed, or unreadable → that, with the error
- Unreachable repository → a clear message, exit code 1
## Last updated
- A skill is updated when its *directory* changes, any file in it: the date of the *last commit* that changed it, up to the scanned commit
- On GitHub: one more request for each skill, at the same time as its `SKILL.md`; the commit's committer date
- A local directory: the last commit from `git log`; outside git, or not committed yet, when its `SKILL.md` was modified
- In UTC, ISO 8601: `updated`, empty if unknown; shown as the day, `2026-10-12`
- The repository: *last updated*, the latest of its skills', on the command line; the web view shows each skill's, not the repository's
- A date that cannot be had (the rate limit, an error) → the skill without it and a *warning*, one for each reason with how many skills, the scan goes on:
  `the last update of 2 skills is unknown: GitHub rate limit reached; set GITHUB_TOKEN`
- Copies: not dated, as they are not read
## Where skills live
As the [Agent Skills format](https://agentskills.io/specification) defines: a skill is a *directory* with a `SKILL.md`.
- Only these paths, from the repository root, with `<name>` one directory:
  `.agents/skills/<name>/SKILL.md`, `.claude/skills/<name>/SKILL.md`, `.github/skills/<name>/SKILL.md`
- The file is named exactly `SKILL.md`; YAML front matter with `name` and `description`, then Markdown
- Anywhere else (deeper, the repository root, a skill root inside a subdirectory, `docs/`, other names) → *not a skill*, ignored silently
- **Duplicates**: the same `<name>` directory in several roots → *one* skill; the first root in the list above is read and linked, the others are its copies (`also in`), not read
