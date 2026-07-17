import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportView } from "@/app/components/report-view";
import { getLatestRun } from "@/lib/store/report-store";
import { getReportRoot } from "@/lib/store/config";

export const dynamic = "force-dynamic";

type Params = { owner: string; repo: string; number: string };

export default async function LatestReportPage({ params }: { params: Promise<Params> }) {
  const { owner, repo, number } = await params;
  const repository = `${owner}/${repo}`;
  const pullRequest = Number(number);
  if (!Number.isInteger(pullRequest)) notFound();

  const run = await getLatestRun(getReportRoot(), repository, pullRequest);
  if (!run) notFound();

  return (
    <>
      <p className="meta" style={{ marginBottom: "1rem" }}>
        <Link href={`/pr/${repository}/${pullRequest}/runs`}>All runs for this pull request</Link>
      </p>
      <ReportView run={run} />
    </>
  );
}
