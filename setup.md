# Run a real Gist pull-request review locally

This guide runs the existing Balanceflo capture/diff engine against a deployed pull-request preview, imports its real screenshots and statuses into Gist, and serves the resulting approver-facing report locally.

## What this exercises

- GitHub PR and Cloudflare preview discovery
- Production-versus-preview capture across desktop, tablet, and mobile
- Route discovery and affected-route classification
- Pixel-diff status calculation
- Portable Gist evidence generation with embedded screenshots
- The Gist summary, walkthrough, page ordering, and before/after controls

It does not require the hosted Gist ingest service. AI copy is optional; without a configured adapter, the deterministic explanation is used.

## Prerequisites

- Node.js 22 or newer
- pnpm 10
- GitHub CLI authenticated for `Mind-Lens/balanceflo-website`
- The Balanceflo repository installed locally with its Playwright dependencies
- A Balanceflo `.env.local` containing valid Cloudflare Access service credentials:

```dotenv
CF-Access-Client-Id=...
CF-Access-Client-Secret=...
```

Verify the basics:

```sh
node --version
pnpm --version
gh auth status
```

## One-time project checks

Set paths for your machine. These values match the current checkout layout:

```sh
GIST_REPO=/Users/balasivagnanam/Codes/personal-projects/gist
BALANCEFLO_REPO=/Users/balasivagnanam/Codes/balanceflo-website
```

Verify both projects:

```sh
cd "$GIST_REPO"
npm test

cd "$BALANCEFLO_REPO"
pnpm install
pnpm exec playwright install chromium
```

## Review a real PR

Choose an open PR with a successful Cloudflare Pages preview. PR #78 is the current example:

```sh
GIST_PR=78
GIST_TITLE="OpenPanel analytics debug test"
GIST_RUN="$BALANCEFLO_REPO/.qa/walkthroughs/pr-$GIST_PR"
GIST_LOCAL="$GIST_REPO/.local/pr-$GIST_PR"
```

### 1. Capture and compare the real deployment

```sh
cd "$BALANCEFLO_REPO"
pnpm qa --pr "$GIST_PR"
```

This is the slow step. The current site has roughly 49 routes × 3 viewports, so allow several minutes. Product differences may appear as failed Playwright cases while the bounded command continues; wait for the final manifest and verdict.

Expected artifacts include:

```text
.qa/walkthroughs/pr-<number>/
  affected-routes.json
  regression/summary.json
  regression/desktop-1440/
  regression/tablet-768/
  regression/mobile-375/
```

### 2. Import the engine evidence into Gist

```sh
cd "$GIST_REPO"
node bin/import-balanceflo.mjs \
  --run "$GIST_RUN" \
  --repository Mind-Lens/balanceflo-website \
  --pr "$GIST_PR" \
  --title "$GIST_TITLE" \
  --out "$GIST_LOCAL/evidence.json"
```

The importer chooses the most concerning viewport for each page and embeds its production/preview PNGs as data URLs. The resulting report therefore remains portable.

### 3. Build the Gist report

```sh
node bin/gist.mjs build \
  --config demo/gist.config.json \
  --evidence "$GIST_LOCAL/evidence.json" \
  --out "$GIST_LOCAL/report"
```

### 4. Serve and inspect it

```sh
python3 -m http.server 4173 --directory "$GIST_LOCAL/report"
```

Open <http://localhost:4173>. Stop the server with `Ctrl-C`.

Review the report at a 375-pixel viewport as well as desktop. Check:

- Does the headline communicate the verdict without code terminology?
- Are pages needing attention listed first?
- Do slideshow navigation and mobile swipe work?
- Does the before/after slider reveal the correct screenshots?
- Does the tap fallback switch fully between before and after?
- Are unexpected changes distinguished from capture failures?

## Faster repeat runs

If the QA artifacts already exist for the same PR revision, repeat only steps 2–4. Rerun capture after a new push because the PR head SHA and preview contents changed.

## Troubleshooting

### Cloudflare Access page appears in screenshots

Confirm both Cloudflare variables exist in the Balanceflo `.env.local` and that the token is attached to a `Service Auth` policy for `*.balanceflo-website.pages.dev`.

### Preview URL cannot be resolved

Confirm the PR has a successful Cloudflare Pages check. You can override discovery:

```sh
cd "$BALANCEFLO_REPO"
QA_PREVIEW_URL=https://branch-name.balanceflo-website.pages.dev pnpm qa --pr "$GIST_PR"
```

### Port 4173 is busy

Choose another port, such as `4174`, in the `http.server` command and browser URL.

### Report exceeds its artifact budget

Increase `limits.maxArtifactBytes` in the Gist configuration deliberately. Imported screenshots are embedded in the HTML, so a PR with many changed pages can produce a large portable report.

### Inspect the raw engine report

The engine’s detailed three-viewport report remains available at:

```text
$GIST_RUN/regression/index.html
```

Gist is the non-technical review layer; the raw report is useful when diagnosing a surprising classification.
