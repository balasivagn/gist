/**
 * Resolve what to capture for a PR using local `gh`/`git` access, so a run is
 * just `gist run --pr <n>`. Generalized from the balanceflo QA engine
 * (qa/visual-regression/resolve-urls.mjs): base = a configured production URL,
 * head = the PR's preview deploy, auto-detected from the PR's deployment
 * statuses and bot comments across common hosts (Cloudflare Pages, Vercel,
 * Netlify). Any leg can be overridden explicitly.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface PrMeta {
  number: number;
  title: string;
  headRefName: string;
  headSha: string;
  baseRefName: string;
  repository: string;
}

export interface ResolvedTargets {
  pr: PrMeta;
  baseUrl: string;
  headUrl: string;
  /** How the head (preview) URL was found — for the run log. */
  headSource: string;
}

/** Preview-URL patterns for the common static hosts, most specific first. */
const PREVIEW_PATTERNS: Array<{ source: string; re: RegExp }> = [
  { source: "cloudflare-pages", re: /https:\/\/[a-z0-9][a-z0-9-]*\.pages\.dev/gi },
  { source: "vercel", re: /https:\/\/[a-z0-9-]+\.vercel\.app/gi },
  { source: "netlify", re: /https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app/gi },
];

async function gh(args: string[]): Promise<string> {
  const { stdout } = await exec("gh", args, { timeout: 20_000 });
  return stdout;
}

/** Best-effort local git metadata when `gh` can't see the PR. */
async function localGitMeta(pr: number): Promise<PrMeta> {
  const safe = async (args: string[]): Promise<string> => {
    try {
      const { stdout } = await exec("git", args, { timeout: 10_000 });
      return stdout.trim();
    } catch {
      return "";
    }
  };
  const headSha = (await safe(["rev-parse", "HEAD"])) || "0".repeat(40);
  const headRefName = (await safe(["rev-parse", "--abbrev-ref", "HEAD"])) || "HEAD";
  return {
    number: pr,
    title: `PR #${pr}`,
    headRefName,
    headSha,
    baseRefName: "main",
    repository: "",
  };
}

/**
 * Read PR metadata (title, branch, SHA, repo) via `gh`, falling back to local
 * git metadata when `gh pr view` can't resolve it (no remote PR yet, offline,
 * or a manual --base/--head run). Never throws — a run should not fail just
 * because it can't enrich the title.
 */
export async function fetchPrMeta(pr: number): Promise<PrMeta> {
  try {
    const raw = await gh([
      "pr",
      "view",
      String(pr),
      "--json",
      "number,title,headRefName,headRefOid,baseRefName,headRepository,headRepositoryOwner",
    ]);
    const data = JSON.parse(raw);
    const owner = data.headRepositoryOwner?.login ?? "";
    const repo = data.headRepository?.name ?? "";
    return {
      number: data.number,
      title: data.title ?? `PR #${data.number}`,
      headRefName: data.headRefName,
      headSha: data.headRefOid,
      baseRefName: data.baseRefName,
      repository: owner && repo ? `${owner}/${repo}` : repo,
    };
  } catch {
    return localGitMeta(pr);
  }
}

/** First matching preview URL across the host patterns, with its source. */
function matchPreview(text: string): { url: string; source: string } | null {
  for (const { source, re } of PREVIEW_PATTERNS) {
    const m = text.match(re);
    if (m && m.length > 0) return { url: m[m.length - 1]!, source };
  }
  return null;
}

/**
 * Find the preview deploy URL for a PR. Strategy ladder (first hit wins):
 *   1. deployment statuses (statusCheckRollup targetUrl)
 *   2. bot comments on the PR
 * Returns null if nothing matched — the caller then requires an explicit --head.
 */
export async function resolvePreviewUrl(
  pr: number,
): Promise<{ url: string; source: string } | null> {
  try {
    const rollup = await gh([
      "pr",
      "view",
      String(pr),
      "--json",
      "statusCheckRollup",
    ]);
    const hit = matchPreview(rollup);
    if (hit) return { url: hit.url, source: `status-check:${hit.source}` };
  } catch {
    /* fall through to comments */
  }

  try {
    const comments = await gh([
      "pr",
      "view",
      String(pr),
      "--json",
      "comments",
      "--jq",
      ".comments[].body",
    ]);
    const hit = matchPreview(comments);
    if (hit) return { url: hit.url, source: `pr-comment:${hit.source}` };
  } catch {
    /* nothing found */
  }

  return null;
}

export interface ResolveOptions {
  pr: number;
  /** Production/base URL. Required unless baseUrlOverride is set. */
  productionUrl?: string;
  baseUrlOverride?: string;
  headUrlOverride?: string;
}

/** Resolve base + head targets for a PR, honouring explicit overrides. */
export async function resolveTargets(
  opts: ResolveOptions,
): Promise<ResolvedTargets> {
  const pr = await fetchPrMeta(opts.pr);

  const baseUrl = opts.baseUrlOverride ?? opts.productionUrl;
  if (!baseUrl) {
    throw new Error(
      "No base URL: set productionUrl in gist.config.json or pass --base",
    );
  }

  let headUrl = opts.headUrlOverride;
  let headSource = headUrl ? "override:--head" : "";
  if (!headUrl) {
    const found = await resolvePreviewUrl(opts.pr);
    if (!found) {
      throw new Error(
        `Could not find a preview URL for PR #${opts.pr}. Pass it with --head <url>.`,
      );
    }
    headUrl = found.url;
    headSource = found.source;
  }

  return { pr, baseUrl, headUrl, headSource };
}
