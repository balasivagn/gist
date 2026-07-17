import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { handleGistRequest } from "../src/hosted-service.mjs";

const status = {
  version: 1,
  state: "complete",
  repository: "Mind-Lens/balanceflo-website",
  pullRequest: 78,
  headSha: "29b6c7021e315c1f85c47993e4dfea251efed00e",
  counts: { changed: 1, needsLook: 1, broken: 0 }
};

test("an authenticated upload becomes a hosted pull-request report", async () => {
  const reportRoot = await mkdtemp(join(tmpdir(), "gist-hosted-"));
  const deps = { reportRoot, ingestToken: "secret-token", publicBaseUrl: "https://gist.example" };
  const upload = await handleGistRequest(new Request("https://gist.example/api/ingest", {
    method: "POST",
    headers: { authorization: "Bearer secret-token", "content-type": "application/json" },
    body: JSON.stringify({ html: "<!doctype html><h1>Real review</h1>", status })
  }), deps);
  const report = await handleGistRequest(new Request("https://gist.example/pr/Mind-Lens/balanceflo-website/78"), deps);
  const machineStatus = await handleGistRequest(new Request("https://gist.example/pr/Mind-Lens/balanceflo-website/78/status.json"), deps);

  assert.deepEqual(
    {
      uploadStatus: upload.status,
      uploadBody: await upload.json(),
      reportStatus: report.status,
      reportBody: await report.text(),
      machineState: (await machineStatus.json()).state
    },
    {
      uploadStatus: 201,
      uploadBody: { url: "https://gist.example/pr/Mind-Lens/balanceflo-website/78" },
      reportStatus: 200,
      reportBody: "<!doctype html><h1>Real review</h1>",
      machineState: "complete"
    }
  );
});

test("hosted ingest rejects bad credentials, unsafe paths, and oversized reports", async () => {
  const reportRoot = await mkdtemp(join(tmpdir(), "gist-hosted-"));
  const deps = { reportRoot, ingestToken: "secret-token", publicBaseUrl: "https://gist.example", maxBodyBytes: 64 };
  const unauthorized = await handleGistRequest(new Request("https://gist.example/api/ingest", {
    method: "POST",
    body: "{}"
  }), deps);
  const unsafe = await handleGistRequest(new Request("https://gist.example/pr/../../etc/passwd"), deps);
  const oversized = await handleGistRequest(new Request("https://gist.example/api/ingest", {
    method: "POST",
    headers: { authorization: "Bearer secret-token" },
    body: "x".repeat(65)
  }), deps);

  assert.deepEqual(
    { unauthorized: unauthorized.status, unsafe: unsafe.status, oversized: oversized.status },
    { unauthorized: 401, unsafe: 404, oversized: 413 }
  );
});

test("the hosted service renders a bounded evidence bundle from a trusted runner", async () => {
  const reportRoot = await mkdtemp(join(tmpdir(), "gist-hosted-"));
  const deps = { reportRoot, ingestToken: "secret-token", publicBaseUrl: "https://gist.example" };
  const evidence = {
    version: 1,
    repository: "Mind-Lens/balanceflo-website",
    pullRequest: {
      number: 78,
      title: "Website change review",
      headSha: status.headSha
    },
    pages: Array.from({ length: 5 }, (_, index) => ({
      route: index === 0 ? "/" : `/page-${index}/`,
      title: index === 0 ? "Home" : `Page ${index}`,
      status: index === 0 ? "expected-change" : "pass",
      diffRatio: index === 0 ? 0.04 : 0
    }))
  };

  const upload = await handleGistRequest(new Request("https://gist.example/api/evidence", {
    method: "POST",
    headers: { authorization: "Bearer secret-token", "content-type": "application/json" },
    body: JSON.stringify({ evidence })
  }), deps);
  const report = await handleGistRequest(new Request("https://gist.example/pr/Mind-Lens/balanceflo-website/78"), deps);

  assert.equal(upload.status, 201);
  assert.match(await report.text(), /Walk through the change/);

  const overBudget = await handleGistRequest(new Request("https://gist.example/api/evidence", {
    method: "POST",
    headers: { authorization: "Bearer secret-token", "content-type": "application/json" },
    body: JSON.stringify({ evidence: { ...evidence, pages: [...evidence.pages, evidence.pages[0]] } })
  }), deps);
  assert.equal(overBudget.status, 400);
});

test("a trusted runner can publish the stable building link before capture finishes", async () => {
  const reportRoot = await mkdtemp(join(tmpdir(), "gist-hosted-"));
  const deps = { reportRoot, ingestToken: "secret-token", publicBaseUrl: "https://gist.example" };
  const building = await handleGistRequest(new Request("https://gist.example/api/building", {
    method: "POST",
    headers: { authorization: "Bearer secret-token", "content-type": "application/json" },
    body: JSON.stringify({
      identity: {
        repository: "Mind-Lens/balanceflo-website",
        pullRequest: 78,
        headSha: status.headSha
      }
    })
  }), deps);
  const report = await handleGistRequest(new Request("https://gist.example/pr/Mind-Lens/balanceflo-website/78"), deps);
  const machineStatus = await handleGistRequest(new Request("https://gist.example/pr/Mind-Lens/balanceflo-website/78/status.json"), deps);

  assert.deepEqual(
    {
      response: building.status,
      url: (await building.json()).url,
      hasBuildingCopy: (await report.text()).includes("Building your review"),
      state: (await machineStatus.json()).state
    },
    {
      response: 201,
      url: "https://gist.example/pr/Mind-Lens/balanceflo-website/78",
      hasBuildingCopy: true,
      state: "building"
    }
  );
});
