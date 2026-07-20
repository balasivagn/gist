# Gist — Reuse Inventory

What already exists in the `qa/` engine and maps to product pieces. ~80% of the pipeline
is built. The new work is the **report page** and the **AI summary**; everything else is
reuse or light adaptation.

## Direct reuse (as-is or config change)

| Product piece | Existing file(s) | Notes |
|---|---|---|
| Preview URL discovery | `qa/visual-regression/resolve-urls.mjs` | Finds preview from CF Pages comment / branch alias / status checks. |
| Route discovery | `qa/visual-regression/discover-routes.mjs` | Sitemap union. |
| Affected-route detection | `qa/visual-regression/affected-routes.mjs`, `lib.mjs` | Changed files → routes, with reasons. Powers "expected vs unexpected". |
| Stabilized capture | `qa/visual-regression/capture.ts` | Playwright, 3 viewports, anim-off, lazy-load priming, infra retry. |
| Pixel diff + status | `qa/visual-regression/compare.spec.ts` | pixelmatch; pass / fail / expected-change / new / removed. |
| High-level numbers | regression counts in manifest + `report.ts` | pass/fail/expected/new/removed/infra counts. |
| ~~Walkthrough video~~ | ~~Playwright CLI → FFmpeg~~ | **Replaced by slideshow** — no video rendering needed. |
| Slide ordering / scene budget | `qa/ai/walkthrough-plan.schema.json` | Reuse the `maxScenes` cap concept; adapt schema to `slides[]` with `route` + `caption` + `flag`. |
| Deterministic fallback | `qa/ai/deterministic-director.mjs` | Adapt to output `slides[]` with no captions (route list only). Keep wired for demo safety. |
| Artifact upload | `qa/host/upload.mjs` | Bounded concurrency, trims unaffected routes, idempotent `latest`. |
| Hosted link | `qa/portal/worker.ts` | R2 + CF Worker, `/pr/:number`, SHA-addressed immutable + latest pointer. |
| Budgets / timeouts | `qa/shared/timeouts.mjs` | Reuse as per-job resource caps in the runner. |
| Schema validation | `qa/shared/validate.mjs` (ajv) | Reuse for scene plan + a new summary schema. |

## New build

| Product piece | Why new | Effort |
|---|---|---|
| **Report page redesign** | Existing report is engineer-facing (sidebar + iframes). Needs to be approver-facing: summary → video → diff → numbers. | **High — this is the hero** |
| **AI summary** | Engine has no plain-English summary. One Claude call over the existing evidence bundle. | Low–medium |
| **GitHub App** | Existing setup is a per-repo self-hosted Action, not an installable App that posts a link. | Medium |

> ~~Approve / Ask actions~~ — **cut (2026-07-17):** Gist does not write back to GitHub
> beyond the link comment. See `03-tickets.md` GIST-010.

## Swap decision

- The existing video director uses **Codex CLI** (subscription/CLI dependency).
  For reliability + a single AI path, **swap to Claude API** for both the summary and the
  scene plan (reuse the existing `walkthrough-plan.schema.json` as the structured output).
  Keep the deterministic director as fallback.

## De-balanceflo checklist (repo-agnostic in design)

- Pull hardcoded `productionUrl`, `keyRoutes`, `pagesProject` out of `qa.config.json`
  into per-repo config resolved at job time.
- Confirm no balanceflo-specific route assumptions in `affected-routes` content rules.
- Preview discovery: today assumes CF Pages; note adapter seams for Vercel/Netlify.
