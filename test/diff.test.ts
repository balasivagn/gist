import assert from "node:assert/strict";
import test from "node:test";
import { PNG } from "pngjs";
import { diffScreenshots } from "../src/diff.js";

/** A solid-colour PNG buffer for deterministic diff fixtures. */
function solid(width: number, height: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

const WHITE: [number, number, number] = [255, 255, 255];
const RED: [number, number, number] = [255, 0, 0];

test("identical screenshots are a pass with zero diff", () => {
  const shot = solid(40, 40, WHITE);
  const r = diffScreenshots({
    baseBuffer: shot,
    headBuffer: solid(40, 40, WHITE),
    diffPercentThreshold: 0.5,
  });
  assert.equal(r.status, "pass");
  assert.equal(r.diffPercent, 0);
  assert.ok(r.diffPng, "a diff image is still produced");
});

test("a large unexpected change on an unaffected route fails", () => {
  const r = diffScreenshots({
    baseBuffer: solid(40, 40, WHITE),
    headBuffer: solid(40, 40, RED),
    diffPercentThreshold: 0.5,
    affected: false,
  });
  assert.equal(r.status, "fail");
  assert.ok(r.diffPercent > 50, `expected a big diff, got ${r.diffPercent}`);
});

test("the same large change on an affected route is an expected change", () => {
  const r = diffScreenshots({
    baseBuffer: solid(40, 40, WHITE),
    headBuffer: solid(40, 40, RED),
    diffPercentThreshold: 0.5,
    affected: true,
  });
  assert.equal(r.status, "expected-change");
});

test("a page present only after the change is new", () => {
  const r = diffScreenshots({
    baseBuffer: null,
    headBuffer: solid(20, 20, WHITE),
    diffPercentThreshold: 0.5,
  });
  assert.equal(r.status, "new");
  assert.equal(r.basePng, null);
  assert.ok(r.headPng);
});

test("a page gone after the change is removed", () => {
  const r = diffScreenshots({
    baseBuffer: solid(20, 20, WHITE),
    headBuffer: null,
    diffPercentThreshold: 0.5,
  });
  assert.equal(r.status, "removed");
  assert.ok(r.basePng);
  assert.equal(r.headPng, null);
});

test("mismatched dimensions are padded to a common canvas, not an error", () => {
  const r = diffScreenshots({
    baseBuffer: solid(40, 40, WHITE),
    headBuffer: solid(40, 80, WHITE),
    diffPercentThreshold: 0.5,
  });
  // The extra 40px-tall band on head compares against padded white on base;
  // both are white, so it still passes — but it must not throw.
  assert.equal(r.status, "pass");
  assert.equal(r.headDims, "40×80");
});

test("diffing with nothing on either side is a caller error", () => {
  assert.throws(() =>
    diffScreenshots({
      baseBuffer: null,
      headBuffer: null,
      diffPercentThreshold: 0.5,
    }),
  );
});

// --- deterministic gate / triage (docs/CHANGE-REVIEW.md §5-6) ---

/** A PNG with a horizontal band of `band` colour from y0..y1, else `bg`. */
function banded(
  width: number,
  height: number,
  bg: [number, number, number],
  band: [number, number, number],
  y0: number,
  y1: number,
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const c = y >= y0 && y < y1 ? band : bg;
      png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255;
    }
  return PNG.sync.write(png);
}

test("a visually-unchanged page gates to analyze without computing signals", () => {
  const shot = solid(40, 40, WHITE);
  const r = diffScreenshots({
    baseBuffer: shot,
    headBuffer: solid(40, 40, WHITE),
    diffPercentThreshold: 0.5,
  });
  assert.equal(r.status, "pass");
  assert.equal(r.gate.verdict, "analyze");
  assert.equal(r.gate.reason, "ok");
});

test("different capture widths gate to refuse (viewport-mismatch)", () => {
  const r = diffScreenshots({
    baseBuffer: solid(60, 40, WHITE),
    headBuffer: solid(40, 40, RED),
    diffPercentThreshold: 0.5,
  });
  assert.equal(r.gate.verdict, "refuse");
  assert.equal(r.gate.reason, "viewport-mismatch");
  assert.equal(r.gate.signals.widthMatch, false);
});

test("a localized band change gates to analyze, not redesign", () => {
  // Same width; change confined to one band with everything else identical.
  const base = banded(80, 600, WHITE, WHITE, 0, 0); // all white
  const head = banded(80, 600, WHITE, RED, 120, 220); // one red band
  const r = diffScreenshots({
    baseBuffer: base,
    headBuffer: head,
    diffPercentThreshold: 0.5,
  });
  assert.equal(r.gate.verdict, "analyze");
  assert.ok(r.gate.signals.spread < 0.6, "change is not spread across the page");
});

test("a whole-page change gates to triage:redesign", () => {
  const base = banded(80, 600, WHITE, WHITE, 0, 0); // all white
  const head = banded(80, 600, RED, RED, 0, 600); // entirely different
  const r = diffScreenshots({
    baseBuffer: base,
    headBuffer: head,
    diffPercentThreshold: 0.5,
  });
  assert.equal(r.gate.verdict, "triage:redesign");
  assert.equal(r.gate.reason, "pervasive-change");
  assert.ok(r.gate.signals.spread >= 0.6, "change is spread across the page");
});

test("a new page carries a triage:new-page gate", () => {
  const r = diffScreenshots({
    baseBuffer: null,
    headBuffer: solid(40, 40, WHITE),
    diffPercentThreshold: 0.5,
  });
  assert.equal(r.status, "new");
  assert.equal(r.gate.verdict, "triage:new-page");
});

test("a removed page carries a triage:removed-page gate", () => {
  const r = diffScreenshots({
    baseBuffer: solid(40, 40, WHITE),
    headBuffer: null,
    diffPercentThreshold: 0.5,
  });
  assert.equal(r.status, "removed");
  assert.equal(r.gate.verdict, "triage:removed-page");
});
