/**
 * Bounded-execution budgets for capture. Kept in one place so a change can't
 * drift between the capture loop and the runner. Ported from the balanceflo
 * QA engine (qa/shared/timeouts.mjs), trimmed to what a local run needs.
 */

export const TIMEOUTS_MS = Object.freeze({
  navigation: 20_000,
  fontReadiness: 5_000,
  screenshot: 30_000,
});

export const CAPTURE_LIMITS = Object.freeze({
  // Enough viewport-height steps to walk a tall page all the way to the height
  // cap (50000px / ~800px viewport ≈ 63) without stopping early. The loop exits
  // as soon as it reaches the real bottom, so most pages use far fewer.
  maxScrollSteps: 80,
  maxCaptureHeightPx: 50_000,
  finalSettleMs: 500,
});

export class InfraTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} exceeded its ${ms}ms budget`);
    this.name = "InfraTimeoutError";
  }
}

/** Race a promise against a bounded timeout; rejects with InfraTimeoutError. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new InfraTimeoutError(label, ms)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
