import { randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { pullRequestRevision } from "./identity.mjs";
import { buildEnrichedReport } from "./enrichment.mjs";
import { buildingReport } from "./publisher.mjs";

const STATE_RANK = Object.freeze({ building: 0, "evidence-ready": 1, complete: 2 });

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function authorized(header, expectedToken) {
  if (typeof expectedToken !== "string" || expectedToken === "") return false;
  const expected = Buffer.from(`Bearer ${expectedToken}`);
  const actual = Buffer.from(header || "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function reportDirectory(root, repository, pullRequest) {
  const [owner, name] = repository.split("/");
  return join(root, "pr", owner, name, String(pullRequest));
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function storeReport({ reportRoot, html, status }) {
  const identity = pullRequestRevision({
    repository: status?.repository,
    pullRequest: status?.pullRequest,
    headSha: status?.headSha
  }, "status");
  if (!(status.state in STATE_RANK)) throw new TypeError("status.state is unsupported");
  if (typeof html !== "string" || !html.toLowerCase().includes("<!doctype html>")) {
    throw new TypeError("html must be a complete HTML document");
  }
  const directory = reportDirectory(reportRoot, identity.repository, identity.pullRequest);
  await mkdir(directory, { recursive: true });
  const statusPath = join(directory, "status.json");
  const current = await readJsonIfExists(statusPath);
  if (current && current.headSha === identity.headSha && STATE_RANK[current.state] > STATE_RANK[status.state]) {
    return identity;
  }
  const suffix = randomUUID();
  const htmlTemporary = join(directory, `index.${suffix}.tmp`);
  const statusTemporary = join(directory, `status.${suffix}.tmp`);
  await writeFile(htmlTemporary, html, "utf8");
  await writeFile(statusTemporary, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  await rename(htmlTemporary, join(directory, "index.html"));
  await rename(statusTemporary, statusPath);
  return identity;
}

async function authenticatedPayload(request, deps, label) {
  if (!authorized(request.headers.get("authorization"), deps.ingestToken)) {
    return { response: json({ error: "unauthorized" }, 401) };
  }
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > (deps.maxBodyBytes ?? 60_000_000)) {
    return { response: json({ error: `${label} exceeds ingest budget` }, 413) };
  }
  try {
    return { payload: JSON.parse(body) };
  } catch (error) {
    return { response: json({ error: error.message }, 400) };
  }
}

function hostedUrl(deps, identity) {
  return `${deps.publicBaseUrl.replace(/\/$/, "")}/pr/${identity.repository}/${identity.pullRequest}`;
}

async function ingest(request, deps) {
  const parsed = await authenticatedPayload(request, deps, "report");
  if (parsed.response) return parsed.response;
  let payload;
  try {
    payload = parsed.payload;
    const identity = await storeReport({ reportRoot: deps.reportRoot, html: payload.html, status: payload.status });
    return json({ url: hostedUrl(deps, identity) }, 201);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
}

async function ingestEvidence(request, deps) {
  const parsed = await authenticatedPayload(request, deps, "evidence");
  if (parsed.response) return parsed.response;
  try {
    const { evidence } = parsed.payload;
    if (!Array.isArray(evidence?.pages)) throw new TypeError("evidence.pages is required");
    if (evidence.pages.length > 5) throw new TypeError("demo evidence is limited to 5 URLs");
    const report = await buildEnrichedReport(evidence, {});
    report.status.state = "complete";
    const identity = await storeReport({ reportRoot: deps.reportRoot, html: report.html, status: report.status });
    return json({ url: hostedUrl(deps, identity) }, 201);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
}

async function ingestBuilding(request, deps) {
  const parsed = await authenticatedPayload(request, deps, "request");
  if (parsed.response) return parsed.response;
  try {
    const { identity } = parsed.payload;
    const revision = pullRequestRevision(identity, "identity");
    const report = buildingReport(revision);
    await storeReport({ reportRoot: deps.reportRoot, html: report.html, status: report.status });
    return json({ url: hostedUrl(deps, revision) }, 201);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
}

async function serveReport(match, deps) {
  const repository = `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`;
  const pullRequest = Number(match[3]);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !Number.isInteger(pullRequest)) {
    return json({ error: "not found" }, 404);
  }
  const directory = reportDirectory(deps.reportRoot, repository, pullRequest);
  const statusRequest = Boolean(match[4]);
  try {
    const body = await readFile(join(directory, statusRequest ? "status.json" : "index.html"));
    return new Response(body, {
      headers: {
        "content-type": statusRequest ? "application/json; charset=utf-8" : "text/html; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    if (error.code === "ENOENT") return json({ error: "report not found" }, 404);
    throw error;
  }
}

export async function handleGistRequest(request, deps) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true });
  }
  if (request.method === "POST" && url.pathname === "/api/ingest") {
    return ingest(request, deps);
  }
  if (request.method === "POST" && url.pathname === "/api/evidence") {
    return ingestEvidence(request, deps);
  }
  if (request.method === "POST" && url.pathname === "/api/building") {
    return ingestBuilding(request, deps);
  }
  const reportMatch = url.pathname.match(/^\/pr\/([^/]+)\/([^/]+)\/(\d+)(\/status\.json)?$/);
  if (request.method === "GET" && reportMatch) return serveReport(reportMatch, deps);
  if (request.method === "GET" && url.pathname === "/") {
    return new Response("<!doctype html><title>Gist</title><h1>Gist</h1><p>Approve website changes without reading code.</p>", { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return json({ error: "not found" }, 404);
}
