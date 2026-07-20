# Product

## Register

brand

## Platform

web

## Users

**Primary:** developers who discover Gist through GitHub or npm and decide whether to install it. They're pragmatic, tool-literate, and allergic to fluff. They skim; they evaluate in seconds. They need to understand what Gist does, trust that it's genuinely useful, and get to the install command without friction.

**Secondary:** the non-technical founder or site owner who receives a Gist review link and decides whether to approve a PR. They never touch the landing page, but their job — "approve a change without reading a diff" — is the story the landing page tells to convert the developer above.

## Product Purpose

Gist is a local, open-source tool that turns a website pull request into a plain-English walkthrough: deterministic before/after screenshots of every page, a local review UI, and an AI-written summary through the coding agent you already have. No hosted service, no API keys, no stored screenshots of unreleased pages. The whole thing runs on your machine.

Success: a developer installs Gist, runs it on one PR, and the person who approves that PR says "I know exactly what changed" — without reading a diff.

## Positioning

The only oversight tool built for the moment when AI writes your website and you have to approve what it actually did.

## Brand Personality

Calm, trustworthy, fast. The voice of a tool that takes the problem seriously without dramatizing it. Plain-spoken, a little spare — writes like a good engineer explains a change to a non-technical manager. Not marketing-fluffy, not academic.

## Anti-references

**No Stripe-minimal clone.** The editorial-typographic lane (display serif, italic, ruled columns, monochromatic restraint) is saturated with dev-tool landing pages. Gist should not look like another Stripe-adjacent product. Avoid IBM Plex, Space Grotesk, Inter, or DM Sans as the headline face.

**No QA-tool alarm UI.** Visual regression testing tools — Percy, Chromatic, Applitools — lean into red/green alert dashboards, pass/fail CI language, heavy grid tables, and testing-department aesthetics. Gist is not for QA engineers. Avoid CI-board color systems, alarm-state visual language, and anything that reads "this is a test runner."

## Design Principles

1. **The approver is the argument.** Every design decision asks: would a non-technical founder get it from this, cold, in 30 seconds? If not, simplify.
2. **Show, don't pitch.** The mock review card in the hero does more than any paragraph. Lead with what a Gist review actually looks like.
3. **Calm authority over alarm.** The tool's job is to reduce anxiety, not create it. Color, copy, and layout should all read as confident reassurance — not CI red/green alert.
4. **Honest by construction.** No hand-wavy marketing claims. The positioning is specific: local, open-source, deterministic, no API keys. Every claim is verifiable by reading the code.
5. **Developer-fast, human-readable.** The install command is three words. The one-liner explains itself. Trust the developer to read; don't oversell.

## Accessibility & Inclusion

WCAG AA minimum. Color conveying status (green/amber) must also use label text — never color alone. The mock review card and any status tags must be screen-reader legible.
