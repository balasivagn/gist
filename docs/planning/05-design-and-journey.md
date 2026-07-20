# Gist — Design & User Journey

Design is the product. The engine is a commodity; the **link** is what people feel.
This doc defines the journeys and the design principles for the hero surface.

## Design principles

1. **The approver is not an engineer.** No diffs-as-code, no hex percentages without
   translation, no jargon. If a sentence needs a CS degree, rewrite it.
2. **Answer the only three questions they have**, in order, above the fold:
   *What changed? Is anything wrong? Can I approve?*
3. **Show, don't diff.** Video and before/after slider beat any textual diff for a non-coder.
4. **One clear ending.** The page ends at understanding — the reader leaves knowing what
   changed and what to check. Approval happens in the team's normal channel (no write-back).
5. **Legible numbers.** "2 pages need a look" beats "diff 8.3% on 2 routes."
6. **Calm, trustworthy, fast.** This page informs an approval decision — it should feel like reading a brief, not debugging.

## Journey 1 — The Approver (primary, this is the demo)

```
Slack/email: "Change ready for you → gist.app/pr/acme/123"
   │
   ▼
[Link opens]  ── loads in <2s, no login ──────────────────────────┐
   │                                                               │
   ▼                                                               │
① HEADLINE + SUMMARY                                               │
   "1 page needs a look."                                          │
   "Your homepage got a new signup button. The pricing page        │
    layout shifted — worth a look. 3 other pages are unchanged."   │
   │                                                               │
   ▼                                                               │
② WALKTHROUGH SLIDESHOW  ← → swipe through changed pages           │
   screenshot + AI caption per slide, worst-first                  │
   │                                                               │
   ▼                                                               │
③ THE NUMBERS   [4 changed] [2 to look at] [0 broken]              │
   │                                                               │
   ▼                                                               │
④ PAGE-BY-PAGE  (cards, worst first)                              │
   ⚠ Pricing — changed unexpectedly   [before/after slider]        │
   ✓ Home — new signup button (planned)                            │
   ✓ About — changed (planned)                                     │
   │                                                               │
   ▼                                                               │
⑤ DECIDE (outside Gist)                        ◀───────────────────┘
   replies "approved" in Slack/email, or approves the PR —
   whatever the team's normal channel is. Gist does not write back.
```

**Emotional arc:** land → "oh, I get it" (summary) → "I can see it" (slideshow tour) →
"nothing's on fire" (numbers) → "I'll check the yellow one" (slider) → replies "approved."
The whole thing is <60 seconds and never feels technical.

## Journey 2 — The Developer (setup, then passive)

```
Install Gist GitHub App (once)  →  pick repos  →  done
   │
   ▼
Open a PR (as normal)
   │
   ▼
~2 min later: Gist bot comments on the PR:
   "✅ Review ready for your team → gist.app/pr/acme/123
    4 pages changed · 2 need a look · 0 broken"
   │
   ▼
(Dev shares the link, or the approver is auto-notified)
   │
   ▼
Approver reads the link → replies "approved" in the team's normal channel
(New commit pushed to the PR → Gist re-runs and updates the comment/link)
```

Dev effort after setup: **zero.** That's the retention story.

## Journey 3 — The Agency → Client (positioning bonus)

Same link, sent to a client instead of an internal owner. Replaces the manually-recorded
Loom. "Here's what changed on your site — approve when ready." No account needed to view.

## Screen inventory (what to design)

| Screen | Priority | Notes |
|---|---|---|
| **Report page** (Journey 1, all of it) | **P0 — hero** | Single scrolling page: summary → video → numbers → page cards. Mobile-first (owners open links on phones). |
| PR bot comment | P0 | Templated markdown: headline + numbers + link. |
| GitHub App install flow | P1 | Mostly GitHub's own UI + a simple "connected!" landing. |
| Landing page | P1 | Copy in `00-pitch.md`. Needed for the pitch, not the runtime demo. |
| Empty/loading state | P2 | "Building your review…" while the job runs (link exists before artifacts land). |

## Report page layout (the hero — annotated)

```
┌─────────────────────────────────────────────┐
│  Gist            acme/website · PR #123      │  ← quiet header
├─────────────────────────────────────────────┤
│                                             │
│   1 page needs a look.            ← headline│  big, human
│                                             │
│   Your homepage got a new signup button.    │  ← AI summary
│   The pricing page layout shifted — worth   │
│   a look. 3 other pages are unchanged.      │
│                                             │
│   ┌───────────────────────────────────┐     │
│   │  ← Pricing  1/4  Home →          │     │  ← slideshow, swipeable
│   │  [screenshot]                    │     │
│   │  "Layout shifted, worth a check" │     │  ← AI caption below image
│   └───────────────────────────────────┘     │
│                                             │
│   [ 4 changed ] [ 2 to look at ] [ 0 broken]│  ← number chips
│                                             │
│   ── Page by page ──                        │
│   ⚠ Pricing        changed unexpectedly     │  ← worst first
│      [ before | after ⇄ slider ]            │
│   ✓ Home          new signup (planned)      │
│   ✓ About         updated (planned)         │
│                                             │
│   Looks good? Reply in your usual channel.  │  ← quiet closing note
└─────────────────────────────────────────────┘
```

## Mobile design (the primary case — build this first)

The approver gets a Slack/email notification and taps the link **on their phone.** Desktop
is the secondary case. Design the phone layout first; scale *up* to desktop, not down.

### Non-negotiable mobile rules

- **Single column, no horizontal scroll, ever.** Number chips wrap; page cards stack full-width.
- **Tap targets ≥ 44px.** Play and the slider handle especially.
- **The before/after slider works by touch drag**, not hover. Add a visible center handle and
  a small "drag" hint on first view. Consider a tap-to-toggle before/after as a fallback for
  users who don't discover the drag.
- **Slideshow is swipe-to-advance** (left/right). Full-width screenshot, caption below.
  Prev/next arrows as fallback. No video, no autoplay, no FFmpeg dependency.
- **Type stays large:** headline ~24–28px, summary ~16–17px with generous line height. Never
  shrink body text to fit; let the page get taller.
- **Fast on cellular:** poster image + lazy-load page-card images below the fold; the summary
  and numbers must render before the video/diffs load.
- **Works one-handed:** everything decision-critical (summary, numbers, flagged card)
  reachable without a second hand or a zoom.

### Mobile wireframe (~375px)

```
┌───────────────────────┐
│ Gist   acme #123    ⋯ │  ← minimal header
├───────────────────────┤
│                       │
│ 1 page needs          │  ← headline wraps, big
│ a look.               │
│                       │
│ Your homepage got a   │  ← summary, full width,
│ new signup button.    │    line height generous
│ Pricing shifted —     │
│ worth a look. 3 pages │
│ unchanged.            │
│                       │
│ ┌───────────────────┐ │
│ │ ← Pricing 1/4 → │ │  ← slideshow, swipe L/R
│ │  [screenshot]    │ │
│ │  "Layout shifted"│ │  ← caption below
│ └───────────────────┘ │
│                       │
│ [4 changed]           │  ← chips WRAP to 2 rows
│ [2 to look at]        │
│ [0 broken]            │
│                       │
│ Page by page          │
│ ┌───────────────────┐ │
│ │ ⚠ Pricing         │ │  ← card, full width
│ │ changed unexpected│ │
│ │ ┌───────────────┐ │ │
│ │ │ before ⇄ after│ │ │  ← touch-drag slider
│ │ └───────────────┘ │ │
│ └───────────────────┘ │
│ ┌───────────────────┐ │
│ │ ✓ Home  new signup│ │
│ └───────────────────┘ │
│   (scrolls…)          │
│                       │
│ Looks good? Reply in  │  ← quiet closing note
│ your usual channel.   │
└───────────────────────┘
```

### Responsive breakpoints

| Width | Layout |
|---|---|
| **< 640px (phone — primary)** | Single column. Chips wrap. Cards stack. |
| **640–1024px (tablet)** | Single column, wider max-width (~640px centered). Slider larger. |
| **> 1024px (desktop)** | Same single-column reading flow, max-width ~720px centered. Do **not** add a sidebar — keep the one-story reading order identical to mobile. |

Same content, same order, every size. The desktop version is the phone version with more
whitespace — not a different information architecture. This keeps the build small and the
demo consistent whether shown on a laptop or handed to someone's phone.

### Mobile demo tip

Rehearse the demo **on an actual phone** (or a 375px browser window). If you can understand
a change one-handed from the notification in under a minute, the design won. Have a phone ready
on stage — handing a judge the link on a real phone is a stronger moment than a laptop.

## Design tokens / vibe

- **Tone:** calm, confident, editorial. Not a dashboard, not a devtool.
- **Type:** large readable headline, generous line height on the summary.
- **Color:** neutral canvas; green = fine/approved, amber = needs a look, red = broken.
  (Reuse the engine's status colors but relabel them in words.)
- **Motion:** the video is the motion. Keep the rest still and trustworthy.
- **Mobile-first:** approvers open links on their phone. The slider and video must work by thumb.

## What "good" looks like (demo bar)

A non-technical person in the room, handed the link cold, can say out loud what changed
and which page to check — **without anyone explaining the UI.** If they can, the design won.
