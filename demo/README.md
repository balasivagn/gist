# Gist demo journey

The fixture represents pull request #17 in `demo/gist-site`: the requested homepage signup improvement, a new contact page, and an unexpected pricing layout shift.

Build presentation JSON without credentials:

```sh
npm run build:demo
```

That writes `dist/demo/presentation.json` and `dist/demo/evidence.json`.

To view the React report:

```sh
export GIST_INGEST_TOKEN=local-demo-token
export REPORT_ROOT=.data/demo-reports
export PUBLIC_BASE_URL=http://localhost:3000
npm run dev
```

In another terminal, set `publish.baseUrl` to `http://localhost:3000` (or temporarily edit `demo/gist.config.json`) and:

```sh
GIST_TOKEN=local-demo-token node bin/gist.mjs build \
  --config demo/gist.local.config.json \
  --evidence demo/evidence.json \
  --out dist/demo \
  --publish
```

Open the returned `/pr/demo/gist-site/17` URL. The report should lead with the pricing page that needs attention.
