import { NextResponse } from "next/server";
import { listPullRequests } from "@/lib/store/report-store";
import { getReportRoot } from "@/lib/store/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const pullRequests = await listPullRequests(getReportRoot());
  return NextResponse.json({ pullRequests });
}
