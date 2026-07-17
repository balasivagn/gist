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

Node.js 22 or newer is the only requirement; there are no runtime dependencies.

```sh
npm test
npm run typecheck
npm run build
```

The demo report is written to `dist/demo/index.html`. See
[`demo/README.md`](demo/README.md) for the scenario. The normalized implementation spec
and dependency-ordered ticket files live under [`.scratch/gist-mvp/`](.scratch/gist-mvp/).
To run a real Balanceflo pull request through capture, evidence import, and the local
Gist UI, follow [`setup.md`](setup.md).

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
