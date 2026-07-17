/**
 * `gist run --pr <n>` — the deterministic capture pass (part 1). Resolves base
 * (production) and head (preview) URLs from the PR, captures every route across
 * every viewport on both sides, diffs them pixel-for-pixel, and writes
 * screenshots + evidence.json into .gist/. Writes no summary — that is the
 * /gist skill's job (part 3).
 */
import { chromium, type Browser } from "playwright";
import { captureWithRetry, InfraCaptureError } from "./capture.js";
import { diffScreenshots, type PageStatus } from "./diff.js";
import { preflight } from "./preflight.js";
import { resolveTargets } from "./resolve.js";
import {
  readConfig,
  runIdFromDate,
  writePrMeta,
  writeRun,
  type GistConfig,
  type PageEvidence,
  type RunEvidence,
} from "./store.js";

function joinUrl(base: string, route: string): string {
  const b = base.replace(/\/+$/, "");
  const r = route.startsWith("/") ? route : `/${route}`;
  return route === "/" ? `${b}/` : `${b}${r}`;
}

function slugForRoute(route: string): string {
  const cleaned = route.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");
  return cleaned === "" ? "home" : cleaned;
}

function titleForRoute(route: string): string {
  if (route === "/") return "Home";
  const seg = route.split("/").filter(Boolean).at(-1) ?? "Page";
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Count a page toward the roll-up buckets shown in the UI. */
function bucket(status: PageStatus): {
  changed: number;
  unexpected: number;
  broken: number;
} {
  return {
    changed: status === "expected-change" ? 1 : 0,
    unexpected: status === "fail" ? 1 : 0,
    broken: status === "removed" || status === "infra-error" ? 1 : 0,
  };
}

export interface RunOptions {
  cwd: string;
  pr: number;
  baseUrlOverride?: string;
  headUrlOverride?: string;
  /** Routes this PR is expected to change (become "expected-change" not "fail"). */
  affectedRoutes?: string[];
  log?: (m: string) => void;
}

export async function runCapture(opts: RunOptions): Promise<RunEvidence> {
  const log = opts.log ?? console.log;

  const pf = await preflight({
    cwd: opts.cwd,
    headOverridden: Boolean(opts.headUrlOverride),
  });
  for (const w of pf.warnings) log(`⚠ ${w}`);
  if (!pf.ok) {
    const bullets = pf.errors.map((e) => `  • ${e}`).join("\n");
    throw new Error(`Can't run yet:\n${bullets}`);
  }

  const config: GistConfig = await readConfig(opts.cwd);

  const targets = await resolveTargets({
    pr: opts.pr,
    productionUrl: config.productionUrl,
    baseUrlOverride: opts.baseUrlOverride,
    headUrlOverride: opts.headUrlOverride,
  });
  log(`PR #${targets.pr.number}: ${targets.pr.title}`);
  log(`  base: ${targets.baseUrl}`);
  log(`  head: ${targets.headUrl}  (${targets.headSource})`);

  const affected = new Set(opts.affectedRoutes ?? []);
  const routes = config.routes.length > 0 ? config.routes : ["/"];
  const createdAt = new Date().toISOString();
  const runId = runIdFromDate(createdAt);

  const browser: Browser = await chromium.launch();
  const pages: PageEvidence[] = [];
  const shots: Array<{ name: string; buffer: Buffer }> = [];

  try {
    for (const viewport of config.viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      for (const route of routes) {
        const slug = `${slugForRoute(route)}.${viewport.name}`;
        const baseUrl = joinUrl(targets.baseUrl, route);
        const headUrl = joinUrl(targets.headUrl, route);
        log(`  capture ${route} @ ${viewport.name}`);

        // Capture base and head SEQUENTIALLY, not concurrently. Two pages
        // loading the same animated route at the same instant settle at
        // slightly different animation/scroll states, which shows up as a
        // phantom diff (a false "unexpected change") on identical content.
        // Determinism is the whole point, so we trade a little wall-clock for
        // it — a local run only captures a handful of routes.
        const baseOutcome = await Promise.allSettled([
          captureWithRetry(context, baseUrl, { extraHeaders: config.extraHeaders }),
        ]).then((r) => r[0]!);
        const headOutcome = await Promise.allSettled([
          captureWithRetry(context, headUrl, { extraHeaders: config.extraHeaders }),
        ]).then((r) => r[0]!);

        const infra = [baseOutcome, headOutcome].find(
          (o) => o.status === "rejected" && o.reason instanceof InfraCaptureError,
        );
        const unexpected = [baseOutcome, headOutcome].find(
          (o) =>
            o.status === "rejected" &&
            !(o.reason instanceof InfraCaptureError),
        );
        if (unexpected && unexpected.status === "rejected") {
          throw unexpected.reason;
        }

        if (infra) {
          pages.push({
            route,
            slug,
            title: titleForRoute(route),
            viewport: viewport.name,
            status: "infra-error",
            diffPercent: 0,
            diffPixels: 0,
            totalPixels: 0,
            baseDims: "—",
            headDims: "—",
            truncated: false,
            screenshots: { base: null, head: null, diff: null },
          });
          continue;
        }

        const base = baseOutcome.status === "fulfilled" ? baseOutcome.value : null;
        const head = headOutcome.status === "fulfilled" ? headOutcome.value : null;

        const result = diffScreenshots({
          baseBuffer: base?.buffer ?? null,
          headBuffer: head?.buffer ?? null,
          truncated: Boolean(base?.truncated || head?.truncated),
          affected: affected.has(route),
          diffPercentThreshold: config.diffPercentThreshold,
          pixelThreshold: config.pixelThreshold,
        });

        const names = {
          base: result.basePng ? `${slug}.base.png` : null,
          head: result.headPng ? `${slug}.head.png` : null,
          diff: result.diffPng ? `${slug}.diff.png` : null,
        };
        if (result.basePng && names.base)
          shots.push({ name: names.base, buffer: result.basePng });
        if (result.headPng && names.head)
          shots.push({ name: names.head, buffer: result.headPng });
        if (result.diffPng && names.diff)
          shots.push({ name: names.diff, buffer: result.diffPng });

        pages.push({
          route,
          slug,
          title: titleForRoute(route),
          viewport: viewport.name,
          status: result.status,
          diffPercent: Number(result.diffPercent.toFixed(3)),
          diffPixels: result.diffPixels,
          totalPixels: result.totalPixels,
          baseDims: result.baseDims,
          headDims: result.headDims,
          truncated: result.truncated,
          screenshots: names,
        });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const totals = pages.reduce(
    (acc, p) => {
      const b = bucket(p.status);
      return {
        pages: acc.pages + 1,
        changed: acc.changed + b.changed,
        unexpected: acc.unexpected + b.unexpected,
        broken: acc.broken + b.broken,
      };
    },
    { pages: 0, changed: 0, unexpected: 0, broken: 0 },
  );

  const evidence: RunEvidence = {
    schemaVersion: 1,
    runId,
    createdAt,
    repository: targets.pr.repository,
    pullRequest: targets.pr.number,
    headSha: targets.pr.headSha,
    baseUrl: targets.baseUrl,
    headUrl: targets.headUrl,
    headSource: targets.headSource,
    totals,
    pages,
  };

  await writePrMeta(opts.cwd, {
    number: targets.pr.number,
    title: targets.pr.title,
    headRefName: targets.pr.headRefName,
    baseRefName: targets.pr.baseRefName,
    repository: targets.pr.repository,
    updatedAt: createdAt,
  });
  const dir = await writeRun(opts.cwd, evidence, shots);
  log(`\nWrote ${pages.length} pages → ${dir}`);
  log(
    `Totals: ${totals.changed} changed · ${totals.unexpected} unexpected · ${totals.broken} broken`,
  );
  return evidence;
}
