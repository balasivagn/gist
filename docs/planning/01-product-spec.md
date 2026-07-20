# Gist — Product Spec (high level)

## 1. Problem

Solo founders and small teams are handing their websites to AI agents. The agent ships PRs
continuously — updating pages, adding sections, tweaking copy. The founder owns the site but
isn't a web developer and won't read a diff. Today they either:

- rubber-stamp the agent's PRs blind (risk — it's your public site), or
- ask the agent or a dev to explain every change manually (slow, defeats the purpose of the agent).

## 2. Users

| User | Role | What they touch |
|---|---|---|
| **Founder / site owner** (primary) | Owns the site, delegated changes to an AI agent | Opens the **link** from Slack/email. Reads summary, watches video, drags slider, decides. Never sees code. |
| **AI agent / developer** | Opens the PR | Installs the GitHub App once. Otherwise passive — Gist runs on every PR automatically. |
| **Marketing / content team** | Requests changes, wants to see what shipped | Same link — no account needed to view. |

The product is optimized for the **founder/site owner**. Everything they see must read like plain English.

## 3. The core artifact: the shareable link

`https://gist.app/pr/<repo>/<number>` — one URL, no login required to *view*. (The URL is
guessable for now — acceptable for the hackathon; login / unguessable links are roadmap.)
It contains:

1. **AI summary** — 2–4 sentences of plain English: what changed, what to look at, what's fine.
2. **Walkthrough slideshow** — tappable slides, one per changed page, showing the preview
   screenshot with an AI-written caption ("New signup button added above the fold"). Gives
   orientation before inspection. Annotations optional (phase 2).
3. **Diff viewer** — per changed page, a before/after slider (production vs. preview). Inspection mode.
4. **High-level numbers** — `N changed · M need a look · K broken`, framed for non-coders.

The page ends at **understanding**. The approver then approves wherever they normally do
(Slack reply, GitHub, email) — Gist does not write approvals back to GitHub. Gist's only
GitHub write is the link comment on the PR.

### Global-change mode

When >~60% of captured pages changed (e.g. a site-wide CSS or layout tweak), the
presentation switches tone automatically:
- **Headline:** "This update touches the whole site" (not an alarm — it's informational).
- **Summary:** AI/template explains the common cause ("spacing shifted slightly on every page").
- **Page cards:** top 3 by diff magnitude shown; rest collapsed behind "show all N."
- **Video:** director caps at 3–4 representative scenes (`maxScenes` already enforces this).

This is a prompt + template change (~30 min), not an engine change.

### Status vocabulary (translated for non-coders)

| Engine status | Shown to approver | Meaning |
|---|---|---|
| `pass` | *(hidden or "unchanged")* | No visible change. |
| `expected-change` | **Changed (as planned)** | This page changed and the PR meant to change it. |
| `fail` | **Changed — not part of this update** ⚠️ | This page changed but the PR's files don't explain it. Could be the change leaking, or unrelated drift (CMS edit, other merges). Gist is a **flashlight, not a gate** — it highlights, the human decides. |
| `new` | **New page** | Page added. |
| `removed` | **Page removed** | Page gone — worth confirming. |
| `infra-error` | **Couldn't check** | Technical issue; not the change's fault. |

## 4. Primary flow

```
Dev opens PR (or pushes a new commit to it — runs on `opened` + `synchronize`)
   ↓
GitHub App webhook → Gist
   ↓
Gist builds/finds preview deployment
   ↓
Capture prod + preview across viewports  (reuse: capture.ts)
   ↓
Diff + numbers                            (reuse: compare.spec.ts)
   ↓
AI: summary + slide captions              (Claude API — one call, summary + per-page captions)
   ↓
Build slideshow                           (static — reuse captured preview screenshots)
   ↓
Build report page                         (REDESIGN — the hero)
   ↓
Host on object storage + edge             (reuse: portal/worker.ts pattern)
   ↓
Post link as PR comment                   (new: GitHub App comment)
   ↓
Approver opens link → understands the change → approves in their normal channel
```

## 5. AI in the loop

One Claude API call over the **evidence bundle** the engine already assembles (regression
summary, affected routes + reasons, PR title/description, page headings/links/buttons).
Returns:

```jsonc
{
  "headline": "1 page needs a look",
  "summary": "Your homepage got a new signup button. The pricing page layout shifted — worth a look. 3 other pages are unchanged.",
  "slides": [
    { "route": "/pricing", "caption": "Layout shifted — columns reflowed, worth a check.", "flag": true },
    { "route": "/", "caption": "New signup button added above the fold.", "flag": false }
  ]
}
```

The `slides` array drives the walkthrough slideshow — ordered worst-first, capped at
`maxScenes` (reuse existing budget). Captions are the AI annotation for phase 1; visual
overlays (arrows, highlight boxes) are phase 2.

Deterministic fallback: templated summary + route list with no captions. Demo never
hard-depends on a live API call.

## 6. Scope

Gist is a **two-tier product** (full detail in `06-tiers-and-cost.md`):

- **Self-host** — skill file wires up a GitHub Actions workflow on the user's own runner;
  BYO AI key (optional; no key → deterministic fallback). Report hosted on Gist cloud.
- **Cloud** — GitHub App runs the engine on Gist's multi-tenant remote runner with Gist's
  AI tokens. Same link, no setup.

### In scope (hackathon)
- **Redesigned report page** for non-technical approvers (the hero) — `05-design-and-journey.md`.
- Reuse capture / diff / numbers / video engine.
- AI summary + AI-directed video via Claude API (`claude-sonnet-4-6`), deterministic fallback.
- **Self-host tier**: engine as npm package/Action + skill file + BYO-key with graceful degrade.
- Cloud tier: GitHub App install → PR webhook → link comment.
- Config-driven so it's repo-agnostic (both tiers).

### In scope (curiosity / real build, sequenced after the hero)
- **Multi-tenant remote runner** (the Cloud tier's compute) — designed in `02-architecture.md` §C.
  Being built out of genuine interest in the architecture; the demo can run on one pre-installed
  repo since the multi-tenancy is invisible on stage.

### Out of scope (hackathon)
- **Approve / Ask write-back to GitHub** — cut. Gist's one GitHub write is the link
  comment (re-posted/updated on each new commit). Approval happens in the team's normal channel.
- Billing, teams/orgs, auth/login for viewing the link (guessable URL accepted for now).
- Two-URL self-serve input (roadmap slide; PR flow is the demo).
- HA / autoscaling the runner beyond the documented design.

## 7. Success criteria for the demo

- Opening the PR posts the Gist link comment within ~10 seconds (report starts in
  "Building your review…" state). Numbers + summary + screenshots land first (~1–2 min);
  the walkthrough video fills in last (~5 min worst case). **The report publishes
  progressively — the video is off the critical path.**
- The link opens and a **non-technical person in the room can explain what changed** from it.
- **The link is fully usable on a phone (375px): no horizontal scroll, the before/after
  slider works by touch, the video plays inline.**
- The walkthrough video plays and correctly highlights the flagged page.

> **Mobile is the primary surface**, not an afterthought — approvers open the link from a
> phone notification. See `05-design-and-journey.md` → "Mobile design" for layout, breakpoints,
> and touch rules.
