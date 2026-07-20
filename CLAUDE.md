# CLAUDE.md — gist codebase briefing

This file is for AI agents working on this codebase. It is not a README summary.

## What gist is

A local, open-source CLI tool that turns a website PR into a before/after visual review:
- `gist run` — deterministic Playwright capture + pixelmatch diff → writes `.gist/`; also fetches PR body + comments via `gh pr view` into `meta.json`
- `gist ui` — local HTTP server serving a SPA that reads `.gist/`, never calls an LLM; renders CSS-positioned region panels with SVG annotation overlays
- `/gist` skill — Claude Code skill that reads `evidence.json` + PR intent from `meta.json` + screenshots → writes `summary.md` + `regions.json`, then opens `gist ui`

The three parts are decoupled through `.gist/` on disk. Do not couple them.

## Runtime: no build step

The CLI runs via `tsx` — TypeScript source is executed directly. There is no compile step for end users. `bin/gist.mjs` is the published entry point (a thin Node launcher that invokes `bin/gist.ts` via `tsx`). Never suggest a build step as part of the user workflow.

`dist/` is gitignored and is for development artefacts only — do not reference or commit it.

## Source layout

```
bin/gist.ts        CLI router — manual arg parsing, no CLI framework
src/init.ts        `gist init` — Chromium install + config scaffold + skill install
src/run.ts         `gist run` — orchestrates capture, diff, evidence write
src/capture.ts     Playwright page capture per route + viewport
src/diff.ts        pixelmatch diffing
src/resolve.ts     resolves base/head URLs for a PR via `gh` + deployment statuses
src/store.ts       `.gist/config.json` and `.gist/prs/` read/write
src/ui.ts          `gist ui` — starts the local HTTP server
src/ui-shell.ts    generates the SPA HTML shell (inline JS/CSS, no bundler)
src/skill.ts       `gist skill install` — copies skill/ into .claude/skills/
src/preflight.ts   checks for gh, config, Chromium before a run
src/limits.ts      concurrency + timeout constants
src/report.mjs     evidence.json schema + report writing (legacy .mjs)
src/enrichment.mjs PR enrichment from gh (legacy .mjs)
src/identity.mjs   run ID generation (legacy .mjs)
src/budgets.mjs    token/cost budget helpers for the skill (legacy .mjs)
```

The `.mjs` files are legacy — they predate the TypeScript migration. Do not delete them as dead code; they are still imported. Do not convert them to `.ts` without running the full test suite to verify imports still resolve.

## Key invariants

- `.gist/` is always gitignored. `gist init` enforces this by appending to `.gitignore`. Never write user data outside `.gist/`.
- `evidence.json` is deterministic — same inputs, same output. `summary.md` and `regions.json` are the only AI-authored files.
- `gist ui` and `gist run` must work with no internet connection after init (Chromium installed, config written).
- The skill (`skill/gist/SKILL.md`) ships inside the npm package and is installed by `gist init` and `gist skill install`. It is copied into `.claude/skills/gist/` in the user's project, not the gist package directory.
- The `/gist` skill auto-detects the current PR from the branch name, runs `gist run` if no capture exists, and opens `gist ui` when done. One command does everything.

## What lives where in `.gist/`

```
.gist/
  config.json          shared team config — SHOULD be committed (routes, viewports, thresholds)
  prs/
    pr-<n>/
      meta.json        PR title, body, comments from gh — written by gist run
      runs/
        <runId>/
          evidence.json   deterministic — written by gist run
          summary.md      AI walkthrough — written by the /gist skill
          regions.json    AI change regions + verdicts — written by the /gist skill
          screenshots/    <slug>.base.png / .head.png / .diff.png
```

`config.json` is the one file under `.gist/` that teams should commit. Everything else is ephemeral or reproducible.

## CLI design

Arg parsing is manual — no CLI framework. `flag(name)` and `listFlag(name)` are helpers in `bin/gist.ts`. When adding commands, match the existing switch/case pattern. Do not introduce a CLI framework.

Error handling: write to `stderr`, set `process.exitCode = 1`, let `main()` catch and surface the message. Never throw unhandled.

## Test suite

```sh
npm test          # tsx --test test/*.test.ts test/*.test.mjs
npm run typecheck # tsc --noEmit
```

Tests are fast and offline. Do not add tests that require a live URL or running browser unless they are clearly marked and skipped in CI. The Playwright capture tests require Chromium to be installed (`gist init`).

## What to avoid

- Do not import Playwright at the top level in files that are imported by `gist ui` or `gist skill install` — Playwright is only needed in the capture path.
- Do not add any outbound network calls outside of `resolve.ts` (gh calls) and `capture.ts` (page fetches).
- Do not write to `.gist/` from anywhere except `src/store.ts`, `src/run.ts`, and `src/skill.ts`.
- Do not add a bundler or compile step to the user workflow — the `tsx` runtime is intentional.
