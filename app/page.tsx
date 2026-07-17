import Link from "next/link";
import { listPullRequests } from "@/lib/store/report-store";
import { getReportRoot } from "@/lib/store/config";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const pullRequests = await listPullRequests(getReportRoot());

  return (
    <section>
      <p className="eyebrow">Reviews</p>
      <h1>Pull requests</h1>
      <p className="lede">Open a pull request to browse its runs and the latest website change review.</p>
      {pullRequests.length === 0 ? (
        <p className="panel" style={{ marginTop: "1.5rem" }}>
          No reviews yet. Ingest evidence with <code>POST /api/ingest/evidence</code>.
        </p>
      ) : (
        <div className="list" style={{ marginTop: "1.5rem" }}>
          {pullRequests.map((pr) => (
            <article key={`${pr.repository}-${pr.pullRequest}`} className="list-card">
              <Link href={`/pr/${pr.repository}/${pr.pullRequest}`}>
                <p className="meta">
                  {pr.repository} · #{pr.pullRequest} · {pr.runCount}{" "}
                  {pr.runCount === 1 ? "run" : "runs"}
                </p>
                <h3>{pr.latestHeadline || "Building your review…"}</h3>
                <p className="lede">
                  {pr.latestCounts
                    ? `${pr.latestCounts.changed} changed · ${pr.latestCounts.needsLook} need a look · ${pr.latestCounts.broken} couldn’t check`
                    : pr.latestState}
                </p>
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
