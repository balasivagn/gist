import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDirectedPresentation,
  buildPresentation,
  fallbackCaption,
  presentPage,
  orderedChangedPages,
} from "../lib/domain/presentation.ts";
import { annotationInFocusFrame, validateFocus } from "../lib/domain/scenes.ts";

const evidence = {
  version: 1 as const,
  repository: "acme/site",
  pullRequest: { number: 42, title: "Refresh signup journey", headSha: "abc123" },
  pages: [
    {
      route: "/",
      title: "Home",
      status: "expected-change" as const,
      diffRatio: 0.12,
      productionImage: "images/home-before.png",
      previewImage: "images/home-after.png",
      caption: "A clearer signup action appears above the fold.",
    },
    {
      route: "/pricing",
      title: "Pricing",
      status: "fail" as const,
      diffRatio: 0.28,
      productionImage: "images/pricing-before.png",
      previewImage: "images/pricing-after.png",
      caption: "The pricing columns shifted unexpectedly.",
    },
    {
      route: "/about",
      title: "About",
      status: "pass" as const,
      diffRatio: 0,
      productionImage: "images/about-before.png",
      previewImage: "images/about-after.png",
    },
  ],
};

function mockDirector() {
  return {
    headline: "1 page needs a look",
    summary: "Pricing shifted outside the planned update. Home changed as requested.",
    slides: [
      {
        route: "/pricing",
        changeTitle: "Pricing columns widened",
        caption: "The pricing columns became wider than planned.",
        source: "preview",
        focus: { x: 0.05, y: 0.02, w: 0.9, h: 0.28 },
        zoom: 1.25,
        annotations: [
          { type: "box", x: 0.1, y: 0.05, w: 0.35, h: 0.12, label: "Unexpected column width" },
          { type: "pin", x: 0.7, y: 0.15, label: "CTA moved" },
        ],
      },
      {
        route: "/",
        changeTitle: "Clearer signup button",
        caption: "Signup action is clearer above the fold.",
        source: "preview",
        focus: { x: 0, y: 0, w: 1, h: 0.35 },
        zoom: 1,
        annotations: [],
      },
      {
        route: "/",
        changeTitle: "Hero image updated",
        caption: "The hero photo was swapped on Home.",
        source: "preview",
        focus: { x: 0.05, y: 0.35, w: 0.9, h: 0.3 },
        zoom: 1.3,
        annotations: [{ type: "box", x: 0.1, y: 0.38, w: 0.8, h: 0.22, label: "New hero" }],
      },
    ],
  };
}

test("AI scene director output becomes a presentation ordered by attention", async () => {
  const presentation = await buildDirectedPresentation(evidence, {
    direct: async () => mockDirector(),
  });
  assert.deepEqual(
    {
      source: presentation.explanationSource,
      firstRoute: presentation.slides[0]?.route,
      firstChange: presentation.slides[0]?.changeTitle,
      focusH: presentation.slides[0]?.focus.h,
      annotation: presentation.slides[0]?.annotations[0]?.label,
      needsLook: presentation.counts.needsLook,
      homeChanges: presentation.slides.filter((slide) => slide.route === "/").length,
    },
    {
      source: "ai",
      firstRoute: "/pricing",
      firstChange: "Pricing columns widened",
      focusH: 0.28,
      annotation: "Unexpected column width",
      needsLook: 1,
      homeChanges: 2,
    },
  );
});

test("multiple changes on one page are allowed as separate slides", async () => {
  const presentation = await buildDirectedPresentation(evidence, {
    direct: async () => mockDirector(),
  });
  const home = presentation.slides.filter((slide) => slide.route === "/");
  assert.equal(home.length, 2);
  assert.notEqual(home[0].changeTitle, home[1].changeTitle);
  assert.notDeepEqual(home[0].focus, home[1].focus);
});

test("focus validation rejects crops that leave the image", () => {
  assert.throws(() => validateFocus({ x: 0.8, y: 0.8, w: 0.5, h: 0.5 }, "focus"));
});

test("annotations map into the focused frame", () => {
  const mapped = annotationInFocusFrame(
    { type: "box", x: 0.25, y: 0.1, w: 0.2, h: 0.1, label: "Shift" },
    { x: 0.2, y: 0, w: 0.5, h: 0.4 },
  );
  assert.equal(mapped.type, "box");
  if (mapped.type === "box") {
    assert.ok(Math.abs(mapped.left - 0.1) < 0.001);
    assert.ok(Math.abs(mapped.top - 0.25) < 0.001);
  }
});

test("fallback captions stay grammatical for incomplete reviews", () => {
  assert.equal(
    fallbackCaption({
      route: "/",
      title: "Home",
      status: "infra-error",
      diffRatio: 0,
    }),
    "Home could not be checked.",
  );
});

test("global-change mode collapses overflow page cards", () => {
  const pages = Array.from({ length: 5 }, (_, index) => ({
    route: `/${index}`,
    title: `Page ${index}`,
    status: "expected-change" as const,
    diffRatio: 0.2,
    previewImage: `p-${index}.png`,
  }));
  const directed = {
    headline: "This update touches the whole site",
    summary: "Common layout shift across the site.",
    slides: pages.slice(0, 3).map((page) => ({
      route: page.route,
      changeTitle: `${page.title} spacing shift`,
      caption: `${page.title} shifted.`,
      source: "preview" as const,
      focus: { x: 0, y: 0, w: 1, h: 0.3 },
      zoom: 1,
      annotations: [],
    })),
  };
  const presentation = buildPresentation(
    { ...evidence, pages },
    {
      copy: { headline: directed.headline, summary: directed.summary },
      slides: directed.slides.map((slide) => {
        const page = pages.find((entry) => entry.route === slide.route)!;
        const card = presentPage(page);
        return { ...card, ...slide };
      }),
    },
  );
  assert.equal(presentation.globalChange, true);
  assert.equal(presentation.primaryPages.length, 3);
  assert.equal(presentation.overflowPages.length, 2);
  assert.equal(orderedChangedPages(pages).length, 5);
});
