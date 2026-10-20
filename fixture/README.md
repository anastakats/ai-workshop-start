# fixture

A small repository for the tests.

| Path | Case |
| --- | --- |
| `.claude/skills/commits` | a skill |
| `.github/skills/code-style` | a skill in another agent's folder |
| `.agents/skills/release-checklist` | malformed front matter |
| `.agents/skills/plain-notes` | no front matter |
| `.claude/skills/no-name` | no `name`: the directory's |
| `.github/skills/no-description` | no `description` |
| `.github/skills/commits` | the same skill again: a copy |
| `SKILL.md` | at the root: not a skill |
| `docs/skills/guide` | outside a skill root: not a skill |
| `.claude/skills/commits/examples` | deeper than `<root>/<name>`: not a skill |
| `.claude/skills/SKILL.md` | directly in a skill root: not a skill |
| `.claude/skills/review/skill.md` | not named exactly `SKILL.md`: not a skill |
| `packages/app/.claude/skills/nested` | a skill root inside a subdirectory: not a skill |
| `agent/skills/legacy` | not a skill root: not a skill |
