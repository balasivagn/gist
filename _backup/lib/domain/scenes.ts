import { requireNonEmptyString } from "./identity";
import { STATUS_PRESENTATION } from "./status";
import type {
  Evidence,
  FocusRect,
  PresentedPage,
  SceneAnnotation,
  SceneDirectorResult,
  WalkthroughSlide,
} from "./types";

const MAX_CHANGES = 8;

const BANNED_ANNOTATION = /header unchanged|content identical|content remains|no visual changes(?!\s*visible)/i;

function unit(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) {
    throw new TypeError(`${field} must be a number between 0 and 1`);
  }
  return value;
}

export function validateFocus(value: unknown, field: string): FocusRect {
  if (!value || typeof value !== "object") throw new TypeError(`${field} must be an object`);
  const focus = value as FocusRect;
  const x = unit(focus.x, `${field}.x`);
  const y = unit(focus.y, `${field}.y`);
  const w = unit(focus.w, `${field}.w`);
  const h = unit(focus.h, `${field}.h`);
  if (w < 0.08 || h < 0.08) throw new TypeError(`${field} crop is too small`);
  if (x + w > 1.02 || y + h > 1.02) throw new TypeError(`${field} crop exceeds the image bounds`);
  return {
    x,
    y,
    w: Math.min(w, 1 - x),
    h: Math.min(h, 1 - y),
  };
}

export function validateAnnotation(value: unknown, field: string): SceneAnnotation {
  if (!value || typeof value !== "object") throw new TypeError(`${field} must be an object`);
  const annotation = value as SceneAnnotation;
  if (annotation.type !== "box" && annotation.type !== "pin") {
    throw new TypeError(`${field}.type must be box or pin`);
  }
  requireNonEmptyString(annotation.label, `${field}.label`);
  const x = unit(annotation.x, `${field}.x`);
  const y = unit(annotation.y, `${field}.y`);
  if (annotation.type === "box") {
    const w = unit(annotation.w, `${field}.w`);
    const h = unit(annotation.h, `${field}.h`);
    if (w < 0.02 || h < 0.02) throw new TypeError(`${field} box is too small`);
    return { type: "box", x, y, w, h, label: annotation.label.trim() };
  }
  return { type: "pin", x, y, label: annotation.label.trim() };
}

/** Drop decorative / fake unchanged labels; keep real callouts and "No visible change". */
export function filterUsefulAnnotations(annotations: SceneAnnotation[]): SceneAnnotation[] {
  return annotations.filter((annotation) => {
    const label = annotation.label.trim();
    if (/^no visible change\.?$/i.test(label)) return true;
    if (BANNED_ANNOTATION.test(label)) return false;
    return label.length > 0;
  });
}

/** Map an image-space annotation into percentages inside the focused walkthrough frame. */
export function annotationInFocusFrame(annotation: SceneAnnotation, focus: FocusRect) {
  const left = (annotation.x - focus.x) / focus.w;
  const top = (annotation.y - focus.y) / focus.h;
  if (annotation.type === "pin") {
    return { type: "pin" as const, left, top, label: annotation.label };
  }
  return {
    type: "box" as const,
    left,
    top,
    width: (annotation.w || 0) / focus.w,
    height: (annotation.h || 0) / focus.h,
    label: annotation.label,
  };
}

export function validateSceneDirectorResult(
  value: unknown,
  evidence: Evidence,
  _pageCards: PresentedPage[],
): { copy: { headline: string; summary: string }; slides: WalkthroughSlide[] } {
  if (!value || typeof value !== "object") throw new TypeError("AI scene director must return an object");
  const result = value as SceneDirectorResult;
  requireNonEmptyString(result.headline, "AI headline");
  requireNonEmptyString(result.summary, "AI summary");
  if (!Array.isArray(result.slides) || result.slides.length === 0) {
    throw new TypeError("AI slides must contain at least one change");
  }
  if (result.slides.length > MAX_CHANGES) {
    throw new TypeError(`AI changes are limited to ${MAX_CHANGES}`);
  }

  const pages = new Map(evidence.pages.map((page) => [page.route, page]));
  // Same route may appear on multiple slides (multiple changes on one page).
  const slides = result.slides.map((slide, index) => {
    requireNonEmptyString(slide?.route, `AI slides[${index}].route`);
    requireNonEmptyString(slide?.caption, `AI slides[${index}].caption`);
    const changeTitle =
      typeof slide.changeTitle === "string" && slide.changeTitle.trim() !== ""
        ? slide.changeTitle.trim()
        : slide.caption.trim();
    const page = pages.get(slide.route);
    if (!page) throw new TypeError(`AI change route ${slide.route} is not present in evidence`);
    if (slide.source !== "preview" && slide.source !== "production") {
      throw new TypeError(`AI slides[${index}].source must be preview or production`);
    }
    const focus = validateFocus(slide.focus, `AI slides[${index}].focus`);
    const zoom = typeof slide.zoom === "number" && slide.zoom >= 1 && slide.zoom <= 3 ? slide.zoom : 1;
    const annotations = filterUsefulAnnotations(
      Array.isArray(slide.annotations)
        ? slide.annotations
            .slice(0, 3)
            .map((annotation, annotationIndex) =>
              validateAnnotation(annotation, `AI slides[${index}].annotations[${annotationIndex}]`),
            )
        : [],
    );
    const status = STATUS_PRESENTATION[page.status];
    return {
      ...page,
      changeTitle,
      caption: slide.caption.trim(),
      statusLabel: status.label,
      statusTone: status.tone,
      source: slide.source,
      focus,
      zoom,
      annotations,
    } satisfies WalkthroughSlide;
  });

  return {
    copy: { headline: result.headline.trim(), summary: result.summary.trim() },
    slides,
  };
}
