#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { uploadEvidence } from "../src/ingest.mjs";

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
      - name: Publish Gist evidence
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
  limits: { maxPages: 50, maxCaptureHeightPx: 12000, maxArtifactBytes: 50000000 },
};

async function initialize() {
  const output = resolve(option("out"));
  await write(join(output, ".github/workflows/gist.yml"), WORKFLOW);
  await write(join(output, "gist.config.json"), `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  process.stdout.write(`Installed Gist workflow and configuration in ${output}\n`);
}

function validateConfig(config) {
  if (config?.version !== 1) throw new TypeError("config.version must be 1");
  for (const [field, value] of [
    ["productionUrl", config.productionUrl],
    ["publish.baseUrl", config.publish?.baseUrl],
  ]) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error();
    } catch {
      throw new TypeError(`${field} must be an HTTPS URL`);
    }
  }
}

async function build() {
  const configPath = resolve(option("config"));
  const evidencePath = resolve(option("evidence"));
  const config = JSON.parse(await readFile(configPath, "utf8"));
  validateConfig(config);
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const output = resolve(option("out"));

  if (process.argv.includes("--publish")) {
    const publication = await uploadEvidence({
      baseUrl: config.publish.baseUrl,
      token: process.env.GIST_TOKEN,
      evidence,
    });
    process.stdout.write(`${publication.url}\n`);
    return;
  }

  const script = fileURLToPath(new URL("./build-presentation.mts", import.meta.url));
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", script, configPath, evidencePath, output],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "build failed\n");
    process.exitCode = result.status || 1;
    return;
  }
  process.stdout.write(result.stdout);
}

const command = process.argv[2];
if (command === "init") await initialize();
else if (command === "build") await build();
else {
  process.stderr.write("Usage: gist <init|build> [options]\n");
  process.exitCode = 1;
}
