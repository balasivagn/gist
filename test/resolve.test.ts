import assert from "node:assert/strict";
import test from "node:test";
import { resolveTargets } from "../src/resolve.js";

// resolveTargets short-circuits network work when both base and head are
// overridden — fetchPrMeta falls back to local git and never needs a PR.

test("explicit base and head overrides skip preview resolution", async () => {
  const t = await resolveTargets({
    pr: 999999,
    baseUrlOverride: "https://prod.example.com",
    headUrlOverride: "https://preview.example.com",
  });
  assert.equal(t.baseUrl, "https://prod.example.com");
  assert.equal(t.headUrl, "https://preview.example.com");
  assert.equal(t.headSource, "override:--head");
  assert.equal(t.pr.number, 999999);
});

test("a missing base URL is a clear error", async () => {
  await assert.rejects(
    () => resolveTargets({ pr: 1, headUrlOverride: "https://p.example.com" }),
    /No base URL/,
  );
});
