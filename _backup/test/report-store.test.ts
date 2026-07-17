import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ingestBuilding,
  ingestEvidence,
  listPullRequests,
  listRuns,
  materializeEvidenceAssets,
} from "../lib/store/report-store.ts";

const headA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const headB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function evidenceFor(headSha: string, headlinePages = 1) {
  return {
    version: 1 as const,
    repository: "acme/site",
    pullRequest: { number: 12, title: "Home", headSha },
    pages: Array.from({ length: headlinePages }, (_, index) => ({
      route: index === 0 ? "/" : `/p-${index}`,
      title: index === 0 ? "Home" : `Page ${index}`,
      status: (index === 0 ? "fail" : "expected-change") as "fail" | "expected-change",
      diffRatio: 0.2,
      previewImage: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==`,
      productionImage: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==`,
    })),
  };
}

function directorFor(evidence: { pages: Array<{ route: string; title: string; status: string }> }) {
  return {
    headline: "1 page needs a look",
    summary: "Home changed outside the planned update.",
    slides: evidence.pages
      .filter((page) => page.status !== "pass")
      .slice(0, 2)
      .map((page) => ({
        route: page.route,
        changeTitle: `Change on ${page.title}`,
        caption: `${page.title} needs attention.`,
        source: "preview" as const,
        focus: { x: 0, y: 0, w: 1, h: 0.3 },
        zoom: 1.2,
        annotations: [{ type: "pin" as const, x: 0.5, y: 0.1, label: "Look here" }],
      })),
  };
}

test("different head SHAs for the same PR become separate runs with summaries", async () => {
  const reportRoot = await mkdtemp(join(tmpdir(), "gist-store-"));
  await ingestEvidence({
    reportRoot,
    evidence: evidenceFor(headA),
    direct: async (evidence) => directorFor(evidence),
  });
  await ingestEvidence({
    reportRoot,
    evidence: {
      ...evidenceFor(headB, 1),
      pages: [
        ...evidenceFor(headB, 1).pages,
        {
          route: "/about",
          title: "About",
          status: "pass",
          diffRatio: 0,
          previewImage: evidenceFor(headB, 1).pages[0].previewImage,
          productionImage: evidenceFor(headB, 1).pages[0].productionImage,
        },
        {
          route: "/team",
          title: "Team",
          status: "pass",
          diffRatio: 0,
          previewImage: evidenceFor(headB, 1).pages[0].previewImage,
          productionImage: evidenceFor(headB, 1).pages[0].productionImage,
        },
      ],
    },
    direct: async (evidence) => directorFor(evidence),
  });
  const runs = await listRuns(reportRoot, "acme/site", 12);
  const pullRequests = await listPullRequests(reportRoot);

  assert.equal(runs.length, 2);
  assert.equal(runs[0].headSha, headB);
  assert.equal(runs[1].headSha, headA);
  assert.match(runs[0].headline || "", /needs? a look|changed/);
  assert.equal(pullRequests[0]?.runCount, 2);
});

test("progressive updates for the same head SHA rewrite one run", async () => {
  const reportRoot = await mkdtemp(join(tmpdir(), "gist-store-"));
  const building = await ingestBuilding({
    reportRoot,
    identity: { repository: "acme/site", pullRequest: 12, headSha: headA },
  });
  const complete = await ingestEvidence({
    reportRoot,
    evidence: evidenceFor(headA),
    direct: async (evidence) => directorFor(evidence),
  });
  const ignored = await ingestBuilding({
    reportRoot,
    identity: { repository: "acme/site", pullRequest: 12, headSha: headA },
  });
  const runs = await listRuns(reportRoot, "acme/site", 12);

  assert.equal(building.runId, complete.runId);
  assert.equal(complete.runId, ignored.runId);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].state, "complete");
});

test("data-URL evidence images are written as run assets", async () => {
  const reportRoot = await mkdtemp(join(tmpdir(), "gist-store-"));
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const prepared = await materializeEvidenceAssets({
    reportRoot,
    runId: "run-home",
    evidence: {
      version: 1,
      repository: "acme/site",
      pullRequest: { number: 12, title: "Home", headSha: headA },
      pages: [
        {
          route: "/",
          title: "Home",
          status: "expected-change",
          diffRatio: 0.1,
          productionImage: `data:image/png;base64,${png.toString("base64")}`,
          previewImage: `data:image/png;base64,${png.toString("base64")}`,
        },
      ],
    },
  });
  const asset = await readFile(
    join(reportRoot, "pr/acme/site/12/runs/run-home/assets/0-production.png"),
  );
  assert.equal(asset.equals(png), true);
  assert.equal(prepared.pages[0].assetRefs?.production, "0-production.png");
  assert.equal(prepared.pages[0].productionImage, undefined);
});
