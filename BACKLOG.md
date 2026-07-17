# Gist backlog

Deferred work, roughly in priority order.

## Local-checkout capture mode

Today `gist run` is **URL-based**: it needs both the base (production) and head
(PR preview) to be live at a URL, and auto-detects the preview via `gh`. That
requires the PR to be deployed somewhere (Vercel/Netlify/Cloudflare preview).

**Local-checkout mode** would capture an undeployed branch entirely on the
user's machine — no deploy needed:

```
gist run --pr 42 --local
  → git stash (save uncommitted work)
  → git checkout <base branch> → boot dev server → screenshot localhost   (before)
  → git checkout <PR branch>   → boot dev server → screenshot localhost   (after)
  → git checkout - ; git stash pop (restore)
```

Open questions to resolve before building:
- How does Gist learn the dev-server command/port? (`config.dev = { command, port,
  readyPath }`? auto-detect `npm run dev`?)
- Readiness: poll the port / a health path until 200 before capturing.
- Safety: never lose uncommitted work — stash/restore, and refuse if the tree
  is dirty and can't be stashed.
- Server lifecycle: start, wait, capture all routes, tear down cleanly even on
  error.

This is a meaningfully bigger, more fragile chunk than URL-based capture, which
is why it was deferred. Pairs with the existing `--base`/`--head` overrides.

## Other

- Salvage the parked React report surface (`_backup/app`, `_backup/lib`) into a
  richer `gist ui` if the static viewer proves too plain.
- Tune preview-URL patterns for Vercel/Netlify against real PRs (only Cloudflare
  was tested).
- Publish `@gist/review` to npm.
