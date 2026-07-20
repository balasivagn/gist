# Gist — Architecture

Gist is a **two-tier product** (see `06-tiers-and-cost.md`):

- **Self-host** — a skill file wires up a GitHub Actions workflow that runs the engine
  on the user's own Actions minutes, with their own AI key (optional). Report is uploaded
  to Gist cloud.
- **Cloud** — the GitHub App runs the engine on Gist's **multi-tenant remote runner** with
  Gist's AI tokens.

Both tiers upload artifacts to the **same Gist cloud host** and produce the **same link**.

This doc has three parts: (A) the **self-host path**, (B) the **cloud demo architecture**,
and (C) the **real multi-tenant runner** design (§C). For the hackathon: the runner (§C) is
a genuine build you're doing out of curiosity — design it fully, but the *demo* can run on
one pre-installed repo so invisible plumbing doesn't eat the hero report page's hours.

---

## A. Self-host path (skill file → their Actions → Gist cloud)

```
User runs the Gist skill
   │  writes into their repo:
   ▼
.github/workflows/gist.yml  +  gist.config.json     ← small diff; engine NOT vendored
   │
   ▼  (on: pull_request)
Their GitHub Actions runner
   │  npx @gist/engine  (or  uses: gist/action@v1)   ← engine pulled at runtime
   │  1. resolve preview URL        reuse: resolve-urls.mjs
   │  2. capture prod+preview       reuse: capture.ts
   │  3. diff + numbers             reuse: compare.spec.ts
   │  4. AI summary + scenes        their ANTHROPIC_API_KEY (secret) — or skip → deterministic
   │  5. render video               reuse: Playwright→FFmpeg
   │  6. build report               REDESIGN (hero)
   │  7. POST artifacts →           Gist cloud ingest (GIST_TOKEN — auto-issued on first
   │                                 upload, stored as repo secret; OIDC is the roadmap)
   ▼
Gist cloud (R2 + edge worker) serves  gist.app/pr/<repo>/<n>
   │
   ▼
Gist Action comments the link on the PR
```

The engine stays out of their repo (Option A/B in `06-tiers-and-cost.md`). No AI key → step 4
degrades to the deterministic director + templated summary; the link still works.

## B. Cloud demo architecture (build this)

```
┌────────────┐   PR opened    ┌──────────────────┐
│  GitHub    │───webhook─────▶│  Gist App server │  (small Node service)
│  (1 repo)  │◀──comment──────│  - verifies hook │
└────────────┘   Gist link    │  - enqueues job  │
                              └────────┬─────────┘
                                       │ dispatch
                                       ▼
                          ┌──────────────────────────┐
                          │   Runner (existing        │
                          │   Mac-mini / container)   │
                          │  1. resolve preview URL   │  reuse: resolve-urls.mjs
                          │  2. discover routes       │  reuse: discover-routes.mjs
                          │  3. affected routes       │  reuse: affected-routes.mjs
                          │  4. capture prod+preview  │  reuse: capture.ts
                          │  5. diff + numbers        │  reuse: compare.spec.ts
                          │  6. AI summary + scenes   │  NEW: Claude API call
                          │  7. render video          │  reuse: Playwright→FFmpeg
                          │  8. build report page     │  REDESIGN (hero)
                          │  9. upload artifacts      │  reuse: upload.mjs
                          └────────────┬──────────────┘
                                       │
                                       ▼
                          ┌──────────────────────────┐
                          │  Object storage (R2/S3)   │  reuse: portal/worker.ts
                          │  + edge worker serves     │  pattern
                          │  gist.app/pr/<repo>/<n>   │
                          └──────────────────────────┘
```

Everything except steps **6 and 8** already exists in `qa/`. See `04-reuse-inventory.md`.

---

## C. Real multi-tenant hosted runner (the Cloud tier — curiosity payoff)

The interesting question: how do you run *untrusted* capture jobs for *any* repo, on
demand, safely and cheaply? Here's the architecture worth building toward.

### B.1 Trust boundary — the core problem

You are rendering a **preview URL controlled by a third party** and running a headless
browser against it. The browser is the attack surface. Rules:

- **Never check out the customer's source** in the runner. You don't need it — you need
  the deployed preview URL and a list of changed files (from the GitHub API, not a clone).
- **The runner never holds a GitHub token.** A separate trusted dispatcher reads the
  webhook, calls the GitHub API, and hands the runner a *sanitized job* (URLs + changed-file
  list + PR metadata). This mirrors the existing `dispatch.mjs` split.
- **Read-only root filesystem** in the job container; only `/tmp` and the output mount are writable.

### B.2 Components

| Component | Responsibility | Trust |
|---|---|---|
| **App server** | GitHub App: verify webhooks, resolve installation tokens, post comments, enqueue jobs. Holds secrets. | Trusted |
| **Queue** | Durable job queue (SQS / Cloud Tasks / a DB table). Decouples spikes from capacity. | Trusted |
| **Dispatcher** | Pulls a job, resolves preview URL via GitHub API, computes changed files, builds a *sanitized job spec*. Holds the installation token; the runner never does. | Trusted |
| **Runner pool** | Ephemeral containers (Fargate / Cloud Run / Fly Machines). Each runs one job: capture → diff → AI → video → upload. No repo checkout, no token. | **Untrusted workload** |
| **Object storage** | R2/S3 per-tenant prefixes. SHA-addressed immutable artifacts + a `latest` pointer per PR. | Trusted |
| **Edge worker** | Serves `gist.app/pr/<repo>/<n>`, validates a signed view token, streams artifacts. | Trusted |

### B.3 Multi-tenancy & isolation

- **One container per job.** No shared state between tenants. Container dies after the job.
- **Per-tenant storage prefixes**, signed URLs scoped to a single PR run. No cross-tenant listing.
- **Resource caps per job**: CPU/mem limits, wall-clock budget (reuse the existing
  `timeouts.mjs` budgets), max capture height, max scenes, max video size.
- **Network egress policy on the runner**: allow the preview host + storage; deny the
  metadata endpoint (SSRF guard — a malicious preview page must not reach cloud creds).

### B.4 Scaling model

- **Queue-driven autoscaling**: scale runner count to queue depth. Zero when idle
  (serverless containers) — you pay per PR, which matches the pricing story.
- **Cold-start mitigation**: keep a warm pool of 1–2 pre-pulled browser images during
  business hours; accept cold start off-hours.
- **Idempotency**: jobs keyed by `(repo, PR, headSha)`. Re-delivered webhooks dedupe.
  Publishing `latest` is the last step, so a partial run never shows as current.

### B.5 GitHub App specifics

- App (not OAuth) so it acts per-installation with scoped permissions:
  `pull_requests: write` (comment), `checks: write` (optional status), `contents: read`
  (changed files via API — *not* a clone).
- Webhook events: `pull_request` (opened, synchronize, reopened, ready_for_review).
- Installation access tokens minted per job by the app server; short-lived; never leave the trusted tier.

### B.6 Why the demo can fake the multi-tenancy

Multi-tenant hosted CI is **invisible on stage** — a judge cannot distinguish it from a
single pre-installed repo. It is also the largest, riskiest build. You've chosen to build the
real runner **out of genuine interest in the tech** — great, do it — but sequence it *after*
the hero report page (`03-tickets.md` marks the runner STRETCH). For the demo itself, one
pre-installed repo on the existing runner is indistinguishable from the multi-tenant version;
this section is also the "here's how it scales safely to any repo" slide.

### B.7 Open questions worth noting on the slide

- Preview discovery for arbitrary hosts (Vercel/Netlify/CF Pages/custom) — needs adapters.
- Auth for viewing the link (signed token vs. login) once it's multi-tenant — guessable
  URL accepted for the hackathon (decision 2026-07-17).
- Cost ceiling per PR and how to cap runaway captures on huge sites.
- Environment drift (CMS edits, other merges to main) shows up in prod-vs-preview diffs
  **by design** — Gist is a flashlight, not a gate; it highlights every change and the
  human decides. Baseline-vs-preview diffing is the post-hackathon option if users want
  strict PR attribution.
