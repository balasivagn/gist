# Gist — Tiers, Delivery & Cost

Gist ships in two tiers. Same engine, same report link, different infrastructure ownership.

## The two tiers

| | **Self-host** (free / BYO) | **Cloud** (managed) |
|---|---|---|
| Onboarding | A **skill file** wires up a GitHub Actions workflow | Install the **GitHub App**, log into Gist cloud |
| Compute (capture, diff, video) | **Their** GitHub Actions minutes | **Gist's** remote runner (multi-tenant) |
| AI (summary + video direction) | **Their** API key (a repo secret). No key → no AI summary, deterministic fallback runs | **Gist's** managed AI tokens |
| Report hosting | **Gist cloud** (free host) | **Gist cloud** |
| Report URL | `gist.app/pr/<repo>/<n>` | `gist.app/pr/<repo>/<n>` |
| Account needed | No signup — first upload auto-registers the repo and issues a `GIST_TOKEN` (stored as a repo secret by the skill) | Yes (login) |
| Cost to user | Free (their minutes + optional their key) | Paid / managed |

**Key design decision:** the **report is always hosted on Gist cloud**, even for self-host. This means the self-host workflow only needs to *run the engine and upload artifacts* — it never provisions storage or serves a link. It also simplifies engine delivery (below): the workflow doesn't need to publish anything, only produce files and POST them.

### AI is a graceful-degradation feature

- **Self-host, key present** → AI summary + AI-directed video (via their key).
- **Self-host, no key** → pipeline still runs; summary is templated from the numbers; video uses the deterministic director. **The link still works** — it just isn't as smart.
- **Cloud** → AI always on, Gist's tokens.

This makes the AI a clean upsell: "add a key for smart summaries, or go Cloud and we handle it."

## Engine delivery (self-host) — how the qa scripts reach their runner

The engine (capture / diff / video / report builder + Playwright, FFmpeg) is **big**. The skill file must stay small. Three ways to ship it; the qa scripts stay **out of the user's repo** in the first two:

| Option | User's repo gets | Engine lives in | Verdict |
|---|---|---|---|
| **A. Published GitHub Action** | `.github/workflows/gist.yml` (~20 lines) + `gist.config.json` | Your action repo, pulled via `uses: gist/action@v1` | Cleanest product feel. Cost: you publish/maintain a marketplace action. |
| **B. npm package** | Same two small files; workflow runs `npx @gist/engine` | npm | Same small diff, no marketplace ceremony — just `npm publish`. **Fastest to build.** |
| **C. Vendor it all** | The whole `qa/` engine copied in (thousands of lines) | Their repo | Avoid — huge diff, hard to update. |

**Recommendation: B (npm package) for the hackathon, A (Action) as the productized end-state.** Both keep the engine out of the user's repo. Because hosting is on Gist cloud, the workflow's only job is: `npx @gist/engine` → produce artifacts → POST them to Gist's ingest endpoint with a repo token.

### What the skill installs (either option)

```
.github/workflows/gist.yml     # ~20 lines: on: pull_request → run engine → upload to Gist
gist.config.json               # prod URL, routes/keyRoutes, thresholds (per-repo)
```

Plus a note to add `ANTHROPIC_API_KEY` (or provider key) as a repo secret **if** they want AI summaries.

### Ingest auth (how uploads are protected without an account)

**Decision (2026-07-17):** lightweight token, no login. The first upload for a repo
auto-registers it: the ingest endpoint issues a token bound to the repo name
(first-writer-wins); the skill stores it as a `GIST_TOKEN` repo secret; every subsequent
upload must present it. Per-repo size + rate caps on ingest. This keeps `gist.app` from
being an open anonymous-upload endpoint while staying "no signup."
**Productized end-state:** GitHub Actions **OIDC** — the workflow proves "I am repo X" via
GitHub's signed OIDC token; zero user-managed secrets. Roadmap, not hackathon.

## Cost model

Two buckets that behave very differently.

### Self-host tier — near-zero cost to you

The user pays the expensive part (their Actions minutes + optional their AI key). Your only cost is **hosting the report artifacts**.

- One PR report ≈ **20–60 MB** (3 viewports × prod/preview/diff PNGs + one ~5–20 MB video). Bigger sites → more.
- **Cloudflare R2** (already used by `portal/worker.ts`):
  - Storage: **$0.015/GB/mo**. 1,000 stored reports @ 40 MB = 40 GB = **~$0.60/mo**.
  - **Egress: free** (R2's whole point — this is why R2 beats S3 here; S3 egress would dominate).
  - Worker requests: negligible on free tier.
- **Guardrails that keep it bounded:** cap video size (`timeouts.mjs` → `maxSizeBytes`), and **expire reports after 30–90 days** (R2 lifecycle rule). With expiry, storage stays flat regardless of signups.

**Net: self-host hosting costs you cents-to-low-dollars/month until serious volume.** Cheap to give away.

### Cloud tier — cents per PR (your COGS)

You run the browser and pay for AI.

| Component | Cost per PR run |
|---|---|
| Compute (ephemeral container: 3-viewport capture + diff + video render, ~2–5 min on ~2 vCPU/4 GB serverless) | **~$0.01–0.05** |
| AI summary + video direction (one Claude call over the small evidence bundle — see below) | **~$0.015–0.08** |
| Storage/egress (R2) | **cents** |
| **All-in** | **~$0.03–0.13 per PR** |

Priced at even $10–20/mo per repo (or per-seat), margins are healthy. The real risk isn't unit cost — it's **runaway captures** (huge site, infinite-scroll page, retry storm). The existing budgets (`timeouts.mjs`, `maxCaptureHeightPx`, `maxScenes`, `maxSizeBytes`) are exactly the guardrails that keep one run at cents, not dollars. `log()` anything you cap so a truncated run doesn't silently read as "fully covered."

### AI cost detail (current Claude pricing)

The evidence bundle is small: ~3–8K input tokens, ~0.5–1.5K output tokens for one summary + scene-plan call.

| Model | Input $/1M | Output $/1M | ~Cost per call |
|---|---|---|---|
| Haiku 4.5 | $1.00 | $5.00 | **~$0.015** |
| Sonnet 4.6 | $3.00 | $15.00 | **~$0.05** |
| Opus 4.8 | $5.00 | $25.00 | **~$0.08** |

**Recommendation:** **Sonnet 4.6** (`claude-sonnet-4-6`) for the summary + video direction — best quality/cost balance at ~5¢/PR. Drop to **Haiku 4.5** (`claude-haiku-4-5`) if you want the floor. Use structured outputs (`output_config.format`) so the summary + scene plan come back schema-valid in one call. In **self-host** the AI cost is **$0 to you** — the user's key pays.

> Model IDs and pricing verified against the current Claude model catalog. Use `claude-sonnet-4-6` for the summary call; reuse the existing `walkthrough-plan.schema.json` as the structured-output schema for the scene plan.
