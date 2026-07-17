---
name: gist
description: Turn a Gist capture run into a plain-English walkthrough for a non-technical approver. Use after `gist run` has written screenshots and evidence.json into .gist/, when the user wants the summary/walkthrough generated, or says "/gist", "summarize this PR's changes", or "write the Gist walkthrough".
---

You are writing the **approver-facing walkthrough** for a website change. The
person who reads it often can't read a diff — your job is to tell them, in plain
English, what changed and whether anything needs their attention.

The deterministic capture (`gist run`) has already produced the evidence. You do
**not** capture or diff anything — you read what's there and write `summary.md`
next to it. This is the only non-deterministic, AI-authored part of Gist.

## 1. Find the run

The evidence lives under `.gist/prs/pr-<n>/runs/<runId>/`:

- `evidence.json` — the deterministic result (statuses, diff %, page list)
- `screenshots/<slug>.base.png`, `.head.png`, `.diff.png` — before / after / diff
- `summary.md` — what you will write (may not exist yet)

Default to the **newest run of the most recently touched PR** unless the user
names a PR or run. If several runs could be meant, ask which PR.

## 2. Read the evidence, then look at the screenshots

Read `evidence.json` first. Each page has a `status`:

- `pass` — visually unchanged
- `expected-change` — changed, and this route was expected to change
- `fail` — changed, but this route was **not** expected to change (flag it)
- `new` — page exists only after the change
- `removed` — page existed before, gone after (flag it)
- `infra-error` — couldn't be captured (say so; don't guess what it looks like)

Then **actually open the `.head.png` and `.diff.png` images** for every page
that isn't `pass`. Read the diff image to see *where* on the page it changed
(header, hero, footer, a specific card). Describe what you can see — copy,
layout, colour, spacing, an added/removed section — in words an owner
understands. Never invent detail you can't see in the screenshot; if a diff is
ambiguous, say it changed and where, not what you assume it means.

## 3. Write summary.md

Write to `.gist/prs/pr-<n>/runs/<runId>/summary.md`. Structure it as:

1. **One-sentence headline** — what this change does, in the owner's language
   (not "refactored the nav component" but "the top menu now shows a Pricing
   link").
2. **What changed** — a short bullet per meaningful page change, each naming the
   page and what visibly differs. Lead with anything `fail` or `removed`.
3. **Anything to check** — call out `fail`, `removed`, and `infra-error` pages
   plainly. If everything is `pass` or `expected-change`, say it looks clean.

Keep it to what a non-technical approver needs to decide **approve / take a
look**. No code, no CSS, no file paths. Markdown only — the local `gist ui`
renders it above the before/after images, so you don't need to embed images.

## 4. Confirm

Tell the user the summary is written and remind them it appears in `gist ui`
for that run. If you flagged unexpected or broken pages, lead with that.
