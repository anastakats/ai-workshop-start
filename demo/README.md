# Demo: a video of a feature, for its pull request

A new feature, and the pull request should show it working: write a demo, a Playwright script
that uses the feature the way a person would, and `npm run demo` records it as a video.

```console
$ npm ci
$ npx playwright install chromium         # once
$ npm run demo                            # every demo: demo-videos/*.webm
$ npm run demo -- web                     # only demo/web.demo.ts
```

A demo runs against the real web server with GitHub answered from the recording in
[tests/helpers.ts](../tests/helpers.ts) (as `npm run e2e`): no network, the same video each time.

## Write one

Copy [web.demo.ts](web.demo.ts) (the web view) or [cli.demo.ts](cli.demo.ts) (the command line)
to `demo/<feature>.demo.ts`, then show the feature, one step at a time. From [demo.ts](demo.ts):

- `test('<title>', …)`: the video is `demo-videos/<title>.webm`, `filter the skills` → `filter-the-skills.webm`
- `caption(page, text)`: what this step shows, at the bottom of the page, held ~2 s
- `type(locator, text)`: a click and one key at a time; `.click()` as usual, the cursor is drawn
- `pause(page, ms)`: time to look at a result
- `terminal(page, command)`: a shell command in this checkout, as `./skill-atlas scan ./fixture`, typed and printed in a terminal on the page; returns its output

Keep the `expect`s: a demo that passes shows what it says. Short is better, 10–30 seconds:
the feature, not the whole app. Watch the video before you share it.

## Put it in the pull request

- **By hand**: drag `demo-videos/<title>.webm` into the pull request's description or a comment.
  GitHub plays `.webm`, `.mp4` and `.mov`, up to 10 MB (100 MB on paid plans).
- **In CI**: every run uploads `demo-videos/` as the `demo-videos` artifact
  ([ci.yml](../.github/workflows/ci.yml)), linked from the run's summary. Without a browser at hand
  (an agent, for example), push the demo and link the run in the pull request.
- **A GIF**, to show it inline in a comment:
  `ffmpeg -i demo-videos/web-view.webm -vf "fps=10,scale=960:-1" demo-videos/web-view.gif`

Do not commit the videos: `demo-videos/` is ignored.

## Without Playwright's downloads

Where `npx playwright install chromium` cannot download (a sandbox, a proxy):

- Another Chromium: `CHROMIUM_PATH=<chromium> npm run demo`
- Another ffmpeg for the video, with VP8 (`libvpx`), where Playwright looks for its own:
  `mkdir -p ~/.cache/ms-playwright/ffmpeg-1013 && ln -s "$(which ffmpeg)" ~/.cache/ms-playwright/ffmpeg-1013/ffmpeg-linux`
  (the number: `ffmpeg` in `node_modules/playwright-core/browsers.json`)
