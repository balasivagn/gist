import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { importBalancefloRun } from "../src/balanceflo-import.mjs";

test("Balanceflo regression artifacts become portable Gist evidence", async () => {
  const runDirectory = await mkdtemp(join(tmpdir(), "gist-balanceflo-"));
  const imageDirectory = join(runDirectory, "regression", "mobile-375", "pricing-diff");
  await mkdir(imageDirectory, { recursive: true });
  await writeFile(join(imageDirectory, "production.png"), Buffer.from("before"));
  await writeFile(join(imageDirectory, "preview.png"), Buffer.from("after"));
  await writeFile(join(runDirectory, "regression", "summary.json"), JSON.stringify({
    run: { headSha: "abcdef123456" },
    pages: [
      { page: "/pricing/", slug: "pricing", profiles: {
        "desktop-1440": { status: "pass", diffPercent: 0.1 },
        "mobile-375": { status: "fail", diffPercent: 4.5 }
      } },
      { page: "/about/", slug: "about", profiles: {
        "desktop-1440": { status: "pass", diffPercent: 0 },
        "tablet-768": { status: "pass", diffPercent: 0 }
      } }
    ]
  }));
  await writeFile(join(runDirectory, "affected-routes.json"), JSON.stringify({ affected: [] }));
  await writeFile(join(runDirectory, "manifest.json"), JSON.stringify({
    verdict: "infra-failure",
    stages: [{ name: "regression", status: "fail" }]
  }));

  const evidence = await importBalancefloRun({ runDirectory, repository: "Mind-Lens/balanceflo-website", pullRequest: 78, title: "Analytics test" });

  assert.deepEqual(
    {
      repository: evidence.repository,
      status: evidence.pages[0].status,
      ratio: evidence.pages[0].diffRatio,
      portableImages: evidence.pages[0].productionImage.startsWith("data:image/png;base64,") && evidence.pages[0].previewImage.startsWith("data:image/png;base64,"),
      caption: evidence.pages[0].caption,
      missingViewport: evidence.pages[1].status,
      noMisleadingImages: evidence.pages[1].productionImage === undefined && evidence.pages[1].previewImage === undefined,
      verdict: evidence.run.verdict
    },
    { repository: "Mind-Lens/balanceflo-website", status: "fail", ratio: 0.045, portableImages: true, caption: "Pricing changed outside the pages expected from this pull request.", missingViewport: "infra-error", noMisleadingImages: true, verdict: "infra-failure" }
  );
});
