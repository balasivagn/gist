import type { PullRequestIdentity } from "./types";

const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_SHA = /^[A-Fa-f0-9]{6,64}$/;

export function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value;
}

export function pullRequestRevision(
  value: Partial<PullRequestIdentity> | null | undefined,
  field = "identity",
): PullRequestIdentity {
  if (!value || !SAFE_REPOSITORY.test(value.repository || "")) {
    throw new TypeError(`${field}.repository must be an owner/repository name`);
  }
  if (!Number.isInteger(value.pullRequest) || (value.pullRequest ?? 0) < 1) {
    throw new TypeError(`${field}.pullRequest must be a positive integer`);
  }
  if (!SAFE_SHA.test(value.headSha || "")) {
    throw new TypeError(`${field}.headSha must be a hexadecimal revision`);
  }
  return Object.freeze({
    repository: value.repository!,
    pullRequest: value.pullRequest!,
    headSha: value.headSha!,
  });
}
