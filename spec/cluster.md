# Clustering
The skills in groups, by a model, *by request*: in the web view, one level a click; on the command line, every level.
## Groups
- A **group**: a title, 1 to 4 words, and its skills; every skill in exactly one group of a level, 2 to 5 groups
- A group of *3 or more* skills can be clustered again; *fewer than 3*: the smallest, not clustered
- The model reads the skills' **name** and **description** only, a line each: `N. name — description`, numbered; not the `SKILL.md`
- Its answer, JSON: `{"groups": [{"title", "skills": [<numbers>]}]}`, in a code block or not
  - A number out of range: ignored; a skill in two groups: in the first; twice in one, once; in none: in `Other`; an empty group: dropped; no title: `Group N`
  - Not JSON, or no `groups`: `The model's answer is not groups: <its start>`; all in one group: `The model put all N skills in one group`
- The most skills first, then by title; in a group, the skills sorted as everywhere ([by name](analysis.md#output))
- *Nothing is stored*: asked again, the model may answer other groups
## The model
- `claude -p`, **Haiku** (`haiku`) by default; `SKILL_ATLAS_MODEL`, another one (`sonnet`, a model's full name)
- In a **Docker container**, [scripts/claude-docker.sh](../scripts/claude-docker.sh), the image from [scripts/claude/Dockerfile](../scripts/claude/Dockerfile), built once:
  - No files of the host, a read-only file system, no capabilities; *no tools* for the model (`--tools ''`), `--bare`, no session kept
  - The key and the address from **JetBrains Central**, `central` or `jbcentral`: `proxy start --ensure-updated --return-key`; its port, `proxy_port` in `~/.jetbrains-central/config.json`, `19516` without it
  - `ANTHROPIC_BASE_URL=http://host.docker.internal:<port>/wire/<key>/claude-code/anthropic`
  - No Central: `JetBrains Central is not installed: no central or jbcentral on PATH`, exit code 1
- `SKILL_ATLAS_CLAUDE`: another command instead of the script, the prompt on stdin, the answer on stdout
- It fails: `The model failed (<model>, exit code N): <the last 3 lines of its stderr>`; cannot start: `Cannot run the model, <command>: <why>`; no answer in 180 s: `The model did not answer in 180 s`
- [scripts/sbx-claude.sh](../scripts/sbx-claude.sh) `<name>`: not for clustering; a worktree and a [Docker sandbox](https://docs.docker.com/ai/sandboxes/) with Claude Code in it, the model through Central
## Command line
`./skill-atlas cluster <GitHub URL | owner/repo | directory>`: scanned as `scan` does, then clustered, *every* level, the groups of a level at the same time
```
fixture · 6 skills · 2 groups
Code and releases · 3 skills
  Commits and releases · 2 skills
    commits — Write commit messages the way this repository does.
    release-checklist
  Code style · 1 skill
    code-style — Follow the project's code style.
```
- A group, `<title> · N skills`; under it, two spaces deeper, its groups, or else its skills: the name and the description's first sentence
- Fewer than 3 skills: `<repo> · N skills · fewer than 3, not clustered`, the skills; the model is not asked
- The first level fails: the message, exit code 1; a deeper one: that group not clustered, its skills listed, and a warning on *stderr*, `A › B: not clustered: <why>`
- The scan's warnings, on *stderr* too
## Web
- After a scan of 3 or more skills, over the list: the **path**, `All skills › A › B`, and **Cluster**
- **Cluster**: the group on the left, clustered; `Clustering…`, disabled, until the model answers; then its groups: the title, `N skills · <their names>`
- A group clicked: opened, its skills; *3 or more*: **Cluster** again; fewer: no **Cluster**
- The path: each group above a click away, as it was left, clustered or not; a group opened again is not asked again
- Clustered: **Ungroup**, its skills again, its groups forgotten
- The filter: in a clustered group, its skills that match, `N of M` of the group's; emptied, the groups again
- The selected skill stays on the right; a new scan, `All skills`, not clustered; *not in the URL*: a reload, not clustered
- The model fails: its message under the header, the scan's warnings kept, the list as it was; clicked again, one message
### Server
- `POST /api/cluster`, `{ skills: [{ id, name, description }] }` → `{ groups: [{ title, skills }] }`, one level, each group the ids of its skills; the page sends the skills, *nothing is stored*
- `Content-Type: application/json` only, else `415 { error }`: another site's page cannot send it without asking the server first, and it never agrees
- A clear message → `400 { error }`: not that JSON, an id twice, fewer than 3, over 4 MB, the model's; without a model, `Clustering is not set up on this server`; another method, `405`
- The page goes away → the model is stopped
## Tests
[tests/cluster.test.ts](../tests/cluster.test.ts), [e2e/cluster.spec.ts](../e2e/cluster.spec.ts): the model answered from a recording, by the names it is asked about ([tests/helpers.ts](../tests/helpers.ts)), `tests/recorded-model.ts` as `SKILL_ATLAS_CLAUDE`; the script with stand-ins for Central and Docker. A real model: not tested.
