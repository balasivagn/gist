import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportView } from "@/app/components/report-view";
import { getRun } from "@/lib/store/report-store";
import { getReportRoot } from "@/lib/store/config";

export const dynamic = "force-dynamic";

type Params = { owner: string; repo: string; number: string; runId: string };

export default async function RunReportPage({ params }: { params: Promise<Params> }) {
  const { owner, repo, number, runId } = await params;
  const repository = `${owner}/${repo}`;
  const pullRequest = Number(number);
  if (!Number.isInteger(pullRequest)) notFound();

  const run = await getRun(getReportRoot(), repository, pullRequest, runId);
  if (!run) notFound();

  return (
    <>
      <p className="meta" style={{ marginBottom: "1rem" }}>
        <Link href={`/pr/${repository}/${pullRequest}/runs`}>All runs</Link>
        {" · "}
        <Link href={`/pr/${repository}/${pullRequest}`}>Latest</Link>
      </p>
      <ReportView run={run} />
    </>
  );
}
