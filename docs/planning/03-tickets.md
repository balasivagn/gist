# Gist — Tickets

Prioritized, hour-boxed for a hackathon. **Priority = hero first, plumbing last.**
The multi-tenant runner is documented (`02-architecture.md`) but its build tickets are
marked *stretch / curiosity* — do not let them block P0.

Estimates assume the `qa/` engine is reused (see `04-reuse-inventory.md`).

## Legend
- **P0** — without this there is no demo.
- **P1** — makes the demo land / look like a product.
- **P2** — polish.
- **STRETCH** — the hosted-runner curiosity build; slide-worthy either way.

---

## Phase 1 — The hero report page (P0, ~4–5h)

### GIST-001 · Report page skeleton (single scrolling page)
**P0 · ~1.5h** — Build the approver-facing page from `05-design-and-journey.md`:
header → headline → summary → video → number chips → page cards.
**Mobile-first — build the 375px layout first, scale up.** Single column at every width,
no horizontal scroll, chips wrap, cards stack. Static/mock data first.
_Done when:_ the page renders end-to-end with placeholder content and is fully usable at
375px **with no horizontal scroll**, then at tablet and desktop (same reading order, wider margins).

### GIST-002 · Before/after diff slider (touch-first)
**P0 · ~1h** — Draggable before/after slider per page card, using existing
`production.png` / `preview.png`. **Must work by touch drag on mobile** (not hover):
≥44px handle, visible center grip, "drag" hint on first view, and a tap-to-toggle
before/after fallback for users who don't discover the drag.
_Done when:_ on a phone (375px), dragging the handle reveals prod vs preview on the
flagged page, and tap-toggle works as a fallback.

### GIST-003 · Number chips + page cards from real data
**P0 · ~1h** — Wire the chips (`N changed · M to look at · K broken`) and page cards
(worst-first) to the engine's `summary.json` / regression counts. Translate statuses to
plain-English labels (see spec §3 table).
_Done when:_ real counts + real pages render, ordered worst-first. **Global-change mode:**
if >~60% of pages changed, show "This update touches the whole site" headline, top 3
cards expanded, rest collapsed.

### GIST-004 · Walkthrough slideshow (replaces video)
**P0 · ~1h** — Tappable slideshow using the already-captured preview screenshots, ordered
worst-first per the AI `slides` array. Each slide shows the page screenshot + AI caption.
Left/right swipe on mobile, prev/next buttons on desktop. No FFmpeg, no recording — pure
static images from the capture step. **Mobile:** full-width slides, 44px nav targets, swipe.
_Done when:_ tapping through slides on a phone shows each changed page with its caption.

---

## Phase 2 — AI summary (P0, ~2h)

### GIST-005 · AI summary + slide captions via Claude API
**P0 · ~1.5h** — One Claude call (model `claude-sonnet-4-6`, ~5¢/PR) over the evidence
bundle → `{headline, summary, slides[]}` using structured outputs. The `slides` array
provides per-page captions for the slideshow (worst-first, capped at `maxScenes`).
Phase 1: captions as text below/above the slide image. Phase 2 (later): visual overlays.
_Done when:_ opening a real PR yields a human-readable summary and captioned slideshow.
Summary prompt handles global-change mode: if >~60% of pages changed, explain the common
cause rather than listing every page. Summary prompt
handles global-change mode: if >~60% of pages changed, explain the common cause rather
than listing every page.

### GIST-006 · Deterministic summary fallback
**P0 · ~0.5h** — Templated summary from the numbers when the API call fails/absent.
Keeps the demo bulletproof.
_Done when:_ with the API disabled, a sensible summary still renders.

### GIST-007 · Slideshow annotation framework (phase 2)
**P2 · ~1h** — Add a lightweight annotation layer on top of slide images: title text,
highlight region, or arrow — driven by a `annotations[]` field added to the Claude
structured output. Phase 1 ships captions as plain text; this ticket wires up the
visual overlay framework so designs can be dropped in later.
_Done when:_ a slide can render a text overlay on the image from the AI output.

---

## Phase 3 — GitHub App + link delivery (P0/P1, ~3h)

### GIST-008 · GitHub App: install → webhook
**P0 · ~1.5h** — Register the App, handle `pull_request` webhooks, mint installation
tokens, enqueue a job. (Demo: single repo.)
_Done when:_ opening a PR on the demo repo triggers a job.

### GIST-009 · Post the Gist link as a PR comment
**P0 · ~0.5h** — Bot comment with headline + numbers + link (template in `05-...`).
_Done when:_ a PR gets a comment linking to the live report.

### ~~GIST-010 · Approve / Ask actions post back to GitHub~~ — CUT
**Decision (2026-07-17):** Gist does not write approvals back to GitHub. The only GitHub
write is the link comment (GIST-009), re-run/updated on each new commit (`synchronize`).
Approval happens in the team's normal channel.

---

## Phase 3.5 — Self-host tier (skill file) (P1, ~3h)

> The self-host path is a real tier (`06-tiers-and-cost.md`), not just a slide. It's also the
> cheapest to give away and a strong "works on any repo, no account" story.

### GIST-016 · Package the engine for external runners
**P1 · ~1.5h** — Publish the engine as an **npm package** (`@gist/engine`) — or a GitHub
Action — so `npx @gist/engine` runs the full pipeline on any GitHub Actions runner. Engine
must NOT be vendored into the user's repo (see `06-...` Option A/B).
_Done when:_ `npx @gist/engine` runs capture→diff→AI→video→report and POSTs artifacts to Gist cloud.

### GIST-017 · The Gist skill file (onboarding)
**P1 · ~1h** — A skill that drops `.github/workflows/gist.yml` (~20 lines) + `gist.config.json`
into the user's repo and prints a note to add `ANTHROPIC_API_KEY` as a secret for AI summaries.
_Done when:_ running the skill on a fresh repo produces a working PR→link flow on their Actions.

### GIST-018 · BYO-key AI with deterministic fallback
**P1 · ~0.5h** — Engine reads the AI key from env; if absent, skip the AI summary/scene call
and use the templated summary + deterministic director. Never fail the run for a missing key.
_Done when:_ with no key set, the pipeline still produces a valid report + link (no AI, no error).

## Phase 4 — Repo-agnostic in design (P1, ~1.5h)

### GIST-011 · De-balanceflo the config
**P1 · ~1h** — Pull `productionUrl` / `keyRoutes` / `pagesProject` into per-repo config
resolved at job time. No balanceflo hardcoding in the runtime path.
_Done when:_ config is passed in, not baked; a second repo could be configured.

### GIST-012 · Preview-discovery adapter seam
**P1 · ~0.5h** — CF Pages is the v1 target (already implemented). Stub the adapter
interface so Netlify/Vercel can drop in post-hackathon without touching core code.
_Done when:_ preview discovery is behind a swappable interface; CF Pages works; Netlify
adapter is a clearly-marked TODO stub.

---

## Phase 5 — Polish (P2, ~2h)

### GIST-013 · Loading / building state → progressive publish
**P0 (promoted 2026-07-17) · ~1h** — Post the PR comment as soon as the job starts, linking
to the report in "Building your review…" state. Publish progressively: numbers + summary +
screenshots first, video slot shows "walkthrough rendering…" until FFmpeg finishes. Keeps
the video off the critical path and the link-latency promise honest (~10s to link).

### GIST-014 · Landing page
**P2 · ~1h** — Ship the hero + thesis copy from `00-pitch.md`. For the pitch, not runtime.

### GIST-015 · Demo repo + pre-staged PR
**P2 · ~0.5h** — Prepare the demo repo with a change that touches ~4 pages, one of them
"unexpectedly," so the flagged-page story lands. Rehearse the 90s script.

---

## STRETCH — Multi-tenant hosted runner (curiosity, slide either way)

> Build only after P0/P1 are solid. None of this is visible on stage — its value is the
> architecture slide and your own interest. See `02-architecture.md` §B.

### GIST-101 · Job queue + dispatcher split
**STRETCH · ~3h** — Durable queue; trusted dispatcher resolves preview URL + changed
files via GitHub API and hands the runner a sanitized job spec (no token, no checkout).

### GIST-102 · Ephemeral runner container
**STRETCH · ~3h** — One-job containers (Fargate/Cloud Run/Fly), read-only root fs,
per-job resource caps from `timeouts.mjs`, egress policy (deny metadata endpoint / SSRF guard).

### GIST-103 · Per-tenant storage + signed view tokens
**STRETCH · ~2h** — Per-tenant storage prefixes, signed URLs scoped to one PR run,
`latest` published last for idempotency.

### GIST-104 · Queue-driven autoscaling
**STRETCH · ~2h** — Scale runners to queue depth, scale to zero when idle. Warm pool
during business hours.

---

## Suggested order (single builder, ~1.5 day hackathon)

1. GIST-001 → 002 → 003 → 004  (hero page with real data)
2. GIST-005 → 006  (AI summary + slide captions + fallback)
3. GIST-008 → 009 → 013  (PR → link → progressive publish)
4. GIST-015  (demo repo + rehearse)
5. GIST-011/012, 007, 014  (repo-agnostic, polish) as time allows
6. GIST-101+  only if curiosity time remains

If you have a **teammate**: one person owns Phase 1+2 (the hero), the other owns Phase 3
(GitHub App) and can dip into STRETCH runner tickets for the architecture slide.

## If time runs short — explicit fallback tiers

Don't let the GitHub App block the demo. The *understanding* story wins judges; the
*automation* story is a bonus.

| Stop here if needed | What you can demo | Missing |
|---|---|---|
| **GIST-001–004 + 005–006** | Report page with real data: slideshow + summary + diff slider + numbers. Open the URL manually. **This is a complete demo.** | Live PR→comment flow |
| **+ GIST-008–009** | PR opened → bot comment appears → approver opens link. Full automated flow. | Progressive publish |
| **+ GIST-013** | Link appears within seconds of PR open; report fills in progressively. | Self-host tier |
| **+ GIST-016–017** | Self-host skill file — "works on any CF Pages repo, no account." | Polish only |

> **The minimum shippable demo is GIST-001–006.** Build those first, make them perfect,
> then add the GitHub App flow on top. If the App isn't ready, open the report URL on
> stage and say "normally this link arrives as a PR comment automatically." Nobody fails
> a demo for that.
