import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listPrs,
  listRuns,
  readEvidence,
  readPrMeta,
  readRegions,
  readSummary,
  runIdFromDate,
  writeConfig,
  writePrMeta,
  writeRegions,
  writeRun,
  type GistConfig,
  type PrMetaFile,
  type RunEvidence,
  type RunRegions,
} from "../src/store.js";

const CONFIG: GistConfig = {
  version: 1,
  productionUrl: "https://example.com",
  viewports: [{ name: "desktop", width: 1440, height: 900 }],
  routes: ["/"],
  diffPercentThreshold: 0.5,
  pixelThreshold: 0.1,
};

function evidenceFor(pr: number, runId: string): RunEvidence {
  return {
    schemaVersion: 1,
    runId,
    createdAt: "2026-07-17T12:00:00.000Z",
    repository: "acme/site",
    pullRequest: pr,
    headSha: "abc123",
    baseUrl: "https://example.com",
    headUrl: "https://preview.example.com",
    headSource: "override:--head",
    totals: { pages: 1, changed: 0, unexpected: 0, broken: 0 },
    pages: [],
  };
}

test("runIdFromDate is filesystem-safe and sortable", () => {
  const id = runIdFromDate("2026-07-17T12:00:00.000Z");
  assert.match(id, /^\d{4}-\d{2}-\d{2}T[\d-]+$/);
  assert.ok(!id.includes(":"));
});

test("a written run round-trips through the store", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gist-store-"));
  try {
    await writeConfig(cwd, CONFIG);
    const runId = runIdFromDate("2026-07-17T12:00:00.000Z");
    await writeRun(cwd, evidenceFor(7, runId), [
      { name: "home.desktop.base.png", buffer: Buffer.from([1, 2, 3]) },
    ]);

    assert.deepEqual(await listPrs(cwd), [7]);
    assert.deepEqual(await listRuns(cwd, 7), [runId]);
    const back = await readEvidence(cwd, 7, runId);
    assert.equal(back.pullRequest, 7);
    assert.equal(await readSummary(cwd, 7, runId), null);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("writePrMeta persists body and comments and reads back correctly", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gist-store-"));
  try {
    const meta: PrMetaFile = {
      number: 5,
      title: "fix: hero copy",
      body: "Rewrites the hero headline and removes the duplicate CTA.",
      comments: ["LGTM", "Can you also update the og:title?"],
      headRefName: "fix/hero-copy",
      baseRefName: "main",
      repository: "acme/site",
      updatedAt: "2026-07-19T10:00:00.000Z",
    };
    await writePrMeta(cwd, meta);
    const back = await readPrMeta(cwd, 5);
    assert.equal(back?.title, "fix: hero copy");
    assert.equal(back?.body, "Rewrites the hero headline and removes the duplicate CTA.");
    assert.deepEqual(back?.comments, ["LGTM", "Can you also update the og:title?"]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("writeRegions and readRegions round-trip correctly", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gist-store-"));
  try {
    const runId = runIdFromDate("2026-07-19T10:00:00.000Z");
    await writeRun(cwd, evidenceFor(3, runId), []);
    const regions: RunRegions = {
      schemaVersion: 2,
      regions: [
        {
          slug: "home.desktop",
          label: "Hero headline",
          y: 200,
          height: 300,
          changeType: "text-edit",
          verdict: "intended",
          citation: { base: "Old headline", head: "New headline" },
          note: "Matches PR claim to rewrite hero copy",
        },
      ],
      missing: [],
    };
    await writeRegions(cwd, 3, runId, regions);
    const back = await readRegions(cwd, 3, runId);
    assert.equal(back?.regions.length, 1);
    assert.equal(back?.regions[0]?.label, "Hero headline");
    assert.equal(back?.regions[0]?.verdict, "intended");
    assert.equal(back?.regions[0]?.citation.head, "New headline");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("readRegions returns null when no regions.json exists", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gist-store-"));
  try {
    const runId = runIdFromDate("2026-07-19T10:00:00.000Z");
    await writeRun(cwd, evidenceFor(3, runId), []);
    const back = await readRegions(cwd, 3, runId);
    assert.equal(back, null);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("PRs list newest-first", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "gist-store-"));
  try {
    await writeRun(cwd, evidenceFor(3, "r1"), []);
    await writeRun(cwd, evidenceFor(21, "r1"), []);
    await writeRun(cwd, evidenceFor(9, "r1"), []);
    assert.deepEqual(await listPrs(cwd), [21, 9, 3]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
