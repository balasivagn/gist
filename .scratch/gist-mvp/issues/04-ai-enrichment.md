# 04 — Enrich reports with grounded AI explanations

**What to build:** Optionally enrich a report with a structured plain-English headline, summary, and slide captions derived from its evidence, without making report generation depend on the AI service.

**Blocked by:** 01 — Generate an understandable report from evidence; 03 — Explain global changes and degraded runs.

**Status:** ready-for-agent

- [ ] Valid structured enrichment replaces deterministic copy and captions.
- [ ] Missing credentials skips the AI call without failing the run.
- [ ] API failure or invalid structured output falls back deterministically.
- [ ] Slide routes must correspond to pages present in the evidence bundle.
