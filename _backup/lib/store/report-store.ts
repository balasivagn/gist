import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { pullRequestRevision } from "../domain/identity";
import { buildDirectedPresentation } from "../domain/presentation";
import { directScenesWithAnthropic } from "../ai/scene-director";
import type {
  Evidence,
  EvidencePage,
  Presentation,
  PullRequestIdentity,
  PullRequestListItem,
  RunState,
  RunSummary,
  StoredRun,
} from "../domain/types";

const STATE_RANK: Record<RunState, number> = {
  building: 0,
  "evidence-ready": 1,
  complete: 2,
};

function prDirectory(reportRoot: string, repository: string, pullRequest: number) {
  const [owner, name] = repository.split("/");
  return join(reportRoot, "pr", owner, name, String(pullRequest));
}

function runDirectory(reportRoot: string, repository: string, pullRequest: number, runId: string) {
  return join(prDirectory(reportRoot, repository, pullRequest), "runs", runId);
}

async function readJsonIfExists<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(path: string, value: unknown) {
  await mkdir(join(path, ".."), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function runIdFor(identity: PullRequestIdentity) {
  return `${identity.headSha.slice(0, 12)}-${Date.now().toString(36)}`;
}

export function assertBearer(header: string | null, expectedToken: string) {
  if (typeof expectedToken !== "string" || expectedToken === "") return false;
  const expected = Buffer.from(`Bearer ${expectedToken}`);
  const actual = Buffer.from(header || "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const DATA_URL = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

function extensionFor(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "png";
}

export async function materializeEvidenceAssets(options: {
  reportRoot: string;
  evidence: Evidence;
  runId: string;
}): Promise<Evidence> {
  const identity = pullRequestRevision({
    repository: options.evidence.repository,
    pullRequest: options.evidence.pullRequest.number,
    headSha: options.evidence.pullRequest.headSha,
  });
  const assetsDir = join(
    runDirectory(options.reportRoot, identity.repository, identity.pullRequest, options.runId),
    "assets",
  );
  await mkdir(assetsDir, { recursive: true });

  const pages = await Promise.all(
    options.evidence.pages.map(async (page, index) => {
      const assetRefs: { production?: string; preview?: string } = {
        ...(page.assetRefs || {}),
      };
      const nextPage: EvidencePage = { ...page };

      for (const kind of ["production", "preview"] as const) {
        const value = page[`${kind}Image` as const];
        if (typeof value !== "string") continue;
        const match = value.match(DATA_URL);
        if (!match) continue;
        const [, mime, base64] = match;
        const filename = `${index}-${kind}.${extensionFor(mime)}`;
        await writeFile(join(assetsDir, filename), Buffer.from(base64, "base64"));
        assetRefs[kind] = filename;
        delete nextPage[`${kind}Image` as const];
      }

      if (Object.keys(assetRefs).length > 0) nextPage.assetRefs = assetRefs;
      else delete nextPage.assetRefs;
      return nextPage;
    }),
  );

  return { ...options.evidence, pages };
}

function resolvePageImages(
  evidence: Evidence,
  repository: string,
  pullRequest: number,
  runId: string,
): Evidence {
  return {
    ...evidence,
    pages: evidence.pages.map((page) => {
      const next = { ...page };
      if (page.assetRefs?.production) {
        next.productionImage = `/pr/${repository}/${pullRequest}/runs/${runId}/assets/${page.assetRefs.production}`;
      }
      if (page.assetRefs?.preview) {
        next.previewImage = `/pr/${repository}/${pullRequest}/runs/${runId}/assets/${page.assetRefs.preview}`;
      }
      return next;
    }),
  };
}

async function writeRunsIndex(reportRoot: string, repository: string, pullRequest: number, summaries: RunSummary[]) {
  const directory = prDirectory(reportRoot, repository, pullRequest);
  await writeJsonAtomic(join(directory, "runs.json"), summaries);
  if (summaries[0]) {
    await writeJsonAtomic(join(directory, "latest.json"), {
      runId: summaries[0].runId,
      headSha: summaries[0].headSha,
      updatedAt: summaries[0].updatedAt,
    });
  }
}

export async function listRuns(
  reportRoot: string,
  repository: string,
  pullRequest: number,
): Promise<RunSummary[]> {
  const index = await readJsonIfExists<RunSummary[]>(
    join(prDirectory(reportRoot, repository, pullRequest), "runs.json"),
  );
  return index || [];
}

export async function getRun(
  reportRoot: string,
  repository: string,
  pullRequest: number,
  runId: string,
): Promise<StoredRun | null> {
  const directory = runDirectory(reportRoot, repository, pullRequest, runId);
  const summary = await readJsonIfExists<RunSummary>(join(directory, "summary.json"));
  if (!summary) return null;
  const evidence = await readJsonIfExists<Evidence>(join(directory, "evidence.json"));
  const presentation = await readJsonIfExists<Presentation>(join(directory, "presentation.json"));
  const status = await readJsonIfExists<{
    state: RunState;
    repository: string;
    pullRequest: number;
    headSha: string;
    createdAt: string;
    updatedAt: string;
  }>(join(directory, "status.json"));
  if (!status) return null;
  return {
    runId,
    identity: {
      repository: status.repository,
      pullRequest: status.pullRequest,
      headSha: status.headSha,
    },
    state: status.state,
    evidence: evidence
      ? resolvePageImages(evidence, repository, pullRequest, runId)
      : null,
    presentation,
    summary,
    createdAt: status.createdAt,
    updatedAt: status.updatedAt,
  };
}

export async function getLatestRun(
  reportRoot: string,
  repository: string,
  pullRequest: number,
): Promise<StoredRun | null> {
  const latest = await readJsonIfExists<{ runId: string }>(
    join(prDirectory(reportRoot, repository, pullRequest), "latest.json"),
  );
  if (!latest?.runId) return null;
  return getRun(reportRoot, repository, pullRequest, latest.runId);
}

export async function listPullRequests(reportRoot: string): Promise<PullRequestListItem[]> {
  const root = join(reportRoot, "pr");
  let owners: string[] = [];
  try {
    owners = await readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const items: PullRequestListItem[] = [];
  for (const owner of owners) {
    const repos = await readdir(join(root, owner));
    for (const repo of repos) {
      const numbers = await readdir(join(root, owner, repo));
      for (const number of numbers) {
        const pullRequest = Number(number);
        if (!Number.isInteger(pullRequest)) continue;
        const repository = `${owner}/${repo}`;
        const runs = await listRuns(reportRoot, repository, pullRequest);
        if (runs.length === 0) continue;
        const latest = runs[0];
        items.push({
          repository,
          pullRequest,
          runCount: runs.length,
          latestRunId: latest.runId,
          latestHeadline: latest.headline,
          latestCounts: latest.counts,
          latestState: latest.state,
          updatedAt: latest.updatedAt,
        });
      }
    }
  }

  return items.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveRun(options: {
  reportRoot: string;
  identity: PullRequestIdentity;
  state: RunState;
  evidence?: Evidence | null;
  presentation?: Presentation | null;
  headline?: string | null;
}): Promise<{ runId: string; directory: string; summary: RunSummary }> {
  const identity = pullRequestRevision(options.identity);
  const existing = await listRuns(options.reportRoot, identity.repository, identity.pullRequest);
  const sameSha = existing.find((run) => run.headSha === identity.headSha);
  if (sameSha && STATE_RANK[sameSha.state] > STATE_RANK[options.state]) {
    const directory = runDirectory(
      options.reportRoot,
      identity.repository,
      identity.pullRequest,
      sameSha.runId,
    );
    return { runId: sameSha.runId, directory, summary: sameSha };
  }

  const runId = sameSha?.runId || runIdFor(identity);
  const directory = runDirectory(
    options.reportRoot,
    identity.repository,
    identity.pullRequest,
    runId,
  );
  await mkdir(join(directory, "assets"), { recursive: true });
  const now = new Date().toISOString();
  const previous = sameSha
    ? await readJsonIfExists<{ createdAt: string }>(join(directory, "status.json"))
    : null;
  const createdAt = previous?.createdAt || sameSha?.createdAt || now;
  const headline =
    options.headline ??
    options.presentation?.headline ??
    (options.state === "building" ? "Building your review…" : null);
  const counts = options.presentation?.counts ?? sameSha?.counts ?? null;
  const summary: RunSummary = {
    runId,
    repository: identity.repository,
    pullRequest: identity.pullRequest,
    headSha: identity.headSha,
    state: options.state,
    headline,
    counts,
    createdAt,
    updatedAt: now,
  };

  await writeJsonAtomic(join(directory, "status.json"), {
    version: 1,
    state: options.state,
    repository: identity.repository,
    pullRequest: identity.pullRequest,
    headSha: identity.headSha,
    counts,
    createdAt,
    updatedAt: now,
  });
  await writeJsonAtomic(join(directory, "summary.json"), summary);
  if (options.evidence) {
    await writeJsonAtomic(join(directory, "evidence.json"), options.evidence);
  }
  if (options.presentation) {
    await writeJsonAtomic(join(directory, "presentation.json"), options.presentation);
  }

  const nextIndex = [
    summary,
    ...existing.filter((run) => run.runId !== runId),
  ];
  await writeRunsIndex(options.reportRoot, identity.repository, identity.pullRequest, nextIndex);
  return { runId, directory, summary };
}

export async function ingestBuilding(options: {
  reportRoot: string;
  identity: PullRequestIdentity;
}) {
  return saveRun({
    reportRoot: options.reportRoot,
    identity: options.identity,
    state: "building",
    evidence: null,
    presentation: null,
    headline: "Building your review…",
  });
}

export async function ingestEvidence(options: {
  reportRoot: string;
  evidence: Evidence;
  /** Injected Scene Director for tests. Production uses Anthropic. */
  direct?: (evidence: Evidence) => Promise<unknown>;
  maxPages?: number;
}) {
  const evidence = options.evidence;
  if (!Array.isArray(evidence.pages)) throw new TypeError("evidence.pages is required");
  if (evidence.pages.length > (options.maxPages ?? 5)) {
    throw new TypeError(`demo evidence is limited to ${options.maxPages ?? 5} URLs`);
  }

  const identity = pullRequestRevision({
    repository: evidence.repository,
    pullRequest: evidence.pullRequest.number,
    headSha: evidence.pullRequest.headSha,
  });
  const existing = await listRuns(options.reportRoot, identity.repository, identity.pullRequest);
  const sameSha = existing.find((run) => run.headSha === identity.headSha);
  const runId = sameSha?.runId || runIdFor(identity);

  const storedEvidence = await materializeEvidenceAssets({
    reportRoot: options.reportRoot,
    evidence,
    runId,
  });
  const forPresentation = resolvePageImages(
    storedEvidence,
    identity.repository,
    identity.pullRequest,
    runId,
  );
  const assetsDirectory = join(
    runDirectory(options.reportRoot, identity.repository, identity.pullRequest, runId),
    "assets",
  );
  const presentation = await buildDirectedPresentation(forPresentation, {
    direct:
      options.direct ||
      (async (directedEvidence) =>
        directScenesWithAnthropic({
          evidence: directedEvidence,
          assetsDirectory,
        })),
  });

  return saveRun({
    reportRoot: options.reportRoot,
    identity,
    state: "complete",
    evidence: storedEvidence,
    presentation,
    headline: presentation.headline,
  });
}

export async function readAsset(options: {
  reportRoot: string;
  repository: string;
  pullRequest: number;
  runId: string;
  filename: string;
}): Promise<{ body: Buffer; contentType: string } | null> {
  if (!/^[A-Za-z0-9._-]+$/.test(options.filename)) return null;
  try {
    const body = await readFile(
      join(
        runDirectory(options.reportRoot, options.repository, options.pullRequest, options.runId),
        "assets",
        options.filename,
      ),
    );
    const contentType = options.filename.endsWith(".jpg")
      ? "image/jpeg"
      : options.filename.endsWith(".webp")
        ? "image/webp"
        : options.filename.endsWith(".gif")
          ? "image/gif"
          : "image/png";
    return { body, contentType };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function contentHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
