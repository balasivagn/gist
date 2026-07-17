import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { publishReport } from "../src/publisher.mjs";

const identity = { repository: "acme/site", pullRequest: 12, headSha: "cafe123" };
const evidence = {
  version: 1,
  repository: identity.repository,
  pullRequest: { number: identity.pullRequest, title: "Update home", headSha: identity.headSha },
  pages: [{ route: "/", title: "Home", status: "expected-change", diffRatio: 0.1 }]
};

test("one report identity progresses from building to complete without regressing", async () => {
  const root = await mkdtemp(join(tmpdir(), "gist-publish-"));

  const building = await publishReport({ root, identity, state: "building" });
  const complete = await publishReport({ root, identity, state: "complete", evidence });
  const ignoredRegression = await publishReport({ root, identity, state: "building" });
  const status = JSON.parse(await readFile(join(complete.directory, "status.json"), "utf8"));
  const html = await readFile(join(complete.directory, "index.html"), "utf8");

  assert.deepEqual(
    {
      stableDirectory: building.directory === complete.directory && complete.directory === ignoredRegression.directory,
      state: status.state,
      revision: status.headSha,
      completeReport: html.includes("Walk through the change") && html.includes("Home")
    },
    { stableDirectory: true, state: "complete", revision: "cafe123", completeReport: true }
  );
});
