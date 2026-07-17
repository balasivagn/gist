/**
 * Stabilized full-page screenshot capture. Ported from the balanceflo QA engine
 * (qa/visual-regression/capture.ts) and generalized: the Cloudflare-Access
 * header injection is now a generic per-origin `extraHeaders` map, and the
 * structured stage logger is gone. Deterministic by construction — animations
 * disabled, bounded lazy-load scroll, fonts/critical-images awaited, fixed
 * settle before the shot.
 */
import type { BrowserContext, Page } from "playwright";
import { CAPTURE_LIMITS, TIMEOUTS_MS, withTimeout } from "./limits.js";

/** A navigation/browser-process error — distinct from a real HTTP response,
 * so it can be retried once and never confused with a visual regression. */
export class InfraCaptureError extends Error {}

export interface CaptureResult {
  /** null only for a real HTTP >=400 response on this origin. */
  buffer: Buffer | null;
  truncated: boolean;
}

export interface CaptureOptions {
  /** Headers sent ONLY to the target origin (e.g. auth for a gated preview). */
  extraHeaders?: Record<string, string>;
}

const INFRA_ERROR_PATTERNS = [
  /Timeout \d+ms exceeded/i,
  /net::ERR_/i,
  /has been closed/i,
  /Target (page|context|browser) has crashed/i,
];

function rethrowClassified(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (INFRA_ERROR_PATTERNS.some((re) => re.test(message))) {
    throw new InfraCaptureError(message);
  }
  throw err instanceof Error ? err : new Error(message);
}

/** Stabilized full-page screenshot of a single URL on a single page. */
export async function capture(
  page: Page,
  url: string,
  opts: CaptureOptions = {},
): Promise<CaptureResult> {
  if (opts.extraHeaders && Object.keys(opts.extraHeaders).length > 0) {
    const headers = opts.extraHeaders;
    const targetOrigin = new URL(url).origin;
    await page.route("**/*", async (route) => {
      // Only the target origin gets the extra credential — this intercepts
      // every request the page makes, including third-party fonts/analytics/
      // CDNs, so sending it unconditionally would leak the token to those
      // origins. Compare the full origin (not a string prefix) so a lookalike
      // domain can't pass this check.
      let requestOrigin: string;
      try {
        requestOrigin = new URL(route.request().url()).origin;
      } catch {
        await route.continue();
        return;
      }
      if (requestOrigin === targetOrigin) {
        await route.continue({
          headers: { ...route.request().headers(), ...headers },
        });
      } else {
        await route.continue();
      }
    });
  }

  let response;
  try {
    response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: TIMEOUTS_MS.navigation,
    });
  } catch (err) {
    rethrowClassified(err);
  }
  if (!response || response.status() >= 400) {
    return { buffer: null, truncated: false };
  }

  await page.addStyleTag({
    content:
      "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }",
  });

  // Bounded scroll to trigger lazy-loaded/reveal-on-scroll content: capped by
  // step count and by height, and stops early once height stabilizes.
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  let lastHeight = -1;
  let stableSteps = 0;
  let truncated = false;
  for (let step = 0; step < CAPTURE_LIMITS.maxScrollSteps; step++) {
    const height = await page.evaluate(() => document.body.scrollHeight);
    if (height === lastHeight) {
      if (++stableSteps >= CAPTURE_LIMITS.stableStepsToStop) break;
    } else {
      stableSteps = 0;
    }
    lastHeight = height;
    const y = step * viewport.height;
    if (y >= CAPTURE_LIMITS.maxCaptureHeightPx) {
      truncated = true;
      break;
    }
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  if (lastHeight >= CAPTURE_LIMITS.maxCaptureHeightPx) truncated = true;

  // Bounded, best-effort font/critical-image readiness — never fatal; a slow
  // web font or lazy image must not hang the capture.
  await withTimeout(
    Promise.all([
      page.evaluate(() => document.fonts.ready),
      page.evaluate(() =>
        Promise.all(
          [...document.images]
            .filter((img) => img.loading !== "lazy" && !img.complete)
            .map(
              (img) =>
                new Promise<void>((resolve) => {
                  img.addEventListener("load", () => resolve(), { once: true });
                  img.addEventListener("error", () => resolve(), { once: true });
                }),
            ),
        ),
      ),
    ]),
    TIMEOUTS_MS.fontReadiness,
    "font/critical-image readiness",
  ).catch(() => {
    /* readiness is best-effort — proceed to the settle + screenshot anyway */
  });
  await page.waitForTimeout(CAPTURE_LIMITS.finalSettleMs);

  try {
    const buffer = await withTimeout(
      truncated
        ? page.screenshot({
            clip: {
              x: 0,
              y: 0,
              width: viewport.width,
              height: CAPTURE_LIMITS.maxCaptureHeightPx,
            },
            animations: "disabled",
          })
        : page.screenshot({ fullPage: true, animations: "disabled" }),
      TIMEOUTS_MS.screenshot,
      "screenshot",
    );
    return { buffer, truncated };
  } catch (err) {
    rethrowClassified(err);
  }
}

/**
 * Capture with one retry, only for infrastructure errors (navigation timeout,
 * DNS failure, crashed target) — never for a real HTTP response or a screenshot
 * that simply differs visually. Each attempt gets a fresh page so a crashed
 * page/context doesn't poison the retry.
 */
export async function captureWithRetry(
  context: BrowserContext,
  url: string,
  opts: CaptureOptions = {},
): Promise<CaptureResult & { attempts: number }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const page = await context.newPage();
    try {
      const result = await capture(page, url, opts);
      return { ...result, attempts: attempt };
    } catch (err) {
      lastErr = err;
      if (!(err instanceof InfraCaptureError) || attempt === 2) throw err;
    } finally {
      await page.close().catch(() => {});
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("capture failed");
}
