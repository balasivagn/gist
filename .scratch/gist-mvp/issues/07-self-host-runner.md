# 07 — Run Gist from another repository

**What to build:** Allow a repository owner to install a small configuration and GitHub Actions workflow that invokes the external Gist engine and publishes a report using their own runner.

**Blocked by:** 05 — Publish reports progressively.

**Status:** complete

- [x] The engine exposes a documented command that accepts repository configuration and evidence.
- [x] The generated workflow runs on relevant pull-request events.
- [x] The workflow and configuration contain no Balanceflo-specific values.
- [x] A missing AI key selects deterministic output rather than failing.
- [x] The engine itself is not vendored into the consuming repository.
