# Gist

> **Approve website changes without reading code.**

Gist turns a website pull request into **one shareable link** a non-technical owner can
understand in 30 seconds: a plain-English summary of what changed, a captioned
walkthrough slideshow, a before/after diff viewer, and high-level numbers
(pages changed / unexpected / broken).

This folder is a **portable spec + ticket pack** extracted from a planning session.
It is self-contained, and now includes an executable MVP of the report, publication,
webhook, and self-host CLI seams described by the normalized spec.

## Run the implementation

Node.js 22 or newer. Install dependencies, then:

```sh
npm test
npm run typecheck
npm run build
npm start
```

The app is a **Next.js** console: PR list, multi-run history, and the React report surface.
Jobs publish structured evidence to `POST /api/ingest/evidence` (Bearer `GIST_INGEST_TOKEN`).

Local demo presentation JSON (no server):

```sh
npm run build:demo
```

See [`demo/README.md`](demo/README.md). For a real Balanceflo PR → capture → ingest → UI flow, follow [`setup.md`](setup.md).

Required env for the server:

- `GIST_INGEST_TOKEN` — ingest auth
- `REPORT_ROOT` — filesystem store (default `.data/reports`)
- `PUBLIC_BASE_URL` — public origin for returned report URLs
- `ANTHROPIC_API_KEY` — required for complete evidence ingest (AI Scene Director); set `GIST_MOCK_SCENES=1` only for local tests/CLI without a key


> **Where the engine actually lives:** the real QA engine that Gist reuses (capture, diff,
> report, video, GitHub Actions, the R2 report portal) is in the separate **balanceflo-website**
> repo at `/Users/balasivagnanam/Codes/balanceflo-website`. Every file to lift is listed with
> its absolute path in [`07-source-references.md`](07-source-references.md).

## The thesis

Coding agents now ship website changes faster than any human can review them.
The bottleneck is no longer *writing* the change or even *correctness* — it's
**understanding**. The person who has to *approve* a change often can't read a diff.

Gist closes that understanding gap. It is a concrete instance of Geoffrey Litt's
"[Understanding is the new bottleneck](https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck.html)"
argument, applied one layer up: not "help the engineer understand the code," but
"help the approver understand the change."

## Documents in this folder

| File | What it is |
|---|---|
| [`00-pitch.md`](00-pitch.md) | Name, positioning, landing copy, the thesis framing for judges |
| [`01-product-spec.md`](01-product-spec.md) | High-level product spec: users, flows, the shareable link, scope |
| [`02-architecture.md`](02-architecture.md) | System architecture, including the **real multi-tenant hosted runner** design |
| [`03-tickets.md`](03-tickets.md) | Prioritized, hour-boxed hackathon tickets (GIST-###) |
| [`04-reuse-inventory.md`](04-reuse-inventory.md) | What already exists in the `qa/` engine and maps 1:1 to product pieces |
| [`05-design-and-journey.md`](05-design-and-journey.md) | **User journeys + report-page design** — the hero surface (start here for build) |
| [`06-tiers-and-cost.md`](06-tiers-and-cost.md) | **Self-host vs Cloud tiers**, engine delivery (skill file), and the cost model |
| [`07-source-references.md`](07-source-references.md) | **Absolute paths to the real qa/ files, GH Actions, and portal worker** to reuse |

## The one decision that shapes everything

**Build the hero, design the plumbing.**

- The **report page** (summary + video + diff + numbers) is the hero. Judges see it. Non-technical owners use it. Most build hours go here.
- The **multi-tenant hosted runner** is documented as a real architecture (see `02-architecture.md`) because it's genuinely interesting tech — but for the *demo* it is faked with one pre-installed repo. Don't let invisible plumbing eat the hero's hours.

See [`03-tickets.md`](03-tickets.md) for the priority order.
