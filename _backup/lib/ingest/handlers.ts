import { pullRequestRevision } from "../domain/identity";
import type { Evidence } from "../domain/types";
import { hostedPrUrl, getPublicBaseUrl, getReportRoot } from "../store/config";
import { ingestBuilding, ingestEvidence } from "../store/report-store";
import { readJsonBody, requireIngestAuth, unauthorized } from "./auth";

export async function handleBuildingIngest(request: Request) {
  if (!requireIngestAuth(request)) return unauthorized();
  try {
    const body = await readJsonBody(request);
    const identity = pullRequestRevision(body.identity, "identity");
    const saved = await ingestBuilding({ reportRoot: getReportRoot(), identity });
    return Response.json(
      {
        url: hostedPrUrl(getPublicBaseUrl(), identity.repository, identity.pullRequest),
        runId: saved.runId,
      },
      { status: 201 },
    );
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 400;
    return Response.json({ error: (error as Error).message }, { status });
  }
}

export async function handleEvidenceIngest(request: Request) {
  if (!requireIngestAuth(request)) return unauthorized();
  try {
    const body = await readJsonBody(request);
    const evidence = body.evidence as Evidence;
    const saved = await ingestEvidence({
      reportRoot: getReportRoot(),
      evidence,
      maxPages: 5,
    });
    return Response.json(
      {
        url: hostedPrUrl(getPublicBaseUrl(), evidence.repository, evidence.pullRequest.number),
        runId: saved.runId,
      },
      { status: 201 },
    );
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 400;
    return Response.json({ error: (error as Error).message }, { status });
  }
}
