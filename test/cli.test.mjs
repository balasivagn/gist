import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("a repository can install the small workflow and build a report without an AI key", async () => {
  const root = await mkdtemp(join(tmpdir(), "gist-cli-"));
  const repository = join(root, "consumer");
  const evidencePath = join(root, "evidence.json");
  const output = join(root, "report");
  const evidence = {
    version: 1,
    repository: "acme/site",
    pullRequest: { number: 4, title: "Add signup", headSha: "abc1234" },
    pages: [
      { route: "/", title: "Home", status: "expected-change", diffRatio: 0.1 },
      { route: "/about", title: "About", status: "pass", diffRatio: 0 }
    ]
  };
  await writeFile(evidencePath, JSON.stringify(evidence), "utf8");

  await execFileAsync(process.execPath, ["bin/gist.mjs", "init", "--out", repository]);
  await execFileAsync(process.execPath, ["bin/gist.mjs", "build", "--config", join(repository, "gist.config.json"), "--evidence", evidencePath, "--out", output], {
    env: { PATH: process.env.PATH }
  });

  const workflow = await readFile(join(repository, ".github/workflows/gist.yml"), "utf8");
  const config = await readFile(join(repository, "gist.config.json"), "utf8");
  const status = JSON.parse(await readFile(join(output, "status.json"), "utf8"));
  const html = await readFile(join(output, "index.html"), "utf8");
  assert.deepEqual(
    {
      pullRequestTrigger: workflow.includes("pull_request:"),
      externalEngine: workflow.includes("npx @gist/review"),
      repoAgnostic: !config.toLowerCase().includes("balanceflo"),
      deterministic: status.explanationSource,
      report: html.includes("Home")
    },
    { pullRequestTrigger: true, externalEngine: true, repoAgnostic: true, deterministic: "deterministic", report: true }
  );
});
