import assert from "node:assert/strict";
import test from "node:test";

import { generateReport } from "../src/report.mjs";

const evidence = {
  version: 1,
  repository: "acme/site",
  pullRequest: { number: 42, title: "Refresh signup journey", headSha: "abc123" },
  pages: [
    {
      route: "/",
      title: "Home",
      status: "expected-change",
      diffRatio: 0.12,
      productionImage: "images/home-before.png",
      previewImage: "images/home-after.png",
      caption: "A clearer signup action appears above the fold."
    },
    {
      route: "/pricing",
      title: "Pricing",
      status: "fail",
      diffRatio: 0.28,
      productionImage: "images/pricing-before.png",
      previewImage: "images/pricing-after.png",
      caption: "The pricing columns shifted unexpectedly."
    },
    {
      route: "/about",
      title: "About",
      status: "pass",
      diffRatio: 0,
      productionImage: "images/about-before.png",
      previewImage: "images/about-after.png"
    }
  ]
};

test("an evidence bundle becomes an understandable report ordered by attention", () => {
  const report = generateReport(evidence);

  assert.deepEqual(
    {
      state: report.status.state,
      changed: report.status.counts.changed,
      needsLook: report.status.counts.needsLook,
      pricingBeforeHome: report.html.indexOf("Pricing") < report.html.indexOf("Home"),
      plainLanguage: report.html.includes("Changed — not part of this update"),
      captioned: report.html.includes("The pricing columns shifted unexpectedly.")
    },
    {
      state: "complete",
      changed: 2,
      needsLook: 1,
      pricingBeforeHome: true,
      plainLanguage: true,
      captioned: true
    }
  );
});

test("an approver can inspect before and after images with an accessible touch control", () => {
  const { html } = generateReport(evidence);

  assert.deepEqual(
    {
      labelledComparison: html.includes('aria-label="Compare before and after for Pricing"'),
      rangeControl: html.includes('type="range"') && html.includes('aria-valuetext="50% after"'),
      touchTarget: html.includes("min-height:44px"),
      tapFallback: html.includes("data-diff-toggle"),
      images: html.includes("images/pricing-before.png") && html.includes("images/pricing-after.png")
    },
    {
      labelledComparison: true,
      rangeControl: true,
      touchTarget: true,
      tapFallback: true,
      images: true
    }
  );
});

test("a site-wide update is explained as one change with extra pages collapsed", () => {
  const pages = ["Home", "Pricing", "About", "Blog", "Contact"].map((title, index) => ({
    route: index === 0 ? "/" : `/${title.toLowerCase()}`,
    title,
    status: index < 4 ? "expected-change" : "pass",
    diffRatio: (5 - index) / 100,
    productionImage: `images/${index}-before.png`,
    previewImage: `images/${index}-after.png`
  }));

  const { html } = generateReport({ ...evidence, pages });

  assert.deepEqual(
    {
      headline: html.includes("This update touches the whole site"),
      explanation: html.includes("common site-wide update"),
      overflowCollapsed: html.includes("Show 1 more changed page") && html.includes("<details")
    },
    { headline: true, explanation: true, overflowCollapsed: true }
  );
});

test("an unchanged evidence bundle reports that nothing visible changed without empty navigation", () => {
  const pages = evidence.pages.map((page) => ({ ...page, status: "pass", diffRatio: 0 }));

  const { html } = generateReport({ ...evidence, pages });

  assert.deepEqual(
    {
      clearOutcome: html.includes("0 pages changed as planned"),
      noEmptyCounter: !html.includes("1 / 0"),
      noNavigation: !html.includes("data-next aria-label")
    },
    { clearOutcome: true, noEmptyCounter: true, noNavigation: true }
  );
});

test("an incomplete review leads with pages that could not be checked", () => {
  const pages = evidence.pages.map((page, index) => ({
    ...page,
    caption: undefined,
    status: index < 2 ? "infra-error" : "pass",
    diffRatio: 0
  }));

  const { html } = generateReport({ ...evidence, pages });

  assert.deepEqual(
    {
      warningHeadline: html.includes("2 pages couldn’t be checked"),
      honestSummary: html.includes("This review is incomplete"),
      grammaticalCaption: html.includes("Home could not be checked.") && !html.includes("is couldn't check"),
      notClear: !html.includes("0 pages changed as planned")
    },
    { warningHeadline: true, honestSummary: true, grammaticalCaption: true, notClear: true }
  );
});
