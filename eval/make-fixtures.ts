/**
 * Generates synthetic before/after/diff PNGs + labels for eval fixtures, so the
 * eval is self-contained (no binary assets checked in that we can't regenerate).
 *
 *   npx tsx eval/make-fixtures.ts
 *
 * These are crude block-rendered "pages" — enough for the model to read
 * headings and see structure, not pixel-perfect mockups. Real-site fixtures can
 * be added later by dropping base/head/diff PNGs + intent.json + expected.json
 * into eval/fixtures/<name>/.
 */
import { PNG } from "pngjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const W = 480;

type Band = { h: number; color: [number, number, number]; text?: string };

// A tiny 5x7 block font — enough for the model to read short labels.
const GLYPHS: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "11110", "10001", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "11110", "10000", "10000", "10000", "11111"],
  F: ["11111", "10000", "11110", "10000", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "11111", "10001", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
};

function drawText(png: PNG, x0: number, y0: number, text: string, scale = 3) {
  for (let ci = 0; ci < text.length; ci++) {
    const g = GLYPHS[text[ci]!.toUpperCase()] ?? GLYPHS[" "]!;
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (g[gy]![gx] !== "1") continue;
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const px = x0 + (ci * 6 + gx) * scale + sx;
            const py = y0 + gy * scale + sy;
            if (px < 0 || px >= png.width || py < 0 || py >= png.height) continue;
            const idx = (py * png.width + px) * 4;
            png.data[idx] = 20; png.data[idx + 1] = 20; png.data[idx + 2] = 20; png.data[idx + 3] = 255;
          }
      }
    }
  }
}

function render(bands: Band[]): PNG {
  const H = bands.reduce((s, b) => s + b.h, 0);
  const png = new PNG({ width: W, height: H });
  let y = 0;
  for (const b of bands) {
    for (let yy = y; yy < y + b.h; yy++)
      for (let xx = 0; xx < W; xx++) {
        const idx = (yy * W + xx) * 4;
        png.data[idx] = b.color[0]; png.data[idx + 1] = b.color[1]; png.data[idx + 2] = b.color[2]; png.data[idx + 3] = 255;
      }
    if (b.text) drawText(png, 24, y + Math.max(0, (b.h - 21) / 2), b.text);
    y += b.h;
  }
  return png;
}

/** Deterministic diff: red where base and head differ (padded to max height). */
function diff(base: PNG, head: PNG): PNG {
  const H = Math.max(base.height, head.height);
  const png = new PNG({ width: W, height: H });
  const at = (p: PNG, x: number, y: number) => (y < p.height ? (y * W + x) * 4 : -1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const bi = at(base, x, y), hi = at(head, x, y);
      const bp = bi >= 0 ? [base.data[bi], base.data[bi + 1], base.data[bi + 2]] : [255, 255, 255];
      const hp = hi >= 0 ? [head.data[hi], head.data[hi + 1], head.data[hi + 2]] : [255, 255, 255];
      const differ = Math.abs(bp[0]! - hp[0]!) + Math.abs(bp[1]! - hp[1]!) + Math.abs(bp[2]! - hp[2]!) > 30;
      const idx = (y * W + x) * 4;
      if (differ) { png.data[idx] = 255; png.data[idx + 1] = 40; png.data[idx + 2] = 40; png.data[idx + 3] = 255; }
      else { png.data[idx + 3] = 0; }
    }
  return png;
}

async function writeFixture(
  name: string,
  base: PNG,
  head: PNG,
  intent: object,
  expected: object,
) {
  const dir = path.join(DIR, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "base.png"), PNG.sync.write(base));
  await fs.writeFile(path.join(dir, "head.png"), PNG.sync.write(head));
  await fs.writeFile(path.join(dir, "diff.png"), PNG.sync.write(diff(base, head)));
  await fs.writeFile(path.join(dir, "intent.json"), JSON.stringify(intent, null, 2) + "\n");
  await fs.writeFile(path.join(dir, "expected.json"), JSON.stringify(expected, null, 2) + "\n");
  console.log(`wrote ${name}`);
}

const NAV: Band = { h: 60, color: [235, 235, 230], text: "NAV HOME" };
const FOOTER: Band = { h: 80, color: [40, 40, 44], text: "FOOTER" };

async function main() {
  // 1. hero-copy-edit — only the hero headline text changes.
  await writeFixture(
    "hero-copy-edit",
    render([NAV, { h: 200, color: [250, 248, 244], text: "APPROVE WITHOUT CODE" }, { h: 160, color: [255, 255, 255], text: "FEATURES" }, FOOTER]),
    render([NAV, { h: 200, color: [250, 248, 244], text: "APPROVE YOUR AGENT" }, { h: 160, color: [255, 255, 255], text: "FEATURES" }, FOOTER]),
    { title: "Rewrite the hero headline", body: "Update the hero copy to lead with the coding-agent angle.", comments: [] },
    {
      gate: "analyze",
      ledger: ["rewrite hero headline"],
      regions: [{ area: "hero", changeType: "text-edit", verdict: "intended" }],
      mustNotContain: ["article cards", "pricing", "carousel"],
    },
  );

  // 2. insert-section — a new PRICING section is inserted; everything below reflows.
  await writeFixture(
    "insert-section",
    render([NAV, { h: 200, color: [250, 248, 244], text: "HERO" }, { h: 160, color: [255, 255, 255], text: "FEATURES" }, FOOTER]),
    render([NAV, { h: 200, color: [250, 248, 244], text: "HERO" }, { h: 160, color: [255, 255, 255], text: "FEATURES" }, { h: 180, color: [244, 250, 246], text: "PRICING" }, FOOTER]),
    { title: "Add a pricing section", body: "Add a pricing section below the features list.", comments: [] },
    {
      gate: "analyze",
      ledger: ["add pricing section"],
      regions: [{ area: "pricing", changeType: "added", verdict: "intended" }],
      // The footer moved down but did NOT change — the model must not flag it.
      mustNotContain: ["footer changed", "footer removed", "article cards"],
    },
  );

  // 3. promised-but-absent — PR claims a pricing section, but nothing changed.
  const same = render([NAV, { h: 200, color: [250, 248, 244], text: "HERO" }, { h: 160, color: [255, 255, 255], text: "FEATURES" }, FOOTER]);
  await writeFixture(
    "promised-but-absent",
    same,
    render([NAV, { h: 200, color: [250, 248, 244], text: "HERO" }, { h: 160, color: [255, 255, 255], text: "FEATURES" }, FOOTER]),
    { title: "Add a pricing section", body: "This PR adds a pricing section to the home page.", comments: [] },
    {
      gate: "analyze",
      ledger: ["add pricing section"],
      missing: ["pricing"],
      mustNotContain: ["article cards"],
    },
  );
}

main();
