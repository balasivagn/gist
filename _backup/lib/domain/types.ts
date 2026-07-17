export type PageStatus =
  | "fail"
  | "removed"
  | "infra-error"
  | "new"
  | "expected-change"
  | "pass";

export type RunState = "building" | "evidence-ready" | "complete";

export type PullRequestIdentity = {
  repository: string;
  pullRequest: number;
  headSha: string;
};

export type EvidencePage = {
  route: string;
  title: string;
  status: PageStatus;
  diffRatio: number;
  caption?: string;
  productionImage?: string;
  previewImage?: string;
  captureHeightPx?: number;
  assetRefs?: {
    production?: string;
    preview?: string;
  };
};

export type Evidence = {
  version: 1;
  repository: string;
  pullRequest: {
    number: number;
    title: string;
    headSha: string;
  };
  pages: EvidencePage[];
};

export type Counts = {
  changed: number;
  needsLook: number;
  broken: number;
};

export type StatusPresentation = {
  label: string;
  rank: number;
  tone: "warning" | "positive" | "muted";
};

export type FocusRect = {
  /** Normalized 0–1 left edge of the focus crop. */
  x: number;
  /** Normalized 0–1 top edge of the focus crop. */
  y: number;
  /** Normalized 0–1 width of the focus crop. */
  w: number;
  /** Normalized 0–1 height of the focus crop. */
  h: number;
};

export type SceneAnnotation = {
  type: "box" | "pin";
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
};

export type PresentedPage = EvidencePage & {
  caption: string;
  statusLabel: string;
  statusTone: StatusPresentation["tone"];
};

export type WalkthroughSlide = PresentedPage & {
  /** What shipped — the change name, not merely the page title. */
  changeTitle: string;
  source: "preview" | "production";
  focus: FocusRect;
  zoom: number;
  annotations: SceneAnnotation[];
};

export type Presentation = {
  headline: string;
  summary: string;
  explanationSource: "ai";
  slides: WalkthroughSlide[];
  orderedPages: PresentedPage[];
  primaryPages: PresentedPage[];
  overflowPages: PresentedPage[];
  counts: Counts;
  globalChange: boolean;
};

export type RunSummary = {
  runId: string;
  repository: string;
  pullRequest: number;
  headSha: string;
  state: RunState;
  headline: string | null;
  counts: Counts | null;
  createdAt: string;
  updatedAt: string;
};

export type PullRequestListItem = {
  repository: string;
  pullRequest: number;
  runCount: number;
  latestRunId: string;
  latestHeadline: string | null;
  latestCounts: Counts | null;
  latestState: RunState;
  updatedAt: string;
};

export type StoredRun = {
  runId: string;
  identity: PullRequestIdentity;
  state: RunState;
  evidence: Evidence | null;
  presentation: Presentation | null;
  summary: RunSummary;
  createdAt: string;
  updatedAt: string;
};

export type SceneDirectorResult = {
  headline: string;
  summary: string;
  slides: Array<{
    route: string;
    /** Name of this visual change (same route may appear on multiple slides). */
    changeTitle: string;
    caption: string;
    source: "preview" | "production";
    focus: FocusRect;
    zoom?: number;
    annotations?: SceneAnnotation[];
  }>;
};
