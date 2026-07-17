import { assertBearer } from "../store/report-store";
import { getIngestToken } from "../store/config";

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function requireIngestAuth(request: Request) {
  const token = getIngestToken();
  if (!token || !assertBearer(request.headers.get("authorization"), token)) {
    return false;
  }
  return true;
}

export async function readJsonBody(request: Request, maxBytes = 60_000_000) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    const error = new Error("payload exceeds ingest budget");
    (error as Error & { status: number }).status = 413;
    throw error;
  }
  return JSON.parse(raw);
}
