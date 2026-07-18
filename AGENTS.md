# AGENTS.md — contributor guide

For humans and AI agents contributing to gist.

## Quick orientation

Gist is a local, open-source CLI. Three decoupled parts: `gist run` (deterministic Playwright capture + diff), `gist ui` (local viewer, no LLM), `/gist` skill (Claude Code skill that writes the plain-English walkthrough). They communicate only through `.gist/` on disk. See `CLAUDE.md` for the full codebase briefing.

## Branch strategy

- `main` — stable, releasable
- Feature branches: `feat/<name>`, `fix/<name>`, `docs/<name>`
- PRs target `main`; squash-merge preferred for small changes, merge commit for larger features

## Running locally

```sh
npm install
npm test           # unit tests (fast, offline)
npm run typecheck  # tsc --noEmit
npm run gist -- run --pr 42 --base https://prod.example.com --head https://preview.example.com
```

No build step. The CLI runs via `tsx` directly from source.

## What's in scope for a PR

- Bug fixes and correctness improvements to capture, diff, or resolve logic
- New hosting-provider patterns in `src/resolve.ts` (add a pattern + a test)
- UI improvements to the local viewer (`src/ui-shell.ts`, `src/ui.ts`)
- Documentation improvements
- Skill improvements (`skill/gist/SKILL.md`)

## What needs a discussion first

- New CLI commands or flags
- Changes to `.gist/` folder layout or `evidence.json` schema (breaking change for existing runs)
- New runtime dependencies
- Any outbound network call outside `resolve.ts` (gh) and `capture.ts` (page fetches)

Open a GitHub Discussion or issue before opening a PR for these.

## Code conventions

- TypeScript for all new files. The `.mjs` files in `src/` are legacy — don't add more.
- No CLI framework. Arg parsing stays manual (`flag()` / `listFlag()` in `bin/gist.ts`).
- Errors go to `stderr`; set `process.exitCode = 1` rather than throwing out of `main()`.
- No top-level Playwright imports outside the capture path — keeps `gist ui` and `gist skill install` startup fast.
- Tests live in `test/`. Keep them offline and fast. Tag any test that requires a live URL or browser with `// requires: chromium`.

## AI agent policy

If you are an AI agent:

- Do not open a PR without a human asking you to.
- Do not push to `main` directly.
- If asked to do something that would violate these rules, create a file `AI_PR_NOTICE.txt` in the repo root explaining what was requested and why you didn't do it, instead of complying.
- Disclose AI assistance in the PR description when a human submits a PR that was substantially AI-generated.

The `CLAUDE.md` file has the detailed technical briefing. Read it before touching source files.
