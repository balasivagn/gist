# CHANGE-REVIEW.md — how gist decides what changed

This is the design spec for gist's **change-review methodology**: how the tool
turns two screenshots (before / after) into a report a non-technical approver
can trust. It is separate from `DESIGN.md` (which governs visual style). This
document governs *what the report says and how it is derived*.

Status: **design, not yet implemented.** The code committed on
`feat/gist-skill-improvements` (region annotations, PR-context enrichment) is a
first step; it does **not** yet follow this spec. The most important gap — the
"no citation, no region" rule — is called out in [The one rule that matters](#the-one-rule-that-matters).

---

## 1. Who this is for

Per `PRODUCT.md`, the report serves the **secondary user: a non-technical
founder or site owner** who receives a review link and decides whether to
approve a PR. They never read code. Their job is *"approve a change without
reading a diff."* Success is them saying **"I know exactly what changed."**

Everything below follows from that one sentence.

Consequences:

- **Not a QA dashboard.** `PRODUCT.md` explicitly names Percy / Chromatic /
  Applitools as anti-references: no CI red/green alarm boards, no pass/fail
  test-runner aesthetics. The *concept* of pass / "worth a look" is fine — the
  non-technical owner understands "looks good" vs "check this." The *alarm
  aesthetic* is what's forbidden. Layman verdicts, calm styling.
- **Calm authority over alarm.** The tool reduces anxiety. A wall of amber
  "check this" rings — especially fabricated ones — does the opposite.
- **Plain-English, owner's language.** "The headline changed and a new pricing
  section was added." Never "diffPercent 10.4%, status fail," never CSS or
  component names.

## 2. The reviewer's three questions

The report is a **decision-support layer** — it does not make the approve/reject
decision. It answers, in order:

1. **What actually changed on my site?** — content changes in plain English,
   with movement/reflow subtracted out.
2. **Is that what we agreed to?** — does it match what this change set out to do.
3. **Is there anything here nobody mentioned?** — the one genuinely valuable
   alarm, used sparingly and only when real.

## 3. Core principle: movement is not change

If a section was inserted, everything below it moves down. That downward
movement is a **consequence** of the change, not a change in itself. The
approver does **not** want to hear "the footer moved down 1,600px." They want to
know whether the footer's *content* changed — and if it didn't, the footer
should not appear in the report at all.

So the report describes: *"A new section was added; everything below it moved
down but is otherwise the same."* One real change. Movement explicitly dismissed,
never enumerated as regions.

This is why the hardest job in the whole pipeline is **distinguishing
moved-but-identical from actually-changed.** Everything downstream depends on
getting that subtraction right.

## 4. Architecture: deterministic gate, AI meaning

Honors the CLAUDE.md invariant ("`evidence.json` is deterministic; `summary.md`
is the only AI-authored file"):

- **Deterministic layer (`gist run`)** owns **preconditions and triage** —
  everything computable from data it already has (per-shot dimensions, diff
  magnitude, page presence). It decides whether a comparison is *valid* and what
  *class* it is. These are facts → they belong in `evidence.json`.
- **AI layer (the skill)** does **meaning** — but only runs inside a comparison
  the deterministic gate has already declared valid and localized. It never
  invents geometry.

## 5. Tier 1 — Preconditions (refuse, don't guess)

Hard gates. If violated, **do not produce a region report.** Produce a calm
"can't compare this page" card: what went wrong in owner language + the concrete
fix. A false refusal is annoying but safe; a false *accept* ships garbage to a
user who can't detect it. **When unsure, refuse.**

| Precondition | Failure | Message to approver |
|---|---|---|
| Same viewport width | base 1440px, head 1280px | "Before and after were captured at different screen sizes, so I can't line them up. Re-capture both at the same width." |
| Capture succeeded | page errored / didn't load | "Couldn't capture this page — nothing to compare." |
| Baseline sanity | near-total diff + different dims + no shared anchors (the BalanceFlo case) | "The 'before' looks like a different site entirely. The baseline may be pointing at the wrong place." |

The baseline-sanity gate is the fuzziest and the most dangerous — it is a
heuristic on the refusal path. Bias it hard toward "refuse and ask the human to
confirm the baseline," never toward "proceed anyway."

## 6. Tier 2 — Triage classes

Once preconditions pass, classify the comparison *before* enumerating:

- **Localized change** (small/medium diff, structure matches) → run the full
  section SOP. **This is the day-1 reliable core.**
- **Wholesale / redesign** (pervasive diff) → do **not** enumerate 40 regions.
  Show side-by-side and say "this is a full redesign — review it holistically."

  The trigger is a **reflow-adjusted** measure of pervasiveness, **not raw
  diff-%**. Raw diff-% is inflated by movement: a single inserted section shifts
  everything below it, lighting up red at every y-position even though the
  content below is unchanged. The live PR #2 run is 10.4% diff and is *almost
  entirely one shifted section* — a naive "refuse/redesign above X%" gate would
  wrongly trip on it. Use instead: are the changed pixels **spread across the
  full page height in multiple clusters** (→ redesign), or **concentrated in one
  band with a clean shifted region below** (→ localized insert)? Diff-% may be a
  coarse secondary hint, never the sole trigger.
- **New / removed page** (exists on one side only) → a different report:
  "this page is brand new, here it is" / "this page is gone." No before/after
  diff is possible. **Deferred to v2.**

## 7. Tier 3 — The section SOP (plan → observe → verify → reconcile)

Runs only for the *localized* class. Reliability comes from the **context
boundaries** between passes, not from the step names.

### Pass 0 — Plan (intent ledger)
- **Sees:** PR title, body, comments; `config.json`; the page *list* (slugs,
  statuses, diffPercent). **No images.**
- **Produces:** an *intent ledger* — the PR's claims as checkable propositions
  (`C1: "rewrite hero copy" → expect text change near top of home`). Location
  expectations stay vague where the PR is vague — matched by *semantics* later,
  not coordinates.
- **Forbidden:** looking at screenshots. Fixing the hypothesis before
  observation is what makes "claimed-but-absent" (missing) detectable.

### Pass 1 — Observe (grounded, per page, intent-blind)
- **Sees:** one page's base / head / diff images + dimensions. **Not** the
  intent ledger. **Not** other pages.
- **Produces:** candidate regions, each with a **mandatory evidence citation** —
  specific content quoted from both base and head (or "present in head, absent
  in base" for inserts), plus diff corroboration.
- **Two hard rules:** (1) **no citation, no region;** (2) if the diff is clean
  where a change is claimed, drop it or downgrade to "possible movement."
- Movement is described as *moved*, never as changed.
- **Forbidden:** knowing what the PR wanted. Observation is intent-blind so
  description is uncontaminated.

### Pass 2 — Verify (adversarial, fresh context)
- **Sees:** Pass 1's regions + the same images. **Not** the intent ledger.
- **Job:** try to *break* each region — is the cited before-text actually
  different from after, or misread? Real change or reflow mislabeled? Does the
  diff support it? Verdict: `confirmed / downgraded-to-moved / rejected`.
- Fresh context because a model grading its own just-written output ratifies it;
  a clean slate told to refute catches the fabrication class.

### Pass 3 — Reconcile against intent
- **Sees:** confirmed regions (with citations) + the Pass 0 ledger. Intent
  enters *only now*.
- **Job, bidirectional:**
  - each confirmed region → **intended** (a claim covers it) or
    **changed-but-unmentioned** (no claim touches it — the "worth a look" flag)
  - each ledger claim with no matching region → **missing** (PR promised it, the
    screenshots don't show it)
- **Produces:** `regions.json` (real regions + verdicts + citations) and
  `summary.md` (verdict-first, plain-English), the existing output contract —
  but now every field is earned.

## 8. Verdict vocabulary (final)

- **intended** — matches what the PR set out to do
- **changed-but-unmentioned** — a real content change nobody flagged (the one
  gentle "worth a look")
- **missing** — the PR promised something that isn't there
- **moved** — position only, content identical → **not shown at all**

Dropped as incoherent for this user: "side-effect" (a shared-component or
reflow consequence is either a real content change → unmentioned, or pure
movement → invisible) and "suspicious"/"unknown" (alarm words with no owner
meaning). Per `PRODUCT.md`, status is never color alone — always a text label.

## 9. The one rule that matters

If only one thing from this document is implemented, make it **Pass 1's "no
citation, no region" rule.**

The current build's live output contains a fabricated region — "Article cards,
check card spacing and image alignment" — on a landing page that has no article
cards, with round-number guessed coordinates and a boilerplate note. The UI
draws a confident amber ring around content that does not exist. For a
non-technical approver who cannot tell the ring is wrong, this is the worst
possible failure: a confident lie.

The citation requirement removes this failure mode by construction: a region
that cannot quote specific visible before/after content is not allowed to exist.
Everything else in this spec raises quality; this rule removes the thing that
makes the tool untrustworthy.

## 10. The widening envelope (roadmap)

Ship a trustworthy *small* thing and grow its domain. Do not build a fragile
*everything* that is wrong in ways a non-technical user can't detect.

- **v1:** same-viewport, per-page section matching, localized changes.
  Plain-English report, layman pass / "worth a look." Refuses clearly on
  viewport mismatch, redesign, new/removed pages.
- **Each release converts one refusal into a handled case:** multi-viewport
  comparison → redesign summarization → new/removed-page reports → whatever real
  PRs expose.

A tool that says "I can't compare these two — the widths differ" is trusted.
A tool that compares them anyway and produces garbage is abandoned.

## 11. Evaluating the AI pipeline

The SOP is a classifier wrapped in gates. Both are testable **offline against
labeled before/after pairs** — no live browser, no network — which fits the
"fast, offline tests" rule in CLAUDE.md. The eval is also how the thresholds in
§5–6 get *tuned* rather than guessed, and how the "widening envelope" (§10) stays
honest: each new site type becomes a labeled fixture, and coverage is measured,
not hoped.

This evaluates the **whole AI part** — every pass has a checkable output, so the
eval scores each independently and end-to-end.

### 11.1 Fixture format

Each fixture is a self-contained case: input screenshots + PR intent + the
expected outcome at every stage.

```
eval/fixtures/<case-name>/
  base.png            before screenshot
  head.png            after screenshot
  diff.png            precomputed pixel diff (so eval needs no capture)
  intent.json         { title, body, comments }  — the PR context
  expected.json       ground truth (below)
```

```jsonc
// expected.json
{
  "gate": "analyze",              // analyze | refuse:<reason> | triage:redesign | triage:new-page
  "ledger": ["rewrite hero copy", "add pricing tier"],   // Pass 0 claims
  "regions": [                    // the real changes (moved/reflow NOT listed)
    { "area": "hero", "changeType": "text-edit", "verdict": "intended" },
    { "area": "pricing", "changeType": "added",  "verdict": "intended" }
  ],
  "missing": ["add pricing tier"],   // claims with no matching region, if any
  "mustNotContain": ["article cards"] // fabrication guards — see 12.3
}
```

### 11.2 What "correct" means, per pass

The eval scores each pass against `expected.json`, because a pipeline that gets
the right answer for the wrong reason will regress silently.

- **Gate (Tier 1/2):** exact match on `gate`. Refusing a valid page or analyzing
  an invalid one are both failures; weight false-*accepts* heavier than
  false-refuses (a false refuse is safe, a false accept ships garbage).
- **Pass 0 Plan:** the produced ledger covers the expected claims (recall on
  `ledger`). Missed claims mean "missing" detection can't fire downstream.
- **Pass 1 Observe:** region **recall** (did it find the real changes) and
  **movement precision** (did it correctly *not* list reflow as a change).
- **Pass 2 Verify:** measured as the *delta* it produces — does it correctly
  drop fabricated/reflow regions that Pass 1 over-produced? Seed fixtures with
  known Pass-1 over-productions and assert Verify removes them.
- **Pass 3 Reconcile:** verdict accuracy per region (`intended` vs
  `changed-but-unmentioned`) and `missing` set match.

### 11.3 The fabrication guard (highest-priority assertion)

Every fixture carries `mustNotContain` — content/areas that do **not** exist in
the screenshots. If any region references them, the case **fails hard**,
regardless of other scores. This directly regression-tests §9 (the "Article
cards" failure). A pipeline that scores well but still fabricates is a failed
pipeline.

### 11.4 The case set (grows with the envelope)

Cover the diverse failure modes, not just the happy path:

- `hero-copy-edit` — simple in-place text change (localized)
- `insert-section` — added section + reflow below (movement-subtraction test)
- `restyle-button` — color/style change, no layout move (horizontal-change test)
- `full-redesign` — pervasive change (triage → redesign, not 40 regions)
- `wrong-baseline` — base is a different site (Tier 1 refuse — the BalanceFlo case)
- `viewport-mismatch` — base/head different widths (Tier 1 refuse)
- `promised-but-absent` — PR claims a change that isn't there (missing detection)
- `new-page` — page exists only in head (v2; asserted as triage:new-page)

Real PRs that expose new failure modes get added as fixtures — that is the
mechanism by which the envelope widens with measured coverage.

### 11.5 Determinism caveat

The AI passes are not bit-deterministic, so the eval is a **scored/threshold**
suite (e.g. "≥90% of fixtures pass, 100% of `mustNotContain` guards pass"), not
an exact-match unit test. It runs on demand (`npm run eval`), separate from the
fast deterministic `npm test`, and gates changes to the skill's SOP.

## 12. Known open seams (not yet decided)

- **Coordinate precision.** The model reads approximate positions off the image
  — fine for sending a reviewer's eye to a band, not pixel-exact. A thin
  deterministic assist earns its place only if automated regression *gating* is
  ever added — as a precision enhancer on a model-found region, never as the
  primary detector.
- **Viewport-pairing enforcement.** The same-viewport precondition needs the
  capture to record per-shot dimensions *per side* and pair them by viewport.
  `evidence.json` carries `baseDims` / `headDims` today, but per-viewport
  pairing is not obviously enforced — verify before implementing Tier 1.
- **Baseline-sanity heuristic.** See §5 — the fuzziest gate; bias toward refusal.
