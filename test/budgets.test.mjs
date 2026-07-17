import assert from "node:assert/strict";
import test from "node:test";

import { enforceReportBudgets } from "../src/budgets.mjs";

test("configured page and artifact limits stop an unbounded report", () => {
  const evidence = { pages: [{ route: "/" }, { route: "/pricing" }] };

  assert.throws(
    () => enforceReportBudgets({ evidence, html: "small", limits: { maxPages: 1, maxArtifactBytes: 100 } }),
    /2 pages exceeds maxPages 1/
  );
  assert.throws(
    () => enforceReportBudgets({ evidence, html: "too large", limits: { maxPages: 5, maxArtifactBytes: 4 } }),
    /9 bytes exceeds maxArtifactBytes 4/
  );
  assert.throws(
    () => enforceReportBudgets({ evidence: { pages: [{ route: "/", captureHeightPx: 14000 }] }, html: "small", limits: { maxPages: 5, maxArtifactBytes: 100, maxCaptureHeightPx: 12000 } }),
    /capture height 14000px exceeds maxCaptureHeightPx 12000px/
  );
});
