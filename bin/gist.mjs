#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildEnrichedReport } from "../src/enrichment.mjs";
import { uploadReport } from "../src/ingest.mjs";
import { enforceReportBudgets } from "../src/budgets.mjs";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || !process.argv[index + 1]) throw new TypeError(`Missing --${name}`);
  return process.argv[index + 1];
}

async function write(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
}

const WORKFLOW = `name: Gist website review
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
permissions:
  contents: read
  pull-requests: write
jobs:
  gist:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build and publish Gist report
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
          GIST_TOKEN: \${{ secrets.GIST_TOKEN }}
        run: npx @gist/review build --config gist.config.json --evidence .gist/evidence.json --out gist-report --publish
`;

const DEFAULT_CONFIG = {
  version: 1,
  productionUrl: "https://example.com",
  preview: { provider: "cloudflare-pages" },
  publish: { baseUrl: "https://gist.app" },
  limits: { maxPages: 50, maxCaptureHeightPx: 12000, maxArtifactBytes: 5000000 }
};

async function initialize() {
  const output = resolve(option("out"));
  await write(join(output, ".github/workflows/gist.yml"), WORKFLOW);
  await write(join(output, "gist.config.json"), `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  process.stdout.write(`Installed Gist workflow and configuration in ${output}\n`);
}

function validateConfig(config) {
  if (config?.version !== 1) throw new TypeError("config.version must be 1");
  for (const [field, value] of [["productionUrl", config.productionUrl], ["publish.baseUrl", config.publish?.baseUrl]]) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") throw new Error();
    } catch {
      throw new TypeError(`${field} must be an HTTPS URL`);
    }
  }
}

async function build() {
  const config = JSON.parse(await readFile(resolve(option("config")), "utf8"));
  validateConfig(config);
  const evidence = JSON.parse(await readFile(resolve(option("evidence")), "utf8"));
  const output = resolve(option("out"));
  const report = await buildEnrichedReport(evidence);
  enforceReportBudgets({ evidence, html: report.html, limits: config.limits });
  await write(join(output, "index.html"), report.html);
  await write(join(output, "status.json"), `${JSON.stringify(report.status, null, 2)}\n`);
  if (process.argv.includes("--publish")) {
    const publication = await uploadReport({
      baseUrl: config.publish.baseUrl,
      token: process.env.GIST_TOKEN,
      html: report.html,
      status: report.status
    });
    process.stdout.write(`${publication.url}\n`);
    return;
  }
  process.stdout.write(`${output}\n`);
}

const command = process.argv[2];
if (command === "init") await initialize();
else if (command === "build") await build();
else {
  process.stderr.write("Usage: gist <init|build> [options]\n");
  process.exitCode = 1;
}
