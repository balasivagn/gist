import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildEnrichedReport } from "./enrichment.mjs";
import { generateReport } from "./report.mjs";

const STATE_RANK = Object.freeze({ building: 0, "evidence-ready": 1, complete: 2 });
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_SHA = /^[A-Fa-f0-9]{6,64}$/;

function validateIdentity(identity) {
  if (!identity || !SAFE_REPOSITORY.test(identity.repository || "")) {
    throw new TypeError("identity.repository must be an owner/repository name");
  }
  if (!Number.isInteger(identity.pullRequest) || identity.pullRequest < 1) {
    throw new TypeError("identity.pullRequest must be a positive integer");
  }
  if (!SAFE_SHA.test(identity.headSha || "")) {
    throw new TypeError("identity.headSha must be a hexadecimal revision");
  }
}

function buildingReport(identity) {
  const status = {
    version: 1,
    state: "building",
    repository: identity.repository,
    pullRequest: identity.pullRequest,
    headSha: identity.headSha,
    counts: null
  };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="10"><title>Building your review · Gist</title><style>body{font:1.1rem/1.5 system-ui,sans-serif;margin:0;background:#f4f3ee;color:#17201b}main{width:min(100% - 2rem,42rem);margin:15vh auto}.pulse{width:3rem;height:.35rem;border-radius:1rem;background:#19613b;animation:pulse 1.2s infinite alternate}@keyframes pulse{to{opacity:.25;transform:scaleX(.5)}}</style></head><body><main aria-live="polite"><p>Gist</p><h1>Building your review…</h1><p>We’re capturing and comparing the changed pages. This link will update automatically.</p><div class="pulse"></div></main></body></html>`;
  return { html, status };
}

async function currentStatus(directory) {
  try {
    return JSON.parse(await readFile(join(directory, "status.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function publishReport({ root, identity, state, evidence, ai }) {
  validateIdentity(identity);
  if (!(state in STATE_RANK)) throw new TypeError("state must be building, evidence-ready, or complete");
  const [owner, repository] = identity.repository.split("/");
  const directory = join(root, "pr", owner, repository, String(identity.pullRequest));
  await mkdir(directory, { recursive: true });
  const existing = await currentStatus(directory);
  if (existing && STATE_RANK[existing.state] > STATE_RANK[state]) return { directory, status: existing };

  let report;
  if (state === "building") {
    report = buildingReport(identity);
  } else if (state === "evidence-ready") {
    report = generateReport(evidence, { state });
  } else {
    report = await buildEnrichedReport(evidence, { ai });
  }
  report.status.state = state;
  await writeFile(join(directory, "index.html"), report.html, "utf8");
  await writeFile(join(directory, "status.json"), `${JSON.stringify(report.status, null, 2)}\n`, "utf8");
  return { directory, status: report.status };
}
