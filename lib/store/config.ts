import { resolve } from "node:path";

export function getReportRoot() {
  return resolve(process.env.REPORT_ROOT || ".data/reports");
}

export function getIngestToken() {
  return process.env.GIST_INGEST_TOKEN || "";
}

export function getPublicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export function hostedPrUrl(baseUrl: string, repository: string, pullRequest: number) {
  return `${baseUrl.replace(/\/$/, "")}/pr/${repository}/${pullRequest}`;
}
