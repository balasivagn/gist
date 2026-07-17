import { generateReport, validateEvidence } from "./report.mjs";
import { requireNonEmptyString } from "./identity.mjs";

export function validateEnrichment(value, evidence) {
  if (!value || typeof value !== "object") throw new TypeError("AI enrichment must be an object");
  requireNonEmptyString(value.headline, "AI headline");
  requireNonEmptyString(value.summary, "AI summary");
  if (!Array.isArray(value.slides) || value.slides.length === 0) {
    throw new TypeError("AI slides must contain at least one slide");
  }
  const pages = new Map(evidence.pages.map((page) => [page.route, page]));
  const slides = value.slides.map((slide, index) => {
    requireNonEmptyString(slide?.route, `AI slides[${index}].route`);
    requireNonEmptyString(slide?.caption, `AI slides[${index}].caption`);
    const page = pages.get(slide.route);
    if (!page) throw new TypeError(`AI slide route ${slide.route} is not present in evidence`);
    return { ...page, caption: slide.caption };
  });
  return { copy: { headline: value.headline, summary: value.summary }, slides };
}

export async function buildEnrichedReport(rawEvidence, { ai } = {}) {
  const evidence = validateEvidence(rawEvidence);
  let report;
  try {
    if (!ai) throw new Error("AI is not configured");
    const enrichment = validateEnrichment(await ai.explain(evidence), evidence);
    report = generateReport(evidence, enrichment);
    report.status.explanationSource = "ai";
  } catch {
    report = generateReport(evidence);
    report.status.explanationSource = "deterministic";
  }
  return report;
}
