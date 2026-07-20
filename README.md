# Gist

> **Approve website changes without reading code.**

Gist turns a website pull request into a before/after visual review: deterministic
screenshots of every page, a local diff UI, and a plain-English AI walkthrough
written by the coding agent you already have. No hosted service, no API keys.

It is a **local, open-source tool**. The AI step runs through your local Claude
Code session — Gist ships zero secrets.

## How it works

Three parts, decoupled through a `.gist/` folder on disk:

1. **`gist run`** — Playwright captures every configured route at every viewport
   on base (production) and head (PR preview), pixel-diffs them, and writes
   screenshots + `evidence.json` into `.gist/`. Deterministic: same inputs,
   same result, every time.

2. **`/gist` skill** — inside Claude Code, `/gist` reads the run evidence, fetches
   the full PR description and comments to understand intent, identifies what
   changed and whether it looks intentional, and writes a plain-English
   `summary.md` + annotated `regions.json`. It also opens the review UI
   automatically when done.

3. **`gist ui`** — a tiny local viewer: PRs → runs → AI summary → annotated
   before/after panels per change region. Never calls an LLM.

---

## Install

Node.js 22 or newer.

```sh
npm install -g @gist/review   # fast — no browser download yet
gist init                     # installs the Playwright browser (one-time, ~150 MB)
                              # scaffolds .gist/config.json
                              # installs the /gist skill into .claude/skills/
```

`gist init` is where the browser download happens, so `npm install` stays fast.

---

## Set up

Open `.gist/config.json` and point it at your site:

```json
{
  "version": 1,
  "productionUrl": "https://your-site.com",
  "viewports": [
    { "name": "desktop", "width": 1440, "height": 900 },
    { "name": "mobile",  "width": 390,  "height": 844 }
  ],
  "routes": ["/", "/pricing", "/about"],
  "diffPercentThreshold": 0.5,
  "pixelThreshold": 0.1
}
```

| Field | Meaning |
|---|---|
| `productionUrl` | The base/"before" URL captured for every PR |
| `viewports` | Screen sizes to capture |
| `routes` | Paths to capture (relative to each origin) |
| `diffPercentThreshold` | Diff % above which a page counts as changed |
| `pixelThreshold` | pixelmatch per-pixel sensitivity (0–1) |
| `extraHeaders` | Optional headers sent only to the captured origin (auth for gated previews) |

---

## The everyday loop

Reviewing a PR is two commands:

```sh
gist run --pr 42   # capture + diff (uses gh to find the preview URL automatically)
# then /gist in Claude Code — writes the walkthrough and opens the review UI
```

That's it. The browser opens to `http://127.0.0.1:4100` with the full review:
PR intent, what changed, what looks intentional, what's worth a closer look —
with annotated before/after panels for every change region.

### Options for `gist run`

```sh
# Override URLs manually (no gh / no PR needed):
gist run --pr 42 --base https://acme.com --head https://pr-42.preview.acme.com

# Mark routes the PR is meant to change (reported as "changed as planned"):
gist run --pr 42 --affected /pricing,/about
```

---

## The `.gist/` folder

```
.gist/
  config.json              shared team config — commit this
  prs/
    pr-42/
      meta.json            PR title, description, comments (from gh)
      runs/
        2026-07-17T18-30-00/
          evidence.json    deterministic — written by gist run
          summary.md       AI walkthrough — written by /gist skill
          regions.json     AI change regions + verdicts — written by /gist skill
          screenshots/     <slug>.base.png / .head.png / .diff.png
```

**Commit** `.gist/config.json` — it holds your team's shared routes, viewports,
and thresholds.

**Don't commit** everything else (`prs/`, screenshots, `evidence.json`,
`summary.md`, `regions.json`). `gist init` writes a `.gitignore` block that
covers this automatically.

---

## Requirements

- **Node.js 22+**
- **[GitHub CLI](https://cli.github.com/)** (`gh`) — for auto-detecting PR
  preview URLs. Install once and run `gh auth login`. Skip it with explicit
  `--base` / `--head` flags.
- **Claude Code** — for the `/gist` skill. Any Claude plan works.

---

## Troubleshooting

**`Could not find a preview URL for PR #N`**
Gist looks for `*.pages.dev`, `*.workers.dev`, `*.vercel.app`, or
`*--*.netlify.app` URLs in the PR's deployment statuses and comments. For other
hosts, pass the URL directly:
```sh
gist run --pr 42 --head https://my-preview.example.com
```

**`browserType.launch: Executable doesn't exist`**
Run `gist init` to install the Playwright browser (one-time, separate from
`npm install`).

**`gh: command not found` or `Could not resolve to a PullRequest`**
Install the [GitHub CLI](https://cli.github.com/) and run `gh auth login`, or
skip it with explicit `--base` / `--head` flags.

**Diffs are all red / pages look completely different**
Usually a font, animation, or cookie-consent overlay that renders differently
on each run. Raise `pixelThreshold` in `.gist/config.json` to ignore
anti-aliasing noise.

**`gist ui` shows no PRs**
The UI reads `.gist/prs/`. Make sure you've run `gist run` at least once from
the same repo root.

**Preview URL from Cloudflare not appearing on the PR**
Make sure `"workers_dev": true` is set in your `wrangler.jsonc` — Cloudflare
only posts the preview URL to the PR when the workers.dev subdomain is enabled.

---

## FAQ

**Does Gist need an LLM to work?**
No. `gist run` and `gist ui` are fully deterministic. The `/gist` skill is
optional — without it, Gist is still a visual-diff tool with a local review UI.

**Does Gist send my screenshots anywhere?**
Never. Everything stays in `.gist/` on your machine. The AI step runs through
your local Claude Code session.

**Can I use Gist without a GitHub PR?**
Yes. Pass `--base` and `--head` directly:
```sh
gist run --pr 0 --base https://prod.example.com --head https://staging.example.com
```

**Which hosting providers does auto-detection support?**
Cloudflare Pages (`*.pages.dev`), Cloudflare Workers (`*.workers.dev`), Vercel
(`*.vercel.app`), and Netlify (`*--*.netlify.app`). For other hosts, pass
`--head <url>`.

**Can I run Gist in CI?**
Yes — `gist run` exits 0 and writes evidence to `.gist/`. Upload it as an
artifact or commit it. The UI and skill are optional downstream steps.

**Does it work with non-React / non-Next.js sites?**
Yes. Gist captures any URL with Playwright — static HTML, SvelteKit, Astro,
Rails, whatever your stack is.

---

## Develop

```sh
npm test            # 29 unit tests — fast, offline
npm run typecheck   # tsc --noEmit
npm run gist -- run --pr 42 --base ... --head ...   # run CLI from source
npm install -g .    # install local build globally for manual testing
```

---

## The thesis

Coding agents now ship website changes faster than any human can review them.
The bottleneck is no longer *writing* the change or even *correctness* — it's
**understanding**. The person who has to *approve* a change often can't read a
diff.

Gist closes that understanding gap — a concrete instance of Geoffrey Litt's
"[Understanding is the new bottleneck](https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck.html)",
applied one layer up: not "help the engineer understand the code," but "help the
approver understand the change."

---

## Contact

Found a bug? [Open an issue on GitHub](https://github.com/balasivagn/gist/issues).

Have a question or idea? [Start a GitHub Discussion](https://github.com/balasivagn/gist/discussions).

---

## Docs

- [`docs/CHANGE-REVIEW.md`](docs/CHANGE-REVIEW.md) — how the AI skill reviews changes
- [`docs/planning/`](docs/planning/) — original spec, architecture, and design notes
