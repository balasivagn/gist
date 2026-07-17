import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listPrs,
  listRuns,
  readEvidence,
  readSummary,
  runIdFromDate,
  writeConfig,
  writeRun,
  type GistConfig,
  type RunEvidence,
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
