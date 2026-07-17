# Run a real Gist pull-request review locally

This guide runs the Balanceflo capture/diff engine against a deployed pull-request preview, imports its real screenshots and statuses into Gist, and serves the resulting approver-facing report locally. Demo runs are intentionally capped at **5 representative URLs**.

## What this exercises

- GitHub PR and Cloudflare preview discovery
- Production-versus-preview capture across desktop, tablet, and mobile
- Route discovery and affected-route classification
- Pixel-diff status calculation
- Portable Gist evidence generation with embedded screenshots
- The Gist summary, walkthrough, page ordering, and before/after controls

The core local path does not require the hosted Gist ingest service. Complete evidence ingest on the Next.js host **requires** `ANTHROPIC_API_KEY` so the AI Scene Director can write walkthrough focus, zoom, and annotations. For credential-free demos and tests, set `GIST_MOCK_SCENES=1`.

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

Set paths for your machine. Replace the Balanceflo path with your own checkout:

```sh
cd /path/to/gist
GIST_REPO="$PWD"
BALANCEFLO_REPO=/path/to/balanceflo-website
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
QA_MAX_ROUTES=5 pnpm qa --pr "$GIST_PR"
```

The route selector analyzes the full sitemap and changed-file mapping, then captures at most five URLs in this order: affected routes, configured key routes, and sitemap fallbacks. Each selected URL is checked at desktop, tablet, and mobile. Product differences may appear as failed Playwright cases while the bounded command continues; wait for the final manifest and verdict.

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

### 3. Publish evidence into the Next.js app

Start the console (separate terminal):

```sh
cd "$GIST_REPO"
export GIST_INGEST_TOKEN="replace-with-a-long-random-local-token"
export REPORT_ROOT="$GIST_REPO/.local/hosted-reports"
export PUBLIC_BASE_URL="http://localhost:3000"
export ANTHROPIC_API_KEY="sk-ant-..."
npm run dev
```

If Node fails Anthropic calls with `SELF_SIGNED_CERT_IN_CHAIN` (common with Cloudflare Gateway / WARP TLS inspection), export the Gateway CA and point Node at it before starting the server:

```sh
security find-certificate -a -c "Gateway CA - Cloudflare" -p > .local/certs/cloudflare-gateway-ca.pem
export NODE_EXTRA_CA_CERTS="$PWD/.local/certs/cloudflare-gateway-ca.pem"
```

Publish the imported evidence:

```sh
cd "$GIST_REPO"
GIST_TOKEN="$GIST_INGEST_TOKEN" node bin/gist.mjs build \
  --config demo/gist.local.config.json \
  --evidence "$GIST_LOCAL/evidence.json" \
  --out "$GIST_LOCAL/report" \
  --publish
```

### 4. Inspect the React report

Open the returned URL (or <http://localhost:3000>). Check:

- The home page lists the pull request
- `/pr/<owner>/<repo>/<n>` shows the latest run report
- `/pr/<owner>/<repo>/<n>/runs` lists run history with summaries
- Slideshow, before/after slider, and status labels read as plain English

## Evaluate the hosted service locally

This exercises the same Next.js process deployed to Railway.

```sh
cd "$GIST_REPO"
export GIST_INGEST_TOKEN="replace-with-a-long-random-local-token"
export REPORT_ROOT="$GIST_REPO/.local/hosted-reports"
export PUBLIC_BASE_URL="http://localhost:3000"
export ANTHROPIC_API_KEY="sk-ant-..."
npm run build && npm start
```

Health check:

```sh
curl --fail http://localhost:3000/api/health
```

Ingest (structured evidence, not HTML):

```text
POST /api/ingest/building
POST /api/ingest/evidence
```

Compatibility aliases: `POST /api/building`, `POST /api/evidence`.

The production demo is currently hosted at:

```text
https://web-production-024b4.up.railway.app
```

Stable report URL:

```text
https://web-production-024b4.up.railway.app/pr/<owner>/<repository>/<pr-number>
```

The automated Balanceflo workflow supplies the ingest credential from the encrypted `GIST_INGEST_TOKEN` Actions secret. Do not put that token in this repository or in a command committed to shell history.

### Recreate the Railway service

Install and authenticate the Railway CLI, then run these commands from the Gist repository:

```sh
cd "$GIST_REPO"
railway login
railway init --name gist-demo
railway add --service web
railway service web
railway volume add --mount-path /data
railway domain --service web --json
```

Copy the generated HTTPS domain into `GIST_BASE_URL`, generate one shared credential, and configure both sides:

```sh
GIST_BASE_URL=https://your-generated-domain.up.railway.app
GIST_INGEST_TOKEN="$(openssl rand -hex 32)"

railway variables --service web --skip-deploys \
  --set REPORT_ROOT=/data/reports \
  --set PUBLIC_BASE_URL="$GIST_BASE_URL" \
  --set GIST_INGEST_TOKEN="$GIST_INGEST_TOKEN"

printf %s "$GIST_INGEST_TOKEN" | \
  gh secret set GIST_INGEST_TOKEN --repo Mind-Lens/balanceflo-website
gh variable set GIST_BASE_URL \
  --repo Mind-Lens/balanceflo-website \
  --body "$GIST_BASE_URL"

railway up --service web --ci
curl --fail "$GIST_BASE_URL/api/health"
unset GIST_INGEST_TOKEN
```

The `/data` volume is required. `railway.json` runs `next build` / `next start` with health check `/api/health`.

## Evaluate the automatic PR experience

After the Balanceflo integration is merged to its trusted `main`, deploy it to the Mac runner:

```sh
gh workflow run deploy-qa-host.yml --repo Mind-Lens/balanceflo-website
gh run watch --repo Mind-Lens/balanceflo-website
```

Then evaluate the PR experience:

1. Open or update a non-draft PR from the main Balanceflo repository (fork PRs are intentionally rejected).
2. Wait for the `PR Preview QA (self-hosted)` workflow.
3. Confirm the persistent `BalanceFlo PR QA` comment moves from running to its final verdict.
4. Open the Gist report link in that comment.
5. Confirm the report contains no more than five URLs and that changed routes appear before key-route fillers.

No local Gist process is needed for this path: capture runs on the existing trusted Mac runner, report rendering runs on Railway, and the same PR comment is updated in place. With `GIST_REQUIRED=1` in the workflow, missing credentials or failed hosted publication produce an infrastructure failure instead of silently linking the legacy raw report.

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

### A hosted upload returns 404 with a very large HTML report

Use the `/api/evidence` path used by the automated runner, which sends a five-URL evidence bundle and lets Railway render the HTML. A previously generated all-route inline-HTML report can exceed the platform request-body boundary even when the Gist process itself allows 60 MB.
