import Link from "next/link";
import { ChangeWalkthrough } from "@/app/components/report-controls";
import type { StoredRun } from "@/lib/domain/types";

export function ReportView({ run }: { run: StoredRun }) {
  if (run.state === "building" || !run.presentation) {
    return (
      <div className="building" aria-live="polite">
        <p className="eyebrow">Website change review</p>
        <h1>Building your review…</h1>
        <p className="lede">
          We’re capturing and comparing the changed pages. This page will update when the run
          completes.
        </p>
        <div className="pulse" />
      </div>
    );
  }

  const { presentation, identity } = run;

  return (
    <article className="report">
      <header className="report-top">
        <p className="meta">
          {identity.repository} · PR #{identity.pullRequest} ·{" "}
          <Link href={`/pr/${identity.repository}/${identity.pullRequest}/runs`}>All runs</Link>
        </p>
        <h1>{presentation.headline}</h1>
        <p className="lede">{presentation.summary}</p>
        <div className="chips" aria-label="Change totals">
          <div className="chip">
            {presentation.counts.changed}
            <span>changed</span>
          </div>
          <div className="chip">
            {presentation.counts.needsLook}
            <span>need a look</span>
          </div>
          <div className="chip">
            {presentation.counts.broken}
            <span>couldn&apos;t check</span>
          </div>
        </div>
      </header>

      <ChangeWalkthrough presentation={presentation} />
    </article>
  );
}
