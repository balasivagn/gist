import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("the credential-free demo presentation tells a reader what changed and what needs attention", async () => {
  const output = await mkdtemp(join(tmpdir(), "gist-demo-"));
  await execFileAsync(process.execPath, [
    "bin/gist.mjs",
    "build",
    "--config",
    "demo/gist.config.json",
    "--evidence",
    "demo/evidence.json",
    "--out",
    output,
  ], { env: { ...process.env, GIST_MOCK_SCENES: "1" } });
  const presentation = JSON.parse(await readFile(join(output, "presentation.json"), "utf8"));

  assert.deepEqual(
    {
      changed: presentation.counts.changed,
      needsLook: presentation.counts.needsLook,
      actionable:
        presentation.slides[0]?.title === "Pricing" ||
        presentation.orderedPages[0]?.title === "Pricing",
      plainLanguage: presentation.explanationSource === "ai",
      focused: Boolean(presentation.slides[0]?.focus?.h),
    },
    { changed: 3, needsLook: 1, actionable: true, plainLanguage: true, focused: true },
  );
});
