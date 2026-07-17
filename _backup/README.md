# Parked: hosted / Next.js implementation

This directory holds the previous **hosted SaaS-shaped** implementation of Gist,
parked on 2026-07-17 when the project pivoted to a **standalone local open-source
tool** (local CLI + local UI + skill-invoked AI, no hosted service).

Nothing here is deleted — it is kept for salvage. The React report surface,
AI scene director, and ingest/store logic may be lifted back in later.

## What's here

- `app/` — the Next.js console (PR list, run history, React report surface)
- `lib/` — domain types, AI scene director, ingest handlers/auth, report store
- `hosted-service.mjs`, `server.mjs` — the Railway ingest server
- `ingest.mjs`, `publisher.mjs`, `webhook.mjs` — publish/ingest/webhook seams
- `railway.json`, `next.config.mjs` — hosted deploy config
- `gist.old.mjs` — the previous CLI (init GitHub Action + build/publish flow)
- `import-balanceflo.mjs`, `balanceflo-import.mjs` — one-off balanceflo importer
- `build-presentation.mts` — presentation JSON builder
- `test/` — tests for the parked code

See `../MEMORY`-referenced project notes for the full rationale.
