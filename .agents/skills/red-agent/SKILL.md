---
name: red-agent
description: Break the web view on purpose, then file a GitHub issue per major bug, with steps and a video. Use when asked to attack, break, red-team or bug-hunt the web view.
---

# Red agent: break the web view

You are not here to fix anything: find the bugs a user would hit in the web view (`./skill-atlas serve`),
prove each one with a video, and file an issue for it. *Only the major ones*; an issue nobody needs is noise.

## 1. Know what it should do

- [spec/web.md](../../../spec/web.md): what the page promises; a bug is the page *not doing what it says*, or
  doing something no spec would allow (a crash, wrong data, a hang, HTML injected)
- [src/web.ts](../../../src/web.ts), [src/web/index.html](../../../src/web/index.html), [src/web/filter.js](../../../src/web/filter.js),
  [src/web/markdown.js](../../../src/web/markdown.js): where it can go wrong
- [demo/README.md](../../../demo/README.md): how a video is recorded
- The issues already open, not to file one twice: `gh issue list -R <origin> --state all --label bug --limit 100`

`<origin>`: the repository of `git remote get-url origin` (`owner/repo`), *not* `upstream`.

## 2. Attack

`npm ci`, `npx playwright install chromium` once, then the real page: `./skill-atlas serve --port 3300`, or, with
GitHub answered from the recording, `PORT=3300 node e2e/server.ts`. Drive it with Playwright, as a user would and as
one should not. Places to push on:

- **Input**: empty, spaces, a very long one, `owner/repo/extra`, `https://github.com/a/b/tree/x`, `github.com/`,
  a path that does not exist, a file instead of a directory, `..`, unicode, `%`, `#`, `&`, `?` in it
- **Hostile skills**: a local directory of your own, *outside the checkout* (`${TMPDIR:-/tmp}/red-agent/<case>`; `TMPDIR` is often unset on Linux), scanned by its path:
  a `SKILL.md` with `<script>`, `<img onerror>`, `javascript:` links, a name or description with HTML in it, huge
  front matter, YAML anchors and aliases, a front matter that is not a mapping, no closing `---`, 1 MB of Markdown,
  hundreds of skills, two skills of the same name
- **The URL**: `?repo=` and `&skill=` crafted, encoded twice, a skill that is not there; reload, Back, Forward, fast
- **Races**: Scan twice quickly, a scan then Back before it answers, the filter typed while it scans, an organization
  scan left halfway
- **Filter**: regex characters (`.*`, `(`, `\`), HTML, a match inside a highlight, a very long text
- **Organization**: `github.com/JetBrains` (recorded), `+K more`, a click on a repository mid-scan
- **Server**: `curl` the API directly: other methods, missing and repeated parameters, paths like `/../`

Watch the browser console and the server's output: an uncaught error counts.

## 3. Keep only the major ones

File it when a user would care:

- **Security**: script or HTML from a `SKILL.md`, a URL or a name runs or renders; the token or a local file leaks
- **Wrong or lost data**: a skill missing, another skill shown, a wrong link, a wrong count
- **Stuck or broken**: a crash, a blank page, a hang, a state only a reload fixes, the URL and the page disagreeing
- **The spec broken** in a way a user sees

Do *not* file: cosmetics (a pixel, a color, wrapping), wording, slowness on absurd input, anything only `curl` sees
without a consequence, what the spec itself allows, an enhancement. Several symptoms with one cause: one issue.
Unsure it is major: leave it out, and list it in your summary instead.

## 4. Prove each one: a video

A demo per bug, `demo/red-<slug>.demo.ts`, from [web.demo.ts](../../../demo/web.demo.ts): the steps of the issue, one
`caption()` each, ending on the bug with a caption `Expected: …; actual: …`. Its `expect`s check *the bug*, so the demo
passes only while it is there; a demo that does not pass twice in a row is not a bug you can file.
Hostile skills: written by the demo itself to a temporary directory, so the demo needs nothing else.

```console
$ npm run demo -- red-<slug>          # demo-videos/<title>.webm
```

Watch the video: it must show the bug without the issue's text. 10–30 seconds.

The videos, on a branch of their own, `red-agent`, never on `main`: GitHub's API cannot attach a file to an issue.
From the checkout; `red-agent` continued if it is on `origin` already, a new orphan branch otherwise (an orphan over an
existing one would not push):

```console
$ RED="${TMPDIR:-/tmp}/red-agent-branch"
$ if git fetch origin red-agent; then git worktree add -B red-agent "$RED" origin/red-agent; else git worktree add --orphan -b red-agent "$RED"; fi
$ mkdir -p "$RED/<slug>" && cp demo-videos/<title>.webm demo/red-<slug>.demo.ts "$RED/<slug>/"
$ ffmpeg -i demo-videos/<title>.webm -vf "fps=10,scale=960:-1" "$RED/<slug>/<slug>.gif"   # with ffmpeg: a GIF, inline in the issue
$ git -C "$RED" add -A && git -C "$RED" commit -m "Red agent: <slug>" && git -C "$RED" push origin red-agent
$ git worktree remove "$RED"
```

`<title>`: the video's file name, `demo-videos/<title>.webm` ([spec/demo.md](../../../spec/demo.md)). The GIF before the
commit: the issue links to it. Then take `demo/red-<slug>.demo.ts` out of the checkout: `git status` stays clean
([spec/workspace.md](../../../spec/workspace.md)).

## 5. An issue per bug

```console
$ gh issue create -R <origin> --label bug --title "<what breaks, in a user's words>" --body-file <body.md>
```

The body:

```markdown
**What happens**: one or two sentences.
**Expected**: what spec/web.md says, linked to its section.

## Steps
1. `./skill-atlas serve` (or the input, the files to create)
2. …
3. …

## Video
![<slug>](https://raw.githubusercontent.com/<origin>/red-agent/<slug>/<slug>.gif)
[The video](https://github.com/<origin>/blob/red-agent/<slug>/<title>.webm), recorded by
[the demo](https://github.com/<origin>/blob/red-agent/<slug>/red-<slug>.demo.ts): `npm run demo -- red-<slug>`.

## Where
`src/web/index.html:123`, if you found the cause; a guess, said as one.

Found by the red agent.
```

Steps a person can follow without the demo: exact input, exact files, every click. No fix in the issue, no pull
request: that is another agent's job.

## 6. Report

To the user: the issues filed, each a link and a line; what you tried that held; the minor things left out.
