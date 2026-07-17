import { NextResponse } from "next/server";
import { listRuns } from "@/lib/store/report-store";
import { getReportRoot } from "@/lib/store/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { owner: string; repo: string; number: string };

export async function GET(_request: Request, context: { params: Promise<Params> }) {
  const { owner, repo, number } = await context.params;
  const pullRequest = Number(number);
  if (!Number.isInteger(pullRequest)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const runs = await listRuns(getReportRoot(), `${owner}/${repo}`, pullRequest);
  return NextResponse.json({ runs });
}
