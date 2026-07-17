# Gist — Source References (the real files to reuse)

These docs are now in `~/Codes/personal-projects/gist/`, **separate** from the codebase that
holds the actual QA engine. The engine lives in the **balanceflo-website** repo:

```
SOURCE REPO:  /Users/balasivagnanam/Codes/balanceflo-website
```

Everything below is an absolute path into that repo. When building Gist, these are the files
to lift, adapt, or publish as `@gist/engine`. Paths verified against the repo at extraction time
— re-check before copying, since the source repo keeps evolving.

## The capture → diff → report pipeline (core engine — reuse wholesale)

| Purpose | File |
|---|---|
| Stabilized screenshot capture (3 viewports, anim-off, lazy-load priming, infra retry) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/visual-regression/capture.ts` |
| Pixel diff + status classification (pass / fail / expected-change / new / removed) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/visual-regression/compare.spec.ts` |
| HTML report + diff-viewer building, status colours/labels | `/Users/balasivagnanam/Codes/balanceflo-website/qa/visual-regression/diff-utils.ts` |
| Report aggregation (per-profile + cross-profile matrix, summary.json/csv) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/visual-regression/report.ts` |
| Config: thresholds, keyRoutes, prod URL, per-route overrides | `/Users/balasivagnanam/Codes/balanceflo-website/qa/visual-regression/qa.config.json` |
| Playwright config | `/Users/balasivagnanam/Codes/balanceflo-website/qa/visual-regression/playwright.config.ts` |
| Local pipeline entrypoint | `/Users/balasivagnanam/Codes/balanceflo-website/qa/visual-regression/run.mjs` |

## Routing & affected-route detection (powers "expected vs unexpected")

| Purpose | File |
|---|---|
| Route discovery (sitemap union) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/visual-regression/discover-routes.mjs` |
| Changed files → routes, with reasons | `/Users/balasivagnanam/Codes/balanceflo-website/qa/visual-regression/affected-routes.mjs` |
| Import graph + content rules | `/Users/balasivagnanam/Codes/balanceflo-website/qa/visual-regression/lib.mjs` |
| Preview URL discovery (CF Pages comment / branch alias / status checks) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/visual-regression/resolve-urls.mjs` |

## AI direction (summary + walkthrough video scenes)

| Purpose | File |
|---|---|
| **Scene plan schema — reuse as the structured-output schema for the Claude call** | `/Users/balasivagnanam/Codes/balanceflo-website/qa/ai/walkthrough-plan.schema.json` |
| Codex-based director (swap to Claude API for Gist — see `03-tickets.md` GIST-007) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/ai/codex-director.mjs` |
| Deterministic fallback director (keep — the no-AI path) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/ai/deterministic-director.mjs` |
| Director prompt | `/Users/balasivagnanam/Codes/balanceflo-website/qa/ai/director-prompt.md` |

## GitHub Actions & host orchestration (self-host + cloud tiers)

| Purpose | File |
|---|---|
| **PR-preview QA workflow (self-hosted runner) — the model for the self-host `gist.yml`** | `/Users/balasivagnanam/Codes/balanceflo-website/.github/workflows/pr-preview-qa-self-hosted.yml` |
| QA host deploy workflow | `/Users/balasivagnanam/Codes/balanceflo-website/.github/workflows/deploy-qa-host.yml` |
| CI workflow | `/Users/balasivagnanam/Codes/balanceflo-website/.github/workflows/ci.yml` |
| Event validation + job dispatch (trusted tier; token never enters runner) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/host/dispatch.mjs` |
| Dispatcher entrypoint | `/Users/balasivagnanam/Codes/balanceflo-website/qa/host/run-dispatcher.mjs` |
| Artifact upload to R2 (bounded concurrency, trims unaffected routes, idempotent latest) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/host/upload.mjs` |
| Container runtime wrapper | `/Users/balasivagnanam/Codes/balanceflo-website/qa/host/container-runtime.mjs` |
| Watchdog (wall-clock cap) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/host/watchdog.mjs` |
| Release activation (publish latest) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/host/activate-release.mjs` |
| Retention / expiry (bounds hosting cost — see `06-tiers-and-cost.md`) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/host/retention-run.mjs`, `/Users/balasivagnanam/Codes/balanceflo-website/qa/shared/retention.mjs` |
| Self-hosted runner install guide | `/Users/balasivagnanam/Codes/balanceflo-website/qa/host/install-runner.md` |

## Container (the multi-tenant runner starting point — §C of the architecture)

| Purpose | File |
|---|---|
| QA container image (Playwright + Chromium + FFmpeg + fonts) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/worker/Dockerfile` |
| Canonical pipeline runner (capture→diff→perf→video→report→upload) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/worker/run-job.mjs` |
| Container entrypoint | `/Users/balasivagnanam/Codes/balanceflo-website/qa/worker/entrypoint.mjs` |
| Output manifest schema | `/Users/balasivagnanam/Codes/balanceflo-website/qa/worker/upload-manifest.schema.json` |
| Smoke test | `/Users/balasivagnanam/Codes/balanceflo-website/qa/worker/smoke-test.mjs` |

## The hosted report link (Gist cloud host — reuse this pattern)

| Purpose | File |
|---|---|
| **Cloudflare Worker serving `/pr/:number` from R2 — the report portal** | `/Users/balasivagnanam/Codes/balanceflo-website/qa/portal/worker.ts` |
| Worker config | `/Users/balasivagnanam/Codes/balanceflo-website/qa/portal/wrangler.toml` |

## Perf & shared utilities

| Purpose | File |
|---|---|
| Lighthouse perf budgets (3 viewports) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/perf/lighthouse.mjs` |
| **Timeout / resource budgets — the runaway-capture guardrails** (`maxScenes`, `maxCaptureHeightPx`, `maxSizeBytes`) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/shared/timeouts.mjs` |
| JSON-schema validation (ajv) | `/Users/balasivagnanam/Codes/balanceflo-website/qa/shared/validate.mjs` |
| Structured logging | `/Users/balasivagnanam/Codes/balanceflo-website/qa/shared/log.mjs` |
| QA package manifest / deps | `/Users/balasivagnanam/Codes/balanceflo-website/qa/package.json` |
| QA usage guide | `/Users/balasivagnanam/Codes/balanceflo-website/qa/README.md` |

## Specs & background (context, not code)

| Purpose | File |
|---|---|
| Mac-mini worker spec (the architecture this engine already implements) | `/Users/balasivagnanam/Codes/balanceflo-website/docs/plans/pr-qa-mac-mini-worker-spec.md` |
| Implementation task backlog | `/Users/balasivagnanam/Codes/balanceflo-website/docs/plans/pr-qa-mac-mini-worker-tasks.md` |
| Repo architecture | `/Users/balasivagnanam/Codes/balanceflo-website/docs/ARCHITECTURE.md` |

---

## How to lift this into Gist

1. **npm package (`@gist/engine`)** — start from `qa/visual-regression/*`, `qa/ai/*`,
   `qa/perf/lighthouse.mjs`, `qa/shared/*`, and `qa/worker/run-job.mjs`. That's the pipeline.
2. **Report host** — copy the `qa/portal/worker.ts` + R2 pattern; this becomes Gist cloud.
3. **Self-host workflow** — model `gist.yml` on `.github/workflows/pr-preview-qa-self-hosted.yml`
   but simplified to `npx @gist/engine` (no self-hosted-runner assumptions).
4. **Cloud runner** — the `qa/worker/Dockerfile` + `run-job.mjs` are the seed for §C's
   multi-tenant runner; add the queue/dispatcher isolation from `02-architecture.md` §C.
5. **De-balanceflo** — pull hardcoded values out of `qa.config.json` into per-repo config
   (see `04-reuse-inventory.md` → de-balanceflo checklist).

> ⚠️ These are references into a **live repo** that keeps changing. Before copying a file,
> open it and confirm it still matches what `04-reuse-inventory.md` describes.
