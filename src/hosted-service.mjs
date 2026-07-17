/**
 * @deprecated Replaced by the Next.js App Router ingest + React surface.
 * Prefer `npm start` (next start) and `/api/ingest/*` routes.
 */
export async function handleGistRequest() {
  throw new Error(
    "hosted-service.mjs is deprecated; run the Next.js app (`npm start`) and POST to /api/ingest/evidence",
  );
}
