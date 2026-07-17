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
