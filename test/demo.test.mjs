import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("the credential-free demo tells a phone reader what changed and what needs attention", async () => {
  const output = await mkdtemp(join(tmpdir(), "gist-demo-"));
  await execFileAsync(process.execPath, ["bin/gist.mjs", "build", "--config", "demo/gist.config.json", "--evidence", "demo/evidence.json", "--out", output]);
  const status = JSON.parse(await readFile(join(output, "status.json"), "utf8"));
  const html = await readFile(join(output, "index.html"), "utf8");

  assert.deepEqual(
    {
      changed: status.counts.changed,
      needsLook: status.counts.needsLook,
      responsive: html.includes('name="viewport"') && html.includes("width:min(100% - 2rem"),
      actionable: html.includes("Pricing") && html.includes("needs a look"),
      plainLanguage: !html.includes("expected-change") && !html.includes("infra-error")
    },
    { changed: 3, needsLook: 1, responsive: true, actionable: true, plainLanguage: true }
  );
});
