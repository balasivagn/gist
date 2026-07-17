import { readFile } from "node:fs/promises";
import { join } from "node:path";

const STATUS_RANK = Object.freeze({ fail: 0, removed: 1, "infra-error": 2, new: 3, "expected-change": 4, pass: 5 });

function pageTitle(route) {
  if (route === "/") return "Home";
  const segment = route.split("/").filter(Boolean).at(-1) || "Page";
  return segment.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function representativeProfile(profiles) {
  const entries = Object.entries(profiles || {});
  if (entries.length === 0) return ["desktop-1440", { status: "infra-error", diffPercent: 0 }];
  return entries.toSorted(([, left], [, right]) => {
    const rank = (STATUS_RANK[left.status] ?? 99) - (STATUS_RANK[right.status] ?? 99);
    return rank || (right.diffPercent || 0) - (left.diffPercent || 0);
  })[0];
}

async function imageDataUrl(path) {
  try {
    return `data:image/png;base64,${(await readFile(path)).toString("base64")}`;
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function captionFor(page, affected) {
  const title = pageTitle(page.page);
  const reason = affected.get(page.page)?.[0];
  if (page.status === "fail") return `${title} changed outside the pages expected from this pull request.`;
  if (page.status === "expected-change") return reason ? `${title} changed as expected: ${reason}.` : `${title} changed as expected for this pull request.`;
  if (page.status === "new") return `${title} is a new page in this pull request.`;
  if (page.status === "removed") return `${title} was removed in this pull request.`;
  if (page.status === "infra-error") return `${title} could not be checked reliably.`;
  return undefined;
}

export async function importBalancefloRun({ runDirectory, repository, pullRequest, title }) {
  const summary = JSON.parse(await readFile(join(runDirectory, "regression", "summary.json"), "utf8"));
  let manifest = null;
  try {
    manifest = JSON.parse(await readFile(join(runDirectory, "manifest.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const regressionFailed = manifest?.stages?.some((stage) => stage.name === "regression" && stage.status !== "pass") || false;
  let affectedPayload = { affected: [] };
  try {
    affectedPayload = JSON.parse(await readFile(join(runDirectory, "affected-routes.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const affected = new Map((affectedPayload.affected || []).map((entry) => [entry.route, entry.reasons || []]));
  const pages = await Promise.all(summary.pages.map(async (summaryPage) => {
    const [profile, result] = representativeProfile(summaryPage.profiles);
    const resultStatus = STATUS_RANK[result.status] === undefined ? "infra-error" : result.status;
    const missingViewport = Object.keys(summaryPage.profiles || {}).length < 3;
    const status = regressionFailed && missingViewport && resultStatus !== "fail" ? "infra-error" : resultStatus;
    const page = {
      route: summaryPage.page,
      title: pageTitle(summaryPage.page),
      status,
      diffRatio: Math.min(1, Math.max(0, (result.diffPercent || 0) / 100)),
      caption: captionFor({ ...summaryPage, status }, affected)
    };
    if (!["pass", "infra-error"].includes(status)) {
      const images = join(runDirectory, "regression", profile, `${summaryPage.slug}-diff`);
      page.productionImage = await imageDataUrl(join(images, "production.png"));
      page.previewImage = await imageDataUrl(join(images, "preview.png"));
    }
    return Object.fromEntries(Object.entries(page).filter(([, value]) => value !== undefined));
  }));
  return {
    version: 1,
    repository,
    pullRequest: {
      number: Number(pullRequest),
      title: title || `Pull request #${pullRequest}`,
      headSha: summary.run.headSha
    },
    run: manifest ? { verdict: manifest.verdict, stages: manifest.stages } : undefined,
    pages
  };
}
