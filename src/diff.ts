/**
 * Deterministic pixel diff + page-status decision. Ported from the balanceflo
 * QA engine (qa/visual-regression/compare.spec.ts diff block + diff-utils.ts),
 * stripped of the base64 HTML report — the local `gist ui` viewer renders diffs
 * instead. Given two screenshots this is fully reproducible: same inputs and
 * threshold always yield the same status and diffPercent.
 */
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export type PageStatus =
  | "pass"
  | "fail"
  | "expected-change"
  | "new"
  | "removed"
  | "infra-error";

export interface DiffInput {
  /** Baseline (production / base branch) screenshot, or null if the page 404s there. */
  baseBuffer: Buffer | null;
  /** Head (preview / PR branch) screenshot, or null if the page 404s there. */
  headBuffer: Buffer | null;
  /** True if either capture hit the height/scroll cap. */
  truncated?: boolean;
  /** True when this route is one the PR is expected to change. */
  affected?: boolean;
  /** diffPercent above which a change is flagged. */
  diffPercentThreshold: number;
  /** pixelmatch per-pixel colour-distance sensitivity (0..1). */
  pixelThreshold?: number;
}

export interface DiffResult {
  status: PageStatus;
  diffPixels: number;
  totalPixels: number;
  diffPercent: number;
  baseDims: string;
  headDims: string;
  truncated: boolean;
  /** PNG buffers to persist; any may be null (e.g. no diff for new/removed). */
  basePng: Buffer | null;
  headPng: Buffer | null;
  diffPng: Buffer | null;
}

/** Pad/crop src onto a white canvas of the target size (top-left anchored). */
function resizeToMatch(src: PNG, targetWidth: number, targetHeight: number): PNG {
  const out = new PNG({ width: targetWidth, height: targetHeight });
  out.data.fill(255);
  const copyW = Math.min(src.width, targetWidth);
  const copyH = Math.min(src.height, targetHeight);
  for (let y = 0; y < copyH; y++) {
    for (let x = 0; x < copyW; x++) {
      const s = (y * src.width + x) * 4;
      const d = (y * targetWidth + x) * 4;
      out.data[d] = src.data[s]!;
      out.data[d + 1] = src.data[s + 1]!;
      out.data[d + 2] = src.data[s + 2]!;
      out.data[d + 3] = src.data[s + 3]!;
    }
  }
  return out;
}

const dims = (png: PNG | null): string =>
  png ? `${png.width}×${png.height}` : "—";

/**
 * Compare a baseline and a head screenshot for one route, deciding a
 * PageStatus. Mirrors the balanceflo status ladder:
 *   - both missing      -> caller error (never a valid diff)
 *   - base missing      -> "new"      (added by this PR)
 *   - head missing      -> "removed"  (gone on the PR)
 *   - within threshold  -> "pass"
 *   - over, affected    -> "expected-change"
 *   - over, unaffected  -> "fail"
 */
export function diffScreenshots(input: DiffInput): DiffResult {
  const truncated = Boolean(input.truncated);
  const { baseBuffer, headBuffer } = input;

  if (!baseBuffer && !headBuffer) {
    throw new Error("diffScreenshots called with no screenshots on either side");
  }

  if (!baseBuffer) {
    const headPngObj = PNG.sync.read(headBuffer!);
    return {
      status: "new",
      diffPixels: 0,
      totalPixels: 0,
      diffPercent: 0,
      baseDims: "—",
      headDims: dims(headPngObj),
      truncated,
      basePng: null,
      headPng: headBuffer,
      diffPng: null,
    };
  }

  if (!headBuffer) {
    const basePngObj = PNG.sync.read(baseBuffer);
    return {
      status: "removed",
      diffPixels: 0,
      totalPixels: 0,
      diffPercent: 0,
      baseDims: dims(basePngObj),
      headDims: "—",
      truncated,
      basePng: baseBuffer,
      headPng: null,
      diffPng: null,
    };
  }

  const basePng = PNG.sync.read(baseBuffer);
  const headPng = PNG.sync.read(headBuffer);
  const width = Math.max(basePng.width, headPng.width);
  const height = Math.max(basePng.height, headPng.height);
  const baseResized = resizeToMatch(basePng, width, height);
  const headResized = resizeToMatch(headPng, width, height);
  const diffPng = new PNG({ width, height });
  const diffPixels = pixelmatch(
    baseResized.data,
    headResized.data,
    diffPng.data,
    width,
    height,
    { threshold: input.pixelThreshold ?? 0.1, includeAA: false },
  );
  const totalPixels = width * height;
  const diffPercent = totalPixels === 0 ? 0 : (diffPixels / totalPixels) * 100;

  let status: PageStatus;
  if (diffPercent <= input.diffPercentThreshold) {
    status = "pass";
  } else if (input.affected) {
    status = "expected-change";
  } else {
    status = "fail";
  }

  return {
    status,
    diffPixels,
    totalPixels,
    diffPercent,
    baseDims: dims(basePng),
    headDims: dims(headPng),
    truncated,
    basePng: baseBuffer,
    headPng: headBuffer,
    diffPng: PNG.sync.write(diffPng),
  };
}
