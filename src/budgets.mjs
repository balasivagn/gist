function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${field} must be a positive integer`);
  return value;
}

export function enforceReportBudgets({ evidence, html, limits }) {
  const maxPages = positiveInteger(limits?.maxPages, "limits.maxPages");
  const maxArtifactBytes = positiveInteger(limits?.maxArtifactBytes, "limits.maxArtifactBytes");
  if (evidence.pages.length > maxPages) {
    throw new RangeError(`${evidence.pages.length} pages exceeds maxPages ${maxPages}`);
  }
  if (limits.maxCaptureHeightPx !== undefined) {
    const maxCaptureHeightPx = positiveInteger(limits.maxCaptureHeightPx, "limits.maxCaptureHeightPx");
    const oversized = evidence.pages.find((page) => Number.isFinite(page.captureHeightPx) && page.captureHeightPx > maxCaptureHeightPx);
    if (oversized) {
      throw new RangeError(`${oversized.route} capture height ${oversized.captureHeightPx}px exceeds maxCaptureHeightPx ${maxCaptureHeightPx}px`);
    }
  }
  const artifactBytes = Buffer.byteLength(html, "utf8");
  if (artifactBytes > maxArtifactBytes) {
    throw new RangeError(`${artifactBytes} bytes exceeds maxArtifactBytes ${maxArtifactBytes}`);
  }
}
