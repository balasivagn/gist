# Gist

> **Approve website changes without reading code.**

Gist turns a website pull request into a before/after visual review: deterministic
screenshots of every page, a local diff UI, and a plain-English AI walkthrough
written by the coding agent you already have. No hosted service, no API keys.

## Install

Node.js 22+.

```sh
npm install -g @balasivagnanam/gist
gist init
```

`gist init` installs the Playwright browser (one-time, ~150 MB), scaffolds
`.gist/config.json`, and installs the `/gist` skill into `.claude/skills/`.

## Use

```sh
# 1. Edit .gist/config.json — set your production URL and routes

# 2. Capture a PR (uses gh to find the preview URL automatically):
gist run --pr 42

# 3. In Claude Code, run /gist — writes the walkthrough and opens the review UI
```

That's it. The browser opens to `http://127.0.0.1:4100` with the full review:
what changed, what looks intentional, and what's worth a closer look — with
annotated before/after panels for every change region.

## How it works

1. **`gist run`** — Playwright captures every route at every viewport on base
   (production) and head (PR preview), pixel-diffs them, writes screenshots +
   `evidence.json` into a gitignored `.gist/` folder.
2. **`/gist` skill** — inside Claude Code, reads the evidence + full PR
   description, classifies each change as intentional or worth a look, writes
   `summary.md` + `regions.json`, opens the review UI.
3. **`gist ui`** — local viewer with annotated before/after panels per region.
   Never calls an LLM.

## Full docs

[github.com/balasivagn/gist](https://github.com/balasivagn/gist)
