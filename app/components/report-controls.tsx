"use client";

import { useEffect, useRef, useState } from "react";
import { annotationInFocusFrame, filterUsefulAnnotations } from "@/lib/domain/scenes";
import type { PresentedPage, Presentation, WalkthroughSlide } from "@/lib/domain/types";

type ViewMode = "guided" | "before" | "after" | "slider" | "diff";

const VIEW_MODES: Array<{ id: ViewMode; label: string }> = [
  { id: "guided", label: "Guided" },
  { id: "before", label: "Before" },
  { id: "after", label: "After" },
  { id: "slider", label: "Slider" },
  { id: "diff", label: "Diff" },
];

const MODE_HINTS: Record<ViewMode, string> = {
  guided: "Focused on this change",
  before: "Before · production",
  after: "After · preview",
  slider: "Drag the line to compare",
  diff: "Red = changed pixels",
};

function ViewportFrame({
  children,
  label,
  scroll = true,
}: {
  children: React.ReactNode;
  label: string;
  scroll?: boolean;
}) {
  return (
    <div className="viewport">
      <div className="viewport-hint">
        <span>Viewport</span>
        <span>{label}</span>
      </div>
      <div className={scroll ? "viewport-scroll" : "viewport-frame"}>{children}</div>
    </div>
  );
}

function SceneCanvas({ change }: { change: WalkthroughSlide }) {
  const image =
    change.source === "production"
      ? change.productionImage || change.previewImage
      : change.previewImage || change.productionImage;
  if (!image) {
    return (
      <div className="image-placeholder" role="img" aria-label="Preview unavailable">
        Preview unavailable
      </div>
    );
  }

  const focus = change.focus ?? { x: 0, y: 0, w: 1, h: 1 };
  const zoom = typeof change.zoom === "number" && change.zoom >= 1 ? change.zoom : 1;
  const annotations = filterUsefulAnnotations(change.annotations ?? [])
    .map((annotation) => annotationInFocusFrame(annotation, focus))
    .filter((annotation) => {
      if (annotation.type === "pin") {
        return annotation.left >= -0.05 && annotation.left <= 1.05 && annotation.top >= -0.05 && annotation.top <= 1.05;
      }
      return annotation.width > 0 && annotation.height > 0;
    });

  return (
    <div className="scene-stage">
      <div
        className="scene-crop"
        style={{
          width: `${(100 / focus.w) * zoom}%`,
          transform: `translate(${(-focus.x / focus.w) * 100}%, ${(-focus.y / focus.h) * 100}%)`,
        }}
      >
        <img src={image} alt={change.changeTitle} />
      </div>
      {annotations.map((annotation, index) =>
        annotation.type === "pin" ? (
          <div
            key={`${annotation.label}-${index}`}
            className="scene-pin"
            style={{ left: `${annotation.left * 100}%`, top: `${annotation.top * 100}%` }}
          >
            <span className="scene-pin-dot" />
            <span className="scene-callout">{annotation.label}</span>
          </div>
        ) : (
          <div
            key={`${annotation.label}-${index}`}
            className="scene-box"
            style={{
              left: `${annotation.left * 100}%`,
              top: `${annotation.top * 100}%`,
              width: `${annotation.width * 100}%`,
              height: `${annotation.height * 100}%`,
            }}
          >
            <span className="scene-callout">{annotation.label}</span>
          </div>
        ),
      )}
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
  });
}

function paintRedDiff(
  canvas: HTMLCanvasElement,
  before: HTMLImageElement,
  after: HTMLImageElement,
  threshold = 28,
) {
  const sourceWidth = Math.max(before.naturalWidth, after.naturalWidth);
  const sourceHeight = Math.max(before.naturalHeight, after.naturalHeight);
  const maxWidth = 1200;
  const scale = sourceWidth > maxWidth ? maxWidth / sourceWidth : 1;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const beforeCanvas = document.createElement("canvas");
  beforeCanvas.width = width;
  beforeCanvas.height = height;
  const beforeCtx = beforeCanvas.getContext("2d");
  if (!beforeCtx) return;
  beforeCtx.drawImage(before, 0, 0, width, height);

  const afterCanvas = document.createElement("canvas");
  afterCanvas.width = width;
  afterCanvas.height = height;
  const afterCtx = afterCanvas.getContext("2d");
  if (!afterCtx) return;
  afterCtx.drawImage(after, 0, 0, width, height);

  const beforeData = beforeCtx.getImageData(0, 0, width, height);
  const afterData = afterCtx.getImageData(0, 0, width, height);
  const out = ctx.createImageData(width, height);

  for (let i = 0; i < beforeData.data.length; i += 4) {
    const delta =
      Math.abs(beforeData.data[i] - afterData.data[i]) +
      Math.abs(beforeData.data[i + 1] - afterData.data[i + 1]) +
      Math.abs(beforeData.data[i + 2] - afterData.data[i + 2]);
    const gray = Math.round(
      0.299 * afterData.data[i] + 0.587 * afterData.data[i + 1] + 0.114 * afterData.data[i + 2],
    );
    if (delta > threshold) {
      out.data[i] = 220;
      out.data[i + 1] = 38;
      out.data[i + 2] = 38;
      out.data[i + 3] = 255;
    } else {
      out.data[i] = gray;
      out.data[i + 1] = gray;
      out.data[i + 2] = gray;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

function RedDiffCanvas({
  beforeSrc,
  afterSrc,
  title,
}: {
  beforeSrc: string;
  afterSrc: string;
  title: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    Promise.all([loadImage(beforeSrc), loadImage(afterSrc)])
      .then(([before, after]) => {
        if (cancelled || !canvasRef.current) return;
        paintRedDiff(canvasRef.current, before, after);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [beforeSrc, afterSrc]);

  if (status === "error") {
    return (
      <div className="image-placeholder" role="img" aria-label={`Diff unavailable for ${title}`}>
        Diff unavailable
      </div>
    );
  }

  return (
    <div className={`diff-canvas-wrap${status === "loading" ? " is-loading" : ""}`}>
      {status === "loading" ? <p className="diff-canvas-status">Marking changes…</p> : null}
      <canvas
        ref={canvasRef}
        className="diff-canvas"
        role="img"
        aria-label={`Red-marked differences for ${title}`}
      />
    </div>
  );
}

function ChangeViewer({
  change,
  mode,
  percent,
  onPercentChange,
}: {
  change: WalkthroughSlide;
  mode: ViewMode;
  percent: number;
  onPercentChange: (value: number) => void;
}) {
  if (mode === "guided") {
    return (
      <ViewportFrame label={MODE_HINTS.guided} scroll={false}>
        <SceneCanvas change={change} />
      </ViewportFrame>
    );
  }

  if (!change.productionImage || !change.previewImage) {
    return (
      <ViewportFrame label={MODE_HINTS[mode]}>
        <div className="image-placeholder">Images unavailable</div>
      </ViewportFrame>
    );
  }

  return (
    <>
      <ViewportFrame label={MODE_HINTS[mode]}>
        {mode === "before" ? (
          <img src={change.productionImage} alt={`Before: ${change.changeTitle}`} />
        ) : null}
        {mode === "after" ? (
          <img src={change.previewImage} alt={`After: ${change.changeTitle}`} />
        ) : null}
        {mode === "slider" ? (
          <div className="diff-stack">
            <img
              className="diff-before"
              src={change.productionImage}
              alt={`Before: ${change.changeTitle}`}
            />
            <div className="diff-after" style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}>
              <img src={change.previewImage} alt={`After: ${change.changeTitle}`} />
            </div>
            <div className="diff-divider" style={{ left: `${percent}%` }} aria-hidden="true">
              <span className="diff-handle" />
            </div>
          </div>
        ) : null}
        {mode === "diff" ? (
          <RedDiffCanvas
            beforeSrc={change.productionImage}
            afterSrc={change.previewImage}
            title={change.changeTitle}
          />
        ) : null}
      </ViewportFrame>
      {mode === "slider" ? (
        <div className="diff-controls">
          <div className="diff-labels">
            <span>Before</span>
            <span className="diff-split-pct">{percent}% after</span>
            <span>After</span>
          </div>
          <input
            className="diff-range"
            type="range"
            min={0}
            max={100}
            value={percent}
            aria-label={`Reveal after image for ${change.changeTitle}`}
            aria-valuetext={`${percent}% after`}
            onChange={(event) => onPercentChange(Number(event.target.value))}
          />
        </div>
      ) : null}
    </>
  );
}

/** Change-focused walkthrough: prev/next advances changes (same page may appear twice). */
export function ChangeWalkthrough({ presentation }: { presentation: Presentation }) {
  const changes = presentation.slides;
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<ViewMode>("guided");
  const [percent, setPercent] = useState(50);

  useEffect(() => {
    if (index >= changes.length) setIndex(Math.max(0, changes.length - 1));
  }, [changes.length, index]);

  if (changes.length === 0) {
    return (
      <section className="change-walk">
        <h2>No visible changes</h2>
        <p className="lede">The captured pages match production.</p>
      </section>
    );
  }

  const change = changes[Math.min(index, changes.length - 1)];
  const go = (delta: number) => {
    setIndex((current) => (current + delta + changes.length) % changes.length);
    setMode("guided");
  };

  return (
    <section
      className="change-walk"
      onPointerDown={(event) => {
        (event.currentTarget as HTMLElement & { __startX?: number }).__startX = event.clientX;
      }}
      onPointerUp={(event) => {
        const startX = (event.currentTarget as HTMLElement & { __startX?: number }).__startX;
        if (startX === undefined) return;
        const dx = event.clientX - startX;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="change-walk-header">
        <p className="eyebrow">Walk through the changes</p>
        <p className="change-count">
          Change {index + 1} of {changes.length}
        </p>
      </div>

      <div className="change-card">
        <div className="change-card-top">
          <h2>{change.changeTitle}</h2>
          <p className="change-meta">
            on {change.title}
            <span aria-hidden="true"> · </span>
            {change.route}
            <span aria-hidden="true"> · </span>
            <span className={`status status-${change.statusTone}`}>{change.statusLabel}</span>
          </p>
          <p className="change-caption">{change.caption}</p>
        </div>

        <div className="compare" aria-label={`Inspect ${change.changeTitle}`}>
          <div className="compare-modes" role="tablist" aria-label="View mode">
            {VIEW_MODES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={mode === entry.id}
                className={`compare-mode${mode === entry.id ? " is-active" : ""}`}
                onClick={() => setMode(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <ChangeViewer
            change={change}
            mode={mode}
            percent={percent}
            onPercentChange={setPercent}
          />
        </div>

        <div className="change-dots" role="tablist" aria-label="Changes">
          {changes.map((entry, dotIndex) => (
            <button
              key={`${entry.route}-${entry.changeTitle}-${dotIndex}`}
              type="button"
              role="tab"
              aria-selected={dotIndex === index}
              aria-label={`Change ${dotIndex + 1}: ${entry.changeTitle}`}
              className={`change-dot${dotIndex === index ? " is-active" : ""}`}
              onClick={() => {
                setIndex(dotIndex);
                setMode("guided");
              }}
            />
          ))}
        </div>

        <div className="slide-controls">
          <button type="button" aria-label="Previous change" onClick={() => go(-1)}>
            ← Previous
          </button>
          <span>
            {index + 1} / {changes.length}
          </span>
          <button type="button" aria-label="Next change" onClick={() => go(1)}>
            Next →
          </button>
        </div>
      </div>

      {presentation.primaryPages.length > 0 ? (
        <details className="page-inventory">
          <summary>
            Pages in this review ({presentation.primaryPages.length + presentation.overflowPages.length})
          </summary>
          <ul>
            {[...presentation.primaryPages, ...presentation.overflowPages].map((page) => (
              <li key={page.route}>
                <strong>{page.title}</strong>
                <span>
                  {page.route} · {page.statusLabel}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/** @deprecated Prefer ChangeWalkthrough */
export const ChangeReview = ChangeWalkthrough;

/** @deprecated Prefer ChangeWalkthrough */
export function Walkthrough({ slides }: { slides: WalkthroughSlide[] }) {
  return (
    <ChangeWalkthrough
      presentation={{
        headline: "",
        summary: "",
        explanationSource: "ai",
        slides,
        orderedPages: slides,
        primaryPages: slides,
        overflowPages: [],
        counts: { changed: slides.length, needsLook: 0, broken: 0 },
        globalChange: false,
      }}
    />
  );
}

export function PageCompare({ page }: { page: PresentedPage }) {
  const change: WalkthroughSlide = {
    ...page,
    changeTitle: page.title,
    source: "preview",
    focus: { x: 0, y: 0, w: 1, h: 1 },
    zoom: 1,
    annotations: [],
  };
  const [mode, setMode] = useState<ViewMode>("slider");
  const [percent, setPercent] = useState(50);
  if (!page.productionImage || !page.previewImage) return null;
  return (
    <div className="compare" aria-label={`Compare before and after for ${page.title}`}>
      <div className="compare-modes" role="tablist" aria-label="Compare mode">
        {VIEW_MODES.filter((entry) => entry.id !== "guided").map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={mode === entry.id}
            className={`compare-mode${mode === entry.id ? " is-active" : ""}`}
            onClick={() => setMode(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <ChangeViewer
        change={change}
        mode={mode === "guided" ? "slider" : mode}
        percent={percent}
        onPercentChange={setPercent}
      />
    </div>
  );
}

export const DiffSlider = PageCompare;
