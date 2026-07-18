# Gist

> **Approve website changes without reading code.**

Gist turns a website pull request into a before/after visual review: deterministic screenshots of every page, a local diff UI, and a plain-English AI walkthrough through the coding agent you already have. No hosted service, no API keys.

## Install

Node.js 22+.

```sh
npm install -g @gist/review
gist init
```

`gist init` installs the Playwright browser (one-time, ~150 MB) and scaffolds `.gist/config.json`.

## Use

```sh
# 1. Edit .gist/config.json — set your production URL and routes

# 2. Capture a PR (uses gh to find the preview URL automatically)
gist run --pr 42

# 3. Generate the plain-English walkthrough, inside Claude Code
/gist

# 4. Review it locally
gist ui     # opens http://127.0.0.1:4100
```

## How it works

1. **`gist run`** — Playwright captures every configured route at every viewport on base (production) and head (PR preview), pixel-diffs them, writes screenshots + `evidence.json` into a gitignored `.gist/` folder.
2. **`gist ui`** — local viewer: PRs → runs → before/after/diff per page. Never calls an LLM.
3. **`/gist` skill** — inside Claude Code, reads the evidence and writes `summary.md` in language a non-technical approver can act on.

## Full docs

[github.com/balasivagn/gist](https://github.com/balasivagn/gist)
