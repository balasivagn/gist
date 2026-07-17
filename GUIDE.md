# Gist — User Guide

Approve website changes without reading code. Gist screenshots your site
**before** and **after** a pull request, diffs them, and — through your coding
agent — writes a plain-English summary of what changed.

You'll go from install to a reviewed PR in about 5 minutes.

---

## Step 1 — Install

You need **Node.js 22+**. Then:

```sh
npm install -g @gist/review
```

This is fast — it does **not** download a browser yet.

## Step 2 — Set up in your project

From the root of the website repo you want to review:

```sh
gist init
```

This does everything needed to set up the project:

1. Installs the headless browser Gist uses (a one-time ~download; only happens
   the first time).
2. Writes a starter config at `.gist/config.json`.
3. Adds `.gist/` to your `.gitignore` (its output is local-only).
4. Installs the `/gist` skill into `.claude/skills/` so Claude Code can write
   the walkthrough (Step 5).

## Step 3 — Configure

Open `.gist/config.json` and set it up for your site:

```json
{
  "version": 1,
  "productionUrl": "https://your-site.com",
  "viewports": [
    { "name": "desktop", "width": 1440, "height": 900 },
    { "name": "mobile", "width": 390, "height": 844 }
  ],
  "routes": ["/", "/pricing", "/about"],
  "diffPercentThreshold": 0.5,
  "pixelThreshold": 0.1
}
```

- **`productionUrl`** — your live site. This is the "before".
- **`routes`** — the pages to check.
- **`viewports`** — the screen sizes to capture.

## Step 4 — Run a review

Gist compares your production site (before) against your PR's **preview
deployment** (after).

If your PRs get preview deploys (Vercel, Netlify, Cloudflare Pages), Gist finds
the preview URL automatically using the GitHub CLI:

```sh
gist run --pr 42
```

If you don't have `gh` or a preview deploy, point at the two URLs yourself:

```sh
gist run --pr 42 --base https://your-site.com --head https://pr-42.preview.your-site.com
```

Tell Gist which routes the PR is *meant* to change, so they're reported as
"changed as planned" instead of "unexpected":

```sh
gist run --pr 42 --affected /pricing,/about
```

When it finishes you'll see a summary line like:

```
Totals: 2 changed · 0 unexpected · 0 broken
```

## Step 5 — Generate the plain-English walkthrough

The screenshots and diffs are ready, but the human-readable summary is written
by your coding agent. In **Claude Code**, run:

```
/gist
```

It reads the latest run, looks at the diffs, and writes a `summary.md` for the
run.

> `gist init` already installed this skill. If you ever need to re-install it
> (or you set the project up before this step existed), run:
> ```sh
> gist skill install
> ```

## Step 6 — Review it

```sh
gist ui
```

It opens http://127.0.0.1:4100 in your browser (use `gist ui --no-open` to
skip that). You'll see every PR, each run under it, the
plain-English summary, and a before / after / diff for every page. Share your
screen with whoever approves the change — they read the summary, glance at the
diffs, and say yes or "take a look at page X".

---

## The everyday loop

Once set up, reviewing a PR is:

```sh
gist run --pr 42      # capture + diff
# then /gist in Claude Code
gist ui               # look at it
```

## Troubleshooting

- **"No .gist/config.json"** → run `gist init` first.
- **"The Playwright browser isn't installed"** → run `gist init`.
- **"GitHub CLI (gh) not found"** → either install `gh`, or pass the preview URL
  with `--head`.
- **"Could not find a preview URL"** → your PR has no detectable preview deploy;
  pass it with `--head <url>`.
- **A page looks blank/cut off** → very tall pages are captured up to a height
  cap; the run marks these as "truncated".
