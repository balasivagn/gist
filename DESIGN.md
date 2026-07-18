# DESIGN.md — gist design system

This file is the source of truth for design decisions across the landing page (`site/`), the local review UI (`gist ui`), and any future surfaces. It is read by the `/impeccable` skill — run `/impeccable init` to register it, then use `/impeccable audit`, `/impeccable polish`, etc.

## Identity

**Voice:** calm, trustworthy, fast. Plain-spoken. Writes like a good engineer explaining a change to a non-technical manager — not marketing-fluffy, not academic.

**The approver is the argument.** Every design decision asks: would a non-technical founder understand this, cold, in 30 seconds?

## Color tokens

```css
--bg:          #fafaf8   /* warm off-white page background */
--ink:         #1a1a18   /* near-black text */
--muted:       #6b6b66   /* secondary text, labels */
--line:        #e6e4de   /* borders, dividers */
--card:        #ffffff   /* card / elevated surface */
--green:       #1a7f4b   /* pass / clean / positive */
--green-soft:  #e6f4ec   /* green badge background */
--amber:       #a05e03   /* expected-change / attention */
--amber-soft:  #fdf1dd   /* amber badge background */
--red:         #b3261e   /* fail / removed / error */
--red-soft:    #fbeae9   /* red badge background */
--term-bg:     #16161a   /* terminal / code block background */
--term-ink:    #d8d8d2   /* terminal text */
--accent:      #1a1a18   /* primary action color (matches ink) */
```

Status colors carry semantic meaning tied to `evidence.json` status values (`pass` → green, `expected-change` → amber, `fail` / `removed` → red). They must never be used decoratively. Always pair color with a text label — never color alone.

## Typography

**Display face:** Figtree (700, 800 weights) — headings and logo only. Loaded from Google Fonts.

**Body face:** `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif` — all body copy.

**Mono face:** `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace` — code, install commands, run IDs.

**Type scale (ratio ≥ 1.25 between steps):**

| Token | Size | Use |
|---|---|---|
| `--text-sm` | 13px | Fine print, labels |
| `--text-base` | 16px | Body copy |
| `--text-lg` | 20px | Lede / subheadings |
| `--text-xl` | 28px | Section headings |
| Hero h1 | `clamp(34px, 5.6vw, 56px)` | Hero only |

Line height: 1.65 for body, 1.08 for display headings. Letter spacing: `−0.03em` for h1, `−0.02em` for logo.

## Spacing

Base unit: 4px. Common values: 12, 14, 20, 22, 24, 34, 40, 48, 64, 72px. Max content width: 960px with 24px horizontal padding.

## Component conventions

**Pill / code block:** dark terminal background (`--term-bg`), `--term-ink` text, 10px border-radius, `user-select: all` so the install command copies on click.

**Buttons:** `--card` background, `--line` border, `--ink` text, 10px border-radius. Hover: border becomes `--ink`. No filled primary button style — the install pill is the primary CTA.

**Status badges:** colored text on soft background. E.g. pass: `--green` on `--green-soft`. Always include a text label.

**Cards:** white (`--card`) on the warm background, `--line` border. No drop shadows. No cards nested inside cards.

## Do / Do Not

| Do | Do Not |
|---|---|
| Warm off-white background (`#fafaf8`) | Pure white or pure black backgrounds |
| Figtree for headings | Inter, DM Sans, Space Grotesk, IBM Plex for headings |
| System sans for body | Web fonts for body text |
| Semantic status colors with text labels | Color alone for status (a11y) |
| Calm authority — the tool reduces anxiety | Red/green CI alarm aesthetics |
| Show the review card / diff UI | Describe features in bullet lists without showing them |
| Specific, verifiable claims ("local, no API keys") | Hand-wavy marketing language |

## Anti-references (from PRODUCT.md)

- **No Stripe-minimal clone** — editorial typographic lane with display serif, italic, ruled columns, monochromatic restraint is saturated. Figtree + warm off-white is a deliberate departure.
- **No QA-tool alarm UI** — Percy, Chromatic, Applitools use red/green CI dashboards and pass/fail language. Gist is not for QA engineers.

## Surfaces

### Landing page (`site/index.html`)
Single HTML file, no bundler. All CSS inline in `<style>`. Google Fonts for Figtree only. Deployed to `gist.masalageek.com` via Cloudflare Pages.

### Local review UI (`src/ui-shell.ts`)
Generated HTML shell, inline JS/CSS, no bundler, no external requests. Served by `gist ui` at `localhost:4100`. Uses the same color tokens and type scale. The before/after/diff viewer is the primary surface non-technical approvers see — it sets the tone for the whole product.

## Accessibility

WCAG AA minimum. Status badges must use both color and text label — never color alone. Touch targets ≥ 44px. Headings must follow a logical hierarchy (h1 → h2 → h3, no skipping).
