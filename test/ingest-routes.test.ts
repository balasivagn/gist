import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { handleBuildingIngest, handleEvidenceIngest } from "../lib/ingest/handlers.ts";
import { getLatestRun, ingestEvidence, listRuns } from "../lib/store/report-store.ts";

const headSha = "29b6c7021e315c1f85c47993e4dfea251efed00e";
const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function director() {
  return {
    headline: "1 page changed as planned",
    summary: "Home changed as requested.",
    slides: [
      {
        route: "/",
        changeTitle: "Clearer signup button",
        caption: "Signup action is clearer.",
        source: "preview",
        focus: { x: 0, y: 0, w: 1, h: 0.35 },
        zoom: 1.1,
        annotations: [{ type: "pin", x: 0.5, y: 0.12, label: "New CTA" }],
      },
    ],
  };
}

test("authenticated evidence ingest creates an AI-directed run when director is injected", async () => {
  const reportRoot = await mkdtemp(join(tmpdir(), "gist-next-"));
  const evidence = {
    version: 1 as const,
    repository: "Mind-Lens/balanceflo-website",
    pullRequest: {
      number: 78,
      title: "Website change review",
      headSha,
    },
    pages: [
      {
        route: "/",
        title: "Home",
        status: "expected-change" as const,
        diffRatio: 0.04,
        previewImage: tinyPng,
        productionImage: tinyPng,
      },
    ],
  };

  const saved = await ingestEvidence({
    reportRoot,
    evidence,
    direct: async () => director(),
  });
  const run = await getLatestRun(reportRoot, "Mind-Lens/balanceflo-website", 78);

  assert.equal(saved.summary.state, "complete");
  assert.equal(run?.presentation?.explanationSource, "ai");
  assert.equal(run?.presentation?.slides[0]?.annotations[0]?.label, "New CTA");
  assert.ok(run?.presentation?.slides[0]?.focus.h);
});

test("building then evidence for the same SHA stays one run", async () => {
  const reportRoot = await mkdtemp(join(tmpdir(), "gist-next-"));
  process.env.REPORT_ROOT = reportRoot;
  process.env.GIST_INGEST_TOKEN = "secret-token";
  process.env.PUBLIC_BASE_URL = "https://gist.example";

  await handleBuildingIngest(
    new Request("https://gist.example/api/ingest/building", {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        identity: {
          repository: "Mind-Lens/balanceflo-website",
          pullRequest: 78,
          headSha,
        },
      }),
    }),
  );

  await ingestEvidence({
    reportRoot,
    evidence: {
      version: 1,
      repository: "Mind-Lens/balanceflo-website",
      pullRequest: { number: 78, title: "Review", headSha },
      pages: [
        {
          route: "/",
          title: "Home",
          status: "expected-change",
          diffRatio: 0.04,
          previewImage: tinyPng,
          productionImage: tinyPng,
        },
      ],
    },
    direct: async () => director(),
  });

  const runs = await listRuns(reportRoot, "Mind-Lens/balanceflo-website", 78);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].state, "complete");
});

test("ingest rejects bad credentials", async () => {
  process.env.GIST_INGEST_TOKEN = "secret-token";
  const unauthorized = await handleEvidenceIngest(
    new Request("https://gist.example/api/ingest/evidence", {
      method: "POST",
      body: "{}",
    }),
  );
  assert.equal(unauthorized.status, 401);
});
