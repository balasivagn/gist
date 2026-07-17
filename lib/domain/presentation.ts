import { pullRequestRevision, requireNonEmptyString } from "./identity";
import { validateSceneDirectorResult } from "./scenes";
import { STATUS_PRESENTATION } from "./status";
import type {
  Counts,
  Evidence,
  EvidencePage,
  Presentation,
  PresentedPage,
  WalkthroughSlide,
} from "./types";

export { STATUS_PRESENTATION } from "./status";

export function validateEvidence(evidence: unknown): Evidence {
  if (!evidence || typeof evidence !== "object") {
    throw new TypeError("evidence must be an object");
  }
  const value = evidence as Evidence;
  if (value.version !== 1) {
    throw new TypeError("evidence.version must be 1");
  }
  pullRequestRevision(
    {
      repository: value.repository,
      pullRequest: value.pullRequest?.number,
      headSha: value.pullRequest?.headSha,
    },
    "evidence",
  );
  requireNonEmptyString(value.pullRequest?.title, "evidence.pullRequest.title");
  if (!Array.isArray(value.pages) || value.pages.length === 0) {
    throw new TypeError("evidence.pages must contain at least one page");
  }
  for (const [index, page] of value.pages.entries()) {
    requireNonEmptyString(page.route, `evidence.pages[${index}].route`);
    requireNonEmptyString(page.title, `evidence.pages[${index}].title`);
    if (!STATUS_PRESENTATION[page.status]) {
      throw new TypeError(`evidence.pages[${index}].status is unsupported`);
    }
    if (typeof page.diffRatio !== "number" || page.diffRatio < 0 || page.diffRatio > 1) {
      throw new TypeError(`evidence.pages[${index}].diffRatio must be between 0 and 1`);
    }
  }
  return value;
}

export function orderedChangedPages(pages: EvidencePage[]): EvidencePage[] {
  return pages
    .filter((page) => page.status !== "pass")
    .toSorted((left, right) => {
      const rankDifference =
        STATUS_PRESENTATION[left.status].rank - STATUS_PRESENTATION[right.status].rank;
      return rankDifference || right.diffRatio - left.diffRatio || left.route.localeCompare(right.route);
    });
}

export function summarize(pages: EvidencePage[]): Counts {
  return {
    changed: pages.filter((page) => !["pass", "infra-error"].includes(page.status)).length,
    needsLook: pages.filter((page) => ["fail", "removed"].includes(page.status)).length,
    broken: pages.filter((page) => page.status === "infra-error").length,
  };
}

export function fallbackCaption(page: EvidencePage): string {
  switch (page.status) {
    case "fail":
      return `${page.title} changed outside this update.`;
    case "removed":
      return `${page.title} was removed.`;
    case "infra-error":
      return `${page.title} could not be checked.`;
    case "new":
      return `${page.title} is new.`;
    case "expected-change":
      return `${page.title} changed as planned.`;
    case "pass":
      return `${page.title} is unchanged.`;
  }
}

export function presentPage(page: EvidencePage): PresentedPage {
  const status = STATUS_PRESENTATION[page.status];
  return {
    ...page,
    caption: page.caption || fallbackCaption(page),
    statusLabel: status.label,
    statusTone: status.tone,
  };
}

export function buildPresentation(
  rawEvidence: unknown,
  options: {
    copy: { headline: string; summary: string };
    slides: WalkthroughSlide[];
  },
): Presentation {
  const evidence = validateEvidence(rawEvidence);
  const changedPages = orderedChangedPages(evidence.pages).map(presentPage);
  const counts = summarize(evidence.pages);
  const globalChange = counts.changed / evidence.pages.length > 0.6;
  // AI slide order is the guided walkthrough order; remaining pages follow by attention rank.
  const byRoute = new Map(changedPages.map((page) => [page.route, page]));
  const directedOrder: PresentedPage[] = [];
  for (const slide of options.slides) {
    const page = byRoute.get(slide.route);
    if (page) {
      directedOrder.push(page);
      byRoute.delete(slide.route);
    }
  }
  for (const page of changedPages) {
    if (byRoute.has(page.route)) directedOrder.push(page);
  }
  const primaryPages = globalChange ? directedOrder.slice(0, 3) : directedOrder;
  const overflowPages = globalChange ? directedOrder.slice(3) : [];
  return {
    headline: options.copy.headline,
    summary: options.copy.summary,
    explanationSource: "ai",
    slides: options.slides,
    orderedPages: directedOrder,
    primaryPages,
    overflowPages,
    counts,
    globalChange,
  };
}

export async function buildDirectedPresentation(
  rawEvidence: unknown,
  options: {
    direct: (evidence: Evidence) => Promise<unknown>;
  },
): Promise<Presentation> {
  const evidence = validateEvidence(rawEvidence);
  const pageCards = orderedChangedPages(evidence.pages).map(presentPage);
  const directed = validateSceneDirectorResult(await options.direct(evidence), evidence, pageCards);
  return buildPresentation(evidence, directed);
}
