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

  // NOTE: we do NOT globally disable animations here. Doing so freezes
  // reveal-on-scroll content (opacity:0 → visible) at its hidden initial state,
  // which is the classic "blank/black below the fold" bug — the section exists
  // in layout but never becomes visible, and two pages that both fail this way
  // come out byte-identical (a false "no change"). Animations are frozen only
  // at the very end, once content has actually revealed, for a crisp frame.

  // Scroll to the bottom to trigger lazy-loaded/reveal-on-scroll content. The
  // loop is driven by the live scrollHeight (which grows as content loads) and
  // is bounded only by step count and the height cap — never stopped early by a
  // "height looks stable" heuristic, because early sections can be static while
  // later ones still need scrolling to reveal.
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  let truncated = false;
  let y = 0;
  for (let step = 0; step < CAPTURE_LIMITS.maxScrollSteps; step++) {
    if (y >= CAPTURE_LIMITS.maxCaptureHeightPx) {
      truncated = true;
      break;
    }
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(150);
    const height = await page.evaluate(() => document.body.scrollHeight);
    // Stop once we've scrolled past the (possibly grown) bottom.
    if (y + viewport.height >= height) {
      // One more settle at the very bottom so the last section reveals/loads.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(150);
      break;
    }
    y += viewport.height;
  }

  // Safety net: force any element still hidden by a reveal-on-scroll animation
  // (opacity:0 / translate / clip) into its visible resting state, so a section
  // that never fired its IntersectionObserver still captures. Best-effort — an
  // unknown reveal system just won't match and is left as-is.
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const s = getComputedStyle(el);
      const hiddenByReveal =
        (Number(s.opacity) === 0 || s.visibility === "hidden") &&
        (s.transitionDuration !== "0s" || s.animationName !== "none");
      if (hiddenByReveal) {
        el.style.setProperty("opacity", "1", "important");
        el.style.setProperty("visibility", "visible", "important");
        el.style.setProperty("transform", "none", "important");
        el.style.setProperty("clip-path", "none", "important");
      }
    }
  });

  await page.evaluate(() => window.scrollTo(0, 0));
  const finalHeight = await page.evaluate(() => document.body.scrollHeight);
  if (finalHeight >= CAPTURE_LIMITS.maxCaptureHeightPx) truncated = true;

  // Bounded, best-effort readiness for fonts and ALL images (including the
  // lazy ones we just scrolled into view — those are exactly the below-fold
  // images that were rendering blank). Never fatal; a slow asset must not hang.
  await withTimeout(
    Promise.all([
      page.evaluate(() => document.fonts.ready),
      page.evaluate(() =>
        Promise.all(
          [...document.images]
            .filter((img) => !img.complete)
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

  // Now freeze animations for a crisp, non-flickering final frame — after the
  // content has been revealed, not before.
  await page.addStyleTag({
    content:
      "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }",
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
