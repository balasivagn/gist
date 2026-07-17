import { NextResponse } from "next/server";
import { readAsset } from "@/lib/store/report-store";
import { getReportRoot } from "@/lib/store/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  owner: string;
  repo: string;
  number: string;
  runId: string;
  filename: string;
};

export async function GET(_request: Request, context: { params: Promise<Params> }) {
  const { owner, repo, number, runId, filename } = await context.params;
  const pullRequest = Number(number);
  if (!Number.isInteger(pullRequest)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const asset = await readAsset({
    reportRoot: getReportRoot(),
    repository: `${owner}/${repo}`,
    pullRequest,
    runId,
    filename,
  });
  if (!asset) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(asset.body), {
    headers: {
      "content-type": asset.contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
