/**
 * The `.gist/` dotfolder store — the filesystem contract shared by all three
 * parts of the tool:
 *
 *   .gist/
 *     config.json                 written by `gist init`
 *     prs/
 *       pr-<n>/
 *         meta.json               PR title / branch / base
 *         runs/
 *           <runId>/
 *             evidence.json       DETERMINISTIC — written by `gist run`
 *             summary.md          AI walkthrough — written by the /gist skill
 *             regions.json        AI change regions + verdicts — /gist skill
 *             screenshots/
 *               <slug>.base.png  <slug>.head.png  <slug>.diff.png
 *
 * `gist run` writes screenshots + evidence.json (part 1, reproducible).
 * The /gist skill reads evidence.json and writes summary.md + regions.json
 * (part 3, AI).
 * `gist ui` reads the whole tree (part 2). The directory is gitignored.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { DiffGate, PageStatus } from "./diff.js";

export const GIST_DIR = ".gist";

export interface GistConfig {
  version: 1;
  /** Production / base URL captured as the "before" state. */
  productionUrl: string;
  /** Viewports to capture, e.g. [{ name: "desktop", width: 1440, height: 900 }]. */
  viewports: Array<{ name: string; width: number; height: number }>;
  /** Routes to capture (relative paths). Empty = just "/". */
  routes: string[];
  /** diffPercent above which a change is flagged. */
  diffPercentThreshold: number;
  /** pixelmatch per-pixel sensitivity (0..1). */
  pixelThreshold: number;
  /** Extra headers sent only to the captured origin (auth for gated previews). */
  extraHeaders?: Record<string, string>;
}

export interface PageEvidence {
  route: string;
  slug: string;
  title: string;
  viewport: string;
  status: PageStatus;
  diffPercent: number;
  diffPixels: number;
  totalPixels: number;
  baseDims: string;
  headDims: string;
  truncated: boolean;
  /**
   * Deterministic decision on whether the AI review pass should run for this
   * page, and in which mode (analyze / refuse / triage). See docs/CHANGE-REVIEW.md.
   */
  gate: DiffGate;
  /** Screenshot filenames relative to the run's screenshots/ dir. */
  screenshots: { base: string | null; head: string | null; diff: string | null };
}

export interface RunEvidence {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  repository: string;
  pullRequest: number;
  headSha: string;
  baseUrl: string;
  headUrl: string;
  headSource: string;
  /** Roll-up counts across pages. */
  totals: { pages: number; changed: number; unexpected: number; broken: number };
  pages: PageEvidence[];
}

export interface PrMetaFile {
  number: number;
  title: string;
  body: string;
  comments: string[];
  headRefName: string;
  baseRefName: string;
  repository: string;
  updatedAt: string;
}

const gistRoot = (cwd: string) => path.join(cwd, GIST_DIR);
const prDir = (cwd: string, pr: number) =>
  path.join(gistRoot(cwd), "prs", `pr-${pr}`);
const runDir = (cwd: string, pr: number, runId: string) =>
  path.join(prDir(cwd, pr), "runs", runId);

export function screenshotsDir(cwd: string, pr: number, runId: string): string {
  return path.join(runDir(cwd, pr, runId), "screenshots");
}

/** A filesystem-safe, chronologically sortable run id from an ISO timestamp. */
export function runIdFromDate(iso: string): string {
  return iso.replace(/[:.]/g, "-").replace("Z", "");
}

export async function readConfig(cwd: string): Promise<GistConfig> {
  const file = path.join(gistRoot(cwd), "config.json");
  return JSON.parse(await fs.readFile(file, "utf8")) as GistConfig;
}

export async function writeConfig(
  cwd: string,
  config: GistConfig,
): Promise<void> {
  await fs.mkdir(gistRoot(cwd), { recursive: true });
  await fs.writeFile(
    path.join(gistRoot(cwd), "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

export async function configExists(cwd: string): Promise<boolean> {
  try {
    await fs.access(path.join(gistRoot(cwd), "config.json"));
    return true;
  } catch {
    return false;
  }
}

export async function writePrMeta(
  cwd: string,
  meta: PrMetaFile,
): Promise<void> {
  await fs.mkdir(prDir(cwd, meta.number), { recursive: true });
  await fs.writeFile(
    path.join(prDir(cwd, meta.number), "meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8",
  );
}

/** Persist a run's screenshots and evidence.json. */
export async function writeRun(
  cwd: string,
  evidence: RunEvidence,
  shots: Array<{ name: string; buffer: Buffer }>,
): Promise<string> {
  const dir = runDir(cwd, evidence.pullRequest, evidence.runId);
  const shotsDir = screenshotsDir(cwd, evidence.pullRequest, evidence.runId);
  await fs.mkdir(shotsDir, { recursive: true });
  for (const shot of shots) {
    await fs.writeFile(path.join(shotsDir, shot.name), shot.buffer);
  }
  await fs.writeFile(
    path.join(dir, "evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  return dir;
}

/** List PR numbers that have a directory under .gist/prs. */
export async function listPrs(cwd: string): Promise<number[]> {
  const dir = path.join(gistRoot(cwd), "prs");
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  return entries
    .map((name) => /^pr-(\d+)$/.exec(name)?.[1])
    .filter((v): v is string => Boolean(v))
    .map(Number)
    .sort((a, b) => b - a);
}

/** Run ids for a PR, newest first. */
export async function listRuns(cwd: string, pr: number): Promise<string[]> {
  const dir = path.join(prDir(cwd, pr), "runs");
  try {
    const entries = await fs.readdir(dir);
    return entries.sort().reverse();
  } catch {
    return [];
  }
}

export async function readEvidence(
  cwd: string,
  pr: number,
  runId: string,
): Promise<RunEvidence> {
  const file = path.join(runDir(cwd, pr, runId), "evidence.json");
  return JSON.parse(await fs.readFile(file, "utf8")) as RunEvidence;
}

export async function readSummary(
  cwd: string,
  pr: number,
  runId: string,
): Promise<string | null> {
  const file = path.join(runDir(cwd, pr, runId), "summary.md");
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * A single real content change on a page, as decided by the /gist skill's
 * review SOP (docs/CHANGE-REVIEW.md §7). Movement/reflow is never a region.
 *
 * Every region MUST carry a citation — specific content the model can point to
 * in both base and head (or "present in head, absent in base" for inserts).
 * This is the "no citation, no region" rule (§9): a region without evidence is
 * not allowed to exist, which is what prevents fabricated regions.
 */
export interface ChangeRegion {
  slug: string;
  label: string;
  y: number;
  height: number;
  /** What kind of change this is. "moved" is never emitted as a region. */
  changeType: "text-edit" | "added" | "removed" | "restyle";
  /**
   * intended            — matches a declared PR claim
   * changed-unmentioned — a real change the PR never mentioned (worth a look)
   * missing             — reserved; represented in `missing`, not here
   */
  verdict: "intended" | "changed-unmentioned";
  /** The evidence grounding this region — required, never empty. */
  citation: { base: string; head: string };
  note: string;
}

export interface RunRegions {
  schemaVersion: 2;
  /**
   * Per-page gate outcome the skill acted on, mirrored from evidence for the
   * UI. When a page is refused or triaged, `regions` for it is empty and the
   * reason explains why (in owner language, authored by the skill).
   */
  gates?: Array<{ slug: string; verdict: string; message: string }>;
  regions: ChangeRegion[];
  /** Declared PR claims with no matching region — the "missing" case (§7). */
  missing?: Array<{ claim: string; note: string }>;
}

export async function writeRegions(
  cwd: string,
  pr: number,
  runId: string,
  regions: RunRegions,
): Promise<void> {
  const dir = runDir(cwd, pr, runId);
  await fs.writeFile(
    path.join(dir, "regions.json"),
    `${JSON.stringify(regions, null, 2)}\n`,
    "utf8",
  );
}

export async function readRegions(
  cwd: string,
  pr: number,
  runId: string,
): Promise<RunRegions | null> {
  try {
    const raw = await fs.readFile(
      path.join(runDir(cwd, pr, runId), "regions.json"),
      "utf8",
    );
    return JSON.parse(raw) as RunRegions;
  } catch {
    return null;
  }
}

export async function readPrMeta(
  cwd: string,
  pr: number,
): Promise<PrMetaFile | null> {
  try {
    const raw = await fs.readFile(
      path.join(prDir(cwd, pr), "meta.json"),
      "utf8",
    );
    return JSON.parse(raw) as PrMetaFile;
  } catch {
    return null;
  }
}
