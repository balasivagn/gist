import type { PageStatus, StatusPresentation } from "./types";

export const STATUS_PRESENTATION: Record<PageStatus, StatusPresentation> = {
  fail: { label: "Changed — not part of this update", rank: 0, tone: "warning" },
  removed: { label: "Page removed", rank: 1, tone: "warning" },
  "infra-error": { label: "Couldn't check", rank: 2, tone: "muted" },
  new: { label: "New page", rank: 3, tone: "positive" },
  "expected-change": { label: "Changed as planned", rank: 4, tone: "positive" },
  pass: { label: "Unchanged", rank: 5, tone: "muted" },
};
