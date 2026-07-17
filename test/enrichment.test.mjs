import assert from "node:assert/strict";
import test from "node:test";

import { buildEnrichedReport } from "../src/enrichment.mjs";

const evidence = {
  version: 1,
  repository: "acme/site",
  pullRequest: { number: 8, title: "Improve pricing", headSha: "feed123" },
  pages: [
    { route: "/pricing", title: "Pricing", status: "fail", diffRatio: 0.3 },
    { route: "/", title: "Home", status: "expected-change", diffRatio: 0.1 }
  ]
};

test("valid AI enrichment grounds the report copy and slide order in known routes", async () => {
  const ai = {
    async explain() {
      return {
        headline: "Pricing needs a second look",
        summary: "The plans changed as requested, but the pricing columns also moved.",
        slides: [
          { route: "/pricing", caption: "Columns moved beyond the requested copy change." },
          { route: "/", caption: "The signup copy changed as planned." }
        ]
      };
    }
  };

  const report = await buildEnrichedReport(evidence, { ai });

  assert.deepEqual(
    {
      source: report.status.explanationSource,
      headline: report.html.includes("Pricing needs a second look"),
      groundedCaption: report.html.includes("Columns moved beyond the requested copy change."),
      pricingFirst: report.html.indexOf("Columns moved") < report.html.indexOf("signup copy")
    },
    { source: "ai", headline: true, groundedCaption: true, pricingFirst: true }
  );
});

test("missing, failed, or ungrounded AI enrichment falls back to deterministic copy", async () => {
  const boundaries = [
    undefined,
    { async explain() { throw new Error("provider unavailable"); } },
    { async explain() { return { headline: "Made up", summary: "Made up", slides: [{ route: "/unknown", caption: "Made up" }] }; } }
  ];

  const results = await Promise.all(boundaries.map((ai) => buildEnrichedReport(evidence, { ai })));

  assert.deepEqual(
    results.map((report) => ({
      source: report.status.explanationSource,
      useful: report.html.includes("This update touches the whole site") && report.html.includes("common site-wide update")
    })),
    boundaries.map(() => ({ source: "deterministic", useful: true }))
  );
});
