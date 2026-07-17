# Gist MVP Specification

**Status:** ready-for-agent

## Problem Statement

Website owners increasingly delegate changes to AI agents, but the resulting pull requests are still presented as code diffs. A non-technical owner cannot confidently tell what will change on the public site, which pages deserve attention, or whether an unrelated visual change slipped in. They must either approve blindly or ask a developer to translate every change.

## Solution

Gist turns a website pull request into one mobile-first, shareable report. The report explains the change in plain English, walks through changed pages, provides before-and-after inspection, and highlights the few pages that deserve attention. It arrives as a pull-request comment, appears quickly in a progressive building state, and remains useful when AI enrichment is unavailable.

## User Stories

1. As a site owner, I want one report link for a pull request, so that I do not need to read code.
2. As a site owner, I want a plain-English headline and summary, so that I can understand the overall change quickly.
3. As a site owner, I want counts of changed, concerning, and broken pages, so that I know the scale and risk of the update.
4. As a site owner, I want changed pages ordered by importance, so that I inspect the most relevant page first.
5. As a site owner, I want a captioned walkthrough of changed pages, so that I can orient myself before inspecting details.
6. As a mobile user, I want to swipe through walkthrough slides, so that the report works naturally from a notification.
7. As a desktop user, I want explicit previous and next controls, so that the walkthrough is discoverable without touch gestures.
8. As a site owner, I want to drag between production and preview images, so that I can inspect the visual change directly.
9. As a touch user, I want a large diff handle and a tap fallback, so that before-and-after inspection does not depend on precise dragging.
10. As an approver using assistive technology, I want semantic controls and useful labels, so that I can understand and operate the report.
11. As a site owner, I want engine statuses translated into ordinary language, so that internal QA terminology does not leak into the report.
12. As a site owner, I want site-wide changes explained as a common update, so that a large expected change is not presented as dozens of alarms.
13. As a site owner, I want representative pages expanded during a global change, so that the report remains concise.
14. As a site owner, I want a deterministic explanation when AI is disabled or unavailable, so that the report never becomes unusable.
15. As a site owner, I want AI captions grounded in captured evidence, so that summaries describe observable changes rather than inventing details.
16. As a developer, I want malformed AI output rejected, so that it cannot corrupt the report.
17. As a developer, I want the report link available shortly after a pull request event, so that approvers can open it while processing continues.
18. As a site owner, I want the building report to fill in progressively, so that long-running capture work does not look like a broken link.
19. As a developer, I want repeated events for the same pull-request revision deduplicated, so that retries do not create duplicate work.
20. As a developer, I want one Gist comment updated on new commits, so that pull requests do not accumulate bot noise.
21. As a repository owner, I want webhook signatures verified, so that unauthenticated callers cannot trigger jobs.
22. As a repository owner, I want to run the engine in my own GitHub Actions allowance, so that I can use the self-host tier without managed compute.
23. As a repository owner, I want AI to be optional in the self-host tier, so that a missing provider key does not fail review generation.
24. As a repository owner, I want a small workflow and configuration file, so that the engine is not vendored into my website repository.
25. As a product operator, I want capture and artifact budgets enforced, so that one pull request cannot consume unbounded resources.
26. As a demo viewer, I want to see a realistic pull request flow on a phone, so that the product value is evident without an explanation of its internals.

## Implementation Decisions

- The primary artifact is a single-column, mobile-first HTML report with the same reading order at every viewport.
- The report is generated from a versioned evidence bundle rather than directly from engine internals.
- The highest testing seam is the generated report: callers supply evidence and observe semantic report content and interactions.
- A second public seam is the engine CLI: configuration and evidence enter, report artifacts and a machine-readable result leave.
- A third public seam is the authenticated pull-request webhook: an event enters, progressive publication and one updated comment are observable effects.
- Walkthroughs use captured preview screenshots and captions. Video rendering is not part of the MVP critical path.
- Diff inspection uses an overlaid before/after presentation with pointer dragging, keyboard-accessible range semantics, and tap toggle.
- Changed pages are ordered by severity and then diff magnitude.
- When more than 60 percent of captured pages changed, the report uses global-change language and initially expands the top three representatives.
- AI enrichment returns a structured headline, summary, and ordered slides. Output is validated before use.
- AI is an optional boundary dependency. Missing credentials, API failure, or invalid output selects the deterministic presenter.
- Publishing is state-based: building, evidence-ready, and complete. Later stages replace the same report identity.
- Pull-request jobs are keyed by repository, pull-request number, and head revision for idempotency.
- The GitHub integration verifies webhook signatures and updates a marker-bearing existing comment instead of creating duplicates.
- The self-host distribution installs a small workflow and repository configuration; the engine remains an external package.
- Existing Balanceflo capture, diff, routing, storage, and budget modules are prior art to adapt behind Gist interfaces, not APIs to expose to report users.

## Testing Decisions

- Tests exercise external behavior through the report generator, engine CLI, and webhook handler. They do not mock or assert calls between Gist-owned internal modules.
- The report seam is tested with fixed evidence bundles and independent expected labels, ordering, states, and accessible controls.
- Browser behavior is kept in a small public controller and tested through observable DOM interaction where a browser environment is available; generated semantic markup is covered without implementation snapshots.
- The CLI seam is tested in temporary directories using real files and process results.
- The webhook seam uses injected system-boundary adapters for GitHub, publication storage, AI, and time. These boundaries may be faked; internal presenters are not mocked.
- Security tests cover invalid webhook signatures, unsafe identifiers, malformed evidence, and invalid AI output.
- Existing Node test suites in the source QA engine provide prior art for deterministic planning, upload validation, worker orchestration, and portal path safety.
- Every capability is built as a red-to-green vertical slice: one failing behavior test followed by the minimum implementation required to pass it.

## Out of Scope

- Writing approvals or review decisions back to GitHub.
- Authentication, billing, organizations, and team management.
- Netlify and Vercel preview adapters beyond a documented extension point.
- A production multi-tenant container scheduler or autoscaler.
- Full repository checkout inside a hosted runner.
- AI-generated visual annotations, narrated video, or FFmpeg rendering.
- Strict attribution of every visual difference to a pull-request file.
- A general two-URL comparison product.

## Further Notes

- Gist is a flashlight, not a merge gate: it exposes observable changes and lets the human decide.
- The implementation should preserve existing capture and safety work from the Balanceflo QA engine while removing Balanceflo-specific configuration.
- The demo bar is that a non-technical person can say what changed and what deserves attention from a 375-pixel-wide report in under a minute.
