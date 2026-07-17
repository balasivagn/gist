import Link from "next/link";
import { notFound } from "next/navigation";
import { listRuns } from "@/lib/store/report-store";
import { getReportRoot } from "@/lib/store/config";

export const dynamic = "force-dynamic";

type Params = { owner: string; repo: string; number: string };

export default async function RunsPage({ params }: { params: Promise<Params> }) {
  const { owner, repo, number } = await params;
  const repository = `${owner}/${repo}`;
  const pullRequest = Number(number);
  if (!Number.isInteger(pullRequest)) notFound();

  const runs = await listRuns(getReportRoot(), repository, pullRequest);
  if (runs.length === 0) notFound();

  return (
    <section>
      <p className="meta">
        <Link href="/">All pull requests</Link>
        {" · "}
        <Link href={`/pr/${repository}/${pullRequest}`}>Latest report</Link>
      </p>
      <p className="eyebrow">{repository}</p>
      <h1>Pull request #{pullRequest}</h1>
      <p className="lede">Each push or re-run is stored as its own review with a summary.</p>
      <div className="list" style={{ marginTop: "1.5rem" }}>
        {runs.map((run) => (
          <article key={run.runId} className="list-card">
            <Link href={`/pr/${repository}/${pullRequest}/runs/${run.runId}`}>
              <p className="meta">
                {run.state} · {run.headSha.slice(0, 12)} · {new Date(run.updatedAt).toLocaleString()}
              </p>
              <h3>{run.headline || "Building your review…"}</h3>
              <p className="lede">
                {run.counts
                  ? `${run.counts.changed} changed · ${run.counts.needsLook} need a look · ${run.counts.broken} couldn’t check`
                  : "Waiting for capture"}
              </p>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
