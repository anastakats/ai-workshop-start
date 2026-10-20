# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
## Output
Every skill: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community, with `GITHUB_TOKEN`
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
## Where skills live
As the [Agent Skills format](https://agentskills.io/specification) defines: a skill is a *directory* with a `SKILL.md`.
- Only these paths, from the repository root, with `<name>` one directory:
  `.agents/skills/<name>/SKILL.md`, `.claude/skills/<name>/SKILL.md`, `.github/skills/<name>/SKILL.md`
- The file is named exactly `SKILL.md`; YAML front matter with `name` and `description`, then Markdown
- Anywhere else (deeper, the repository root, a skill root inside a subdirectory, `docs/`, other names) → *not a skill*, ignored silently
- **Duplicates**: the same `<name>` directory in several roots → *one* skill; the first root in the list above is read and linked, the others are its copies (`also in`), not read
