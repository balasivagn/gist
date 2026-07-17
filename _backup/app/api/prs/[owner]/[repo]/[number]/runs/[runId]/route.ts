import { NextResponse } from "next/server";
import { getRun } from "@/lib/store/report-store";
import { getReportRoot } from "@/lib/store/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { owner: string; repo: string; number: string; runId: string };

export async function GET(_request: Request, context: { params: Promise<Params> }) {
  const { owner, repo, number, runId } = await context.params;
  const pullRequest = Number(number);
  if (!Number.isInteger(pullRequest)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const run = await getRun(getReportRoot(), `${owner}/${repo}`, pullRequest, runId);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ run });
}
