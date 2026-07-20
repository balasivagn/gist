# Gist backlog

Deferred work, roughly in priority order.

## Publish to npm

`@gist/review` is not yet published to npm. Currently installable via:
```sh
npm install -g balasivagn/gist        # from main branch
npm install -g .                      # from local source
```

Blocked on: choosing a stable package name, writing a publish workflow.

## Tune preview-URL patterns for Vercel / Netlify

Only Cloudflare Workers/Pages has been tested end-to-end. The Vercel and Netlify
patterns in `src/resolve.ts` were written by inspection of docs — not validated
against real PRs.

## Local-checkout capture mode

Today `gist run` is **URL-based**: it needs both the base (production) and head
(PR preview) to be live at a URL. **Local-checkout mode** would capture an
undeployed branch on the user's machine — no deploy needed:

```
gist run --pr 42 --local
  → git stash
  → git checkout <base branch> → boot dev server → screenshot localhost   (before)
  → git checkout <PR branch>   → boot dev server → screenshot localhost   (after)
  → git checkout - ; git stash pop
```

Open questions: dev-server command/port detection, readiness polling, safety
with dirty trees, server lifecycle on error. Deferred — more fragile than
URL-based capture.

## Region coordinate accuracy

The `/gist` skill estimates `y`/`height` for each change region by visually
inspecting the diff image. A future pass could compute bounding boxes
deterministically from pixelmatch output — exact coordinates, no AI estimation.

## Mobile viewport in review UI

`gist run` captures mobile viewports when configured, but the CSS-crop region
panels in `gist ui` currently assume desktop widths. The `colW` constant in
`ui-shell.ts` is hardcoded — it should be derived from the viewport width in
`evidence.json`.

## Salvage the parked React report surface

`_backup/app` and `_backup/lib` contain the prior hosted/Next.js implementation.
If the static `gist ui` viewer proves too plain, these could be adapted into a
richer local UI.
