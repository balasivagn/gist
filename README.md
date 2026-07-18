# Gist

> **Approve website changes without reading code.**

Gist runs a deterministic before/after screenshot check on a website pull
request, shows the diffs in a local UI, and — through your coding agent — writes
a plain-English walkthrough a non-technical owner can understand in 30 seconds:
what changed, and whether anything needs their attention.

It is a **local, open-source tool**. No hosted service, no API keys to manage.
The AI walkthrough runs through the coding agent you already have (Claude Code),
so Gist ships zero secrets.

## Three parts

1. **Deterministic capture** (`gist run`) — Playwright captures every route on
   the base (production) and head (PR preview), diffs them pixel-for-pixel, and
   writes screenshots + `evidence.json` into a gitignored `.gist/` folder. Same
   inputs, same result, every time.
2. **Local UI** (`gist ui`) — a tiny local viewer that consolidates
   **PRs → runs → summary**, with before / after / diff for every page. It only
   reads `.gist/`; it never calls an LLM.
3. **AI walkthrough** (the `/gist` skill) — inside Claude Code, `/gist` reads the
   evidence and writes `summary.md` for a run. This is the only
   non-deterministic part, and it uses *your* agent's auth.

The three parts are decoupled through the `.gist/` folder on disk.

## Install

Node.js 22 or newer.

```sh
npm install -g @gist/review    # light — no browser download yet
gist init                      # installs the Playwright browser on first run,
                               # and scaffolds .gist/config.json
```

`gist init` is where the ~one-time browser download happens, so `npm install`
stays fast.

## Use

```sh
# 1. Point .gist/config.json at your production URL + routes (gist init scaffolds it)

# 2. Capture. Uses `gh` to find the PR's preview deploy automatically:
gist run --pr 42

#    …or drive it manually with explicit URLs (no gh / no PR needed):
gist run --pr 42 --base https://acme.com --head https://pr-42.preview.acme.com

#    …mark routes the PR is meant to change (so they read as "changed as
#    planned" instead of "unexpected"):
gist run --pr 42 --affected /pricing,/about

# 3. Generate the plain-English walkthrough, inside Claude Code:
#    /gist        (reads the newest run's evidence, writes summary.md)

# 4. Review it all locally:
gist ui           # http://127.0.0.1:4100
```

## Configuration

`.gist/config.json` (created by `gist init`):

| Field | Meaning |
|---|---|
| `productionUrl` | The base/"before" URL captured for every PR |
| `viewports` | Screen sizes to capture, e.g. desktop + mobile |
| `routes` | Paths to capture (relative to each origin) |
| `diffPercentThreshold` | Diff % above which a page counts as changed |
| `pixelThreshold` | pixelmatch per-pixel sensitivity (0–1) |
| `extraHeaders` | Optional headers sent only to the captured origin (auth for a gated preview) |

## The `.gist/` folder

```
.gist/
  config.json
  prs/
    pr-42/
      meta.json
      runs/
        2026-07-17T18-30-00/
          evidence.json         # deterministic — written by `gist run`
          summary.md            # AI walkthrough — written by the /gist skill
          screenshots/          # <slug>.base.png / .head.png / .diff.png
```

**What to commit:** `.gist/config.json` holds your team's shared routes, viewports, and thresholds — commit it so every teammate gets the same capture settings.

**What not to commit:** everything else (`prs/`, screenshots, `evidence.json`, `summary.md`). `gist init` writes a named `.gitignore` block that covers this automatically. If you're in a monorepo and `.gist/` sits under a nested workspace (e.g. `apps/web/.gist/`), the unanchored patterns in the block still match it.

If a screenshot was committed before the block was added, run `git rm --cached .gist/prs/` to stop tracking it without deleting your local copy.

## The `/gist` skill

The skill ships in this package at [`skill/gist/SKILL.md`](skill/gist/SKILL.md).
To use it in a project, copy or symlink it into that project's
`.claude/skills/gist/`. It reads the run's `evidence.json`, looks at the diff
screenshots, and writes `summary.md`.

## Develop

```sh
npm test         # deterministic diff, store, and resolve unit tests
npm run typecheck
npm run gist -- run --pr 42 --base ... --head ...   # run the CLI from source
```

## The thesis

Coding agents now ship website changes faster than any human can review them.
The bottleneck is no longer *writing* the change or even *correctness* — it's
**understanding**. The person who has to *approve* a change often can't read a
diff.

Gist closes that understanding gap — a concrete instance of Geoffrey Litt's
"[Understanding is the new bottleneck](https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck.html)",
applied one layer up: not "help the engineer understand the code," but "help the
approver understand the change."

## Troubleshooting

**`Could not find a preview URL for PR #N`**
Gist looks for a `*.pages.dev`, `*.workers.dev`, `*.vercel.app`, or `*.netlify.app` URL in the PR's deployment statuses and comments. If your deploy posts a different domain, pass it directly:
```sh
gist run --pr 42 --head https://my-preview.example.com
```

**`browserType.launch: Executable doesn't exist`**
Run `gist init` to install the Playwright browser (a one-time step, separate from `npm install`).

**`gh: command not found` or `Could not resolve to a PullRequest`**
Gist uses the [GitHub CLI](https://cli.github.com/) to fetch PR metadata and preview URLs. Install it and run `gh auth login` once, or skip it entirely with explicit `--base` / `--head` flags.

**Diffs are all red / pages look completely different**
Usually a font, animation, or cookie-consent overlay that renders differently on each run. Try raising `pixelThreshold` (0–1) in `.gist/config.json` to ignore anti-aliasing noise, or add `extraWaitMs` to let the page settle before capture.

**`gist ui` shows no PRs**
The UI reads `.gist/prs/`. Make sure you've run `gist run` at least once from the same repo root.

## FAQ

**Does Gist need an LLM to work?**
No. `gist run` and `gist ui` are fully deterministic and never call a model. The `/gist` skill is optional — without it, Gist is still a visual-diff tool with a local review UI.

**Does Gist send my screenshots anywhere?**
Never. Everything stays in `.gist/` on your machine (gitignored by default). The AI step runs through your local Claude Code session, not an external API Gist controls.

**Can I use Gist without a GitHub PR?**
Yes. Pass `--base` and `--head` directly and use any integer as the PR number:
```sh
gist run --pr 0 --base https://prod.example.com --head https://staging.example.com
```

**Which hosting providers does auto-detection support?**
Cloudflare Pages (`*.pages.dev`), Cloudflare Workers (`*.workers.dev`), Vercel (`*.vercel.app`), and Netlify (`*--*.netlify.app`). For other hosts, pass `--head <url>`.

**Can I run Gist in CI?**
Yes — `gist run` exits 0 and writes evidence to `.gist/`. You can upload it as an artifact or commit it. The UI and skill are optional downstream steps.

**Does it work with non-React / non-Next.js sites?**
Yes. Gist captures any URL with Playwright — static HTML, SvelteKit, Astro, Rails, whatever your stack is.

## Contact

Found a bug? [Open an issue on GitHub](https://github.com/balasivagn/gist/issues).

Have a question or idea? [Start a GitHub Discussion](https://github.com/balasivagn/gist/discussions).

## Planning docs

The original spec/ticket pack lives alongside this README:
[`00-pitch.md`](00-pitch.md), [`01-product-spec.md`](01-product-spec.md),
[`02-architecture.md`](02-architecture.md), [`03-tickets.md`](03-tickets.md),
[`04-reuse-inventory.md`](04-reuse-inventory.md),
[`05-design-and-journey.md`](05-design-and-journey.md),
[`06-tiers-and-cost.md`](06-tiers-and-cost.md),
[`07-source-references.md`](07-source-references.md). The prior hosted/Next.js
implementation is parked under [`_backup/`](_backup/).
