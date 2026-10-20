# Web
The target interface: scan a repository, then the skills on the left and the selected `SKILL.md` on the right.
![Skill Atlas in the browser: JetBrains/kotlin, 6 skills](web.png)
## Screen
- **Header**: `Skill Atlas`, a field `owner/repo or a GitHub link` (or a local directory), **Scan**; after a scan, `owner/repo` and `N skills`
- **Left**: every skill, sorted by **name**; under the name, the description on *one line*, cut with `…`
- **Right**: the selected skill's `SKILL.md`, *as it is*, with its link and `also in`; before a selection, `Select a skill to read its SKILL.md.`
- While it scans, the button is `Scanning…`, disabled
- Errors: the CLI's message, in the page, and no skills; warnings under the header
## Server
- Local only: listens on `127.0.0.1`; `GITHUB_TOKEN` stays on the server
- `GET /api/scan?repo=<input>` → `{ repository, skills, warnings }`, each skill with its `link` and `content`
- A clear message → `400 { error }`; *nothing is stored*
## Tests
The base scenarios end to end, in Chromium: `npm run e2e` (e2e/), with GitHub answered from a recording
