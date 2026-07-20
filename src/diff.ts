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

/**
 * Deterministic classification of a page comparison, used by `gist run` to
 * decide whether the AI review pass should even run — and if so, in which mode.
 * See docs/CHANGE-REVIEW.md §5–6.
 *
 *   - "analyze"        localized change; run the section SOP
 *   - "refuse"         cannot compare reliably; show a "can't compare" card
 *   - "triage:redesign" pervasive change; review holistically, not per-region
 *
 * `reason` is a machine tag; the human-facing message is built in the UI.
 */
export type GateVerdict =
  | "analyze"
  | "refuse"
  | "triage:redesign"
  | "triage:new-page"
  | "triage:removed-page";
export type GateReason =
  | "ok"
  | "viewport-mismatch"
  | "baseline-mismatch"
  | "capture-error"
  | "pervasive-change"
  | "page-added"
  | "page-removed";

export interface DiffGate {
  verdict: GateVerdict;
  reason: GateReason;
  /**
   * Signals the gate is derived from — surfaced for transparency and eval.
   * `shiftPx` is the detected dominant vertical offset (reflow) between base
   * and head; `spread` is the fraction of page-height bands that contain
   * changed pixels (0..1); `adjustedPercent` is diffPercent with the reflowed
   * region discounted.
   */
  signals: {
    diffPercent: number;
    adjustedPercent: number;
    shiftPx: number;
    spread: number;
    widthMatch: boolean;
  };
}

export interface DiffResult {
  status: PageStatus;
  diffPixels: number;
  totalPixels: number;
  diffPercent: number;
  baseDims: string;
  headDims: string;
  truncated: boolean;
  /** Deterministic gate/triage verdict for the AI review pass. */
  gate: DiffGate;
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

/** Number of changed pixels per horizontal row of the diff image. */
function rowChangeCounts(diff: PNG): number[] {
  const { width, height, data } = diff;
  const counts = new Array<number>(height).fill(0);
  for (let y = 0; y < height; y++) {
    let n = 0;
    for (let x = 0; x < width; x++) {
      // pixelmatch paints CHANGED pixels a saturated red (~255,0,0) and leaves
      // unchanged pixels as the dimmed original (which for white content still
      // has high red). So "red channel > 0" is not enough — detect the red
      // signature specifically: high red AND low green AND low blue.
      const i = (y * width + x) * 4;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      if (r > 150 && g < 120 && b < 120) n++;
    }
    counts[y] = n;
  }
  return counts;
}

/**
 * Estimate the dominant vertical shift (reflow) between base and head by
 * correlating their per-row brightness profiles. A page that inserts a section
 * near the top shifts everything below down by roughly the section's height;
 * that shift shows up as the offset that best aligns the two row profiles.
 *
 * Returns 0 when no consistent shift is found (a genuine in-place change).
 * Coarse by design — it only needs to separate "mostly reflow" from "mostly
 * real change", never to be pixel-exact.
 */
function estimateVerticalShift(base: PNG, head: PNG): number {
  const profile = (png: PNG): number[] => {
    const p = new Array<number>(png.height).fill(0);
    for (let y = 0; y < png.height; y++) {
      let sum = 0;
      // sample every 8th column — brightness profile, cheap
      for (let x = 0; x < png.width; x += 8) {
        const i = (y * png.width + x) * 4;
        sum += png.data[i]! + png.data[i + 1]! + png.data[i + 2]!;
      }
      p[y] = sum;
    }
    return p;
  };
  const b = profile(base);
  const h = profile(head);
  const maxShift = Math.min(
    Math.floor(Math.min(base.height, head.height) * 0.6),
    2000,
  );
  const step = 4; // coarse search; reflow bands are large
  let bestShift = 0;
  let bestScore = Infinity;
  for (let shift = 0; shift <= maxShift; shift += step) {
    let score = 0;
    let count = 0;
    for (let y = shift; y < Math.min(b.length, h.length); y += 8) {
      const diff = h[y]! - b[y - shift]!;
      score += diff * diff;
      count++;
    }
    if (count === 0) continue;
    const norm = score / count;
    if (norm < bestScore) {
      bestScore = norm;
      bestShift = shift;
    }
  }
  return bestShift;
}

/**
 * Derive the deterministic gate verdict from the diff. Implements the
 * precondition + triage tiers of docs/CHANGE-REVIEW.md:
 *
 *   - width mismatch                 -> refuse (viewport-mismatch)
 *   - near-total diff + dim mismatch -> refuse (baseline-mismatch)
 *   - pervasive change (spread wide) -> triage:redesign
 *   - otherwise                      -> analyze
 *
 * The redesign trigger is reflow-adjusted: a single inserted section inflates
 * raw diffPercent but concentrates changes in one band with a clean shifted
 * region below, so it stays "analyze". Only changes spread across the page
 * height in multiple bands classify as redesign.
 */
function decideGate(base: PNG, head: PNG, diff: PNG, diffPercent: number): DiffGate {
  const widthMatch = base.width === head.width;
  const counts = rowChangeCounts(diff);
  const height = counts.length || 1;

  // Bucket the page into 20 horizontal bands; a band "changed" if >2% of its
  // rows carry meaningful change. spread = fraction of bands that changed.
  const BANDS = 20;
  const bandSize = Math.max(1, Math.floor(height / BANDS));
  let changedBands = 0;
  for (let bnd = 0; bnd < BANDS; bnd++) {
    const y0 = bnd * bandSize;
    const y1 = Math.min(height, y0 + bandSize);
    let changedRows = 0;
    for (let y = y0; y < y1; y++) {
      if ((counts[y] ?? 0) > head.width * 0.02) changedRows++;
    }
    if (changedRows > (y1 - y0) * 0.2) changedBands++;
  }
  const spread = changedBands / BANDS;

  const shiftPx = widthMatch ? estimateVerticalShift(base, head) : 0;
  // Reflow-adjusted magnitude: discount the diff attributable to a pure shift.
  // A large shift with otherwise-modest spread => mostly reflow => discount.
  const shiftFraction = shiftPx / height;
  const adjustedPercent =
    shiftPx > 0 ? Math.max(0, diffPercent * (1 - shiftFraction * 0.8)) : diffPercent;

  const signals = { diffPercent, adjustedPercent, shiftPx, spread, widthMatch };

  if (!widthMatch) {
    return { verdict: "refuse", reason: "viewport-mismatch", signals };
  }
  // Wrong baseline: nearly everything differs AND heights are very different
  // with change spread across the whole page (not a clean insert).
  const heightRatio =
    Math.min(base.height, head.height) / Math.max(base.height, head.height);
  if (diffPercent > 75 && heightRatio < 0.6 && spread > 0.8) {
    return { verdict: "refuse", reason: "baseline-mismatch", signals };
  }
  // Redesign: change spread across most of the page, not concentrated + shifted.
  if (spread >= 0.6 && adjustedPercent > 25) {
    return { verdict: "triage:redesign", reason: "pervasive-change", signals };
  }
  return { verdict: "analyze", reason: "ok", signals };
}

/** Gate for the degenerate one-sided cases (new / removed / infra). */
function trivialGate(
  verdict: GateVerdict,
  reason: GateReason,
  diffPercent = 0,
): DiffGate {
  return {
    verdict,
    reason,
    signals: {
      diffPercent,
      adjustedPercent: diffPercent,
      shiftPx: 0,
      spread: 0,
      widthMatch: false,
    },
  };
}

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
      gate: trivialGate("triage:new-page", "page-added"),
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
      gate: trivialGate("triage:removed-page", "page-removed"),
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

  // A visually-unchanged page never needs the AI pass; skip gate computation.
  const gate: DiffGate =
    status === "pass"
      ? { verdict: "analyze", reason: "ok", signals: {
          diffPercent, adjustedPercent: diffPercent, shiftPx: 0,
          spread: 0, widthMatch: basePng.width === headPng.width } }
      : decideGate(basePng, headPng, diffPng, diffPercent);

  return {
    status,
    diffPixels,
    totalPixels,
    diffPercent,
    baseDims: dims(basePng),
    headDims: dims(headPng),
    truncated,
    gate,
    basePng: baseBuffer,
    headPng: headBuffer,
    diffPng: PNG.sync.write(diffPng),
  };
}
