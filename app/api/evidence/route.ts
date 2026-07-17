import { handleEvidenceIngest } from "@/lib/ingest/handlers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleEvidenceIngest(request);
}
