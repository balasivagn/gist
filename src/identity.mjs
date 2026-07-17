const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_SHA = /^[A-Fa-f0-9]{6,64}$/;

export function requireNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

export function pullRequestRevision(value, field = "identity") {
  if (!value || !SAFE_REPOSITORY.test(value.repository || "")) {
    throw new TypeError(`${field}.repository must be an owner/repository name`);
  }
  if (!Number.isInteger(value.pullRequest) || value.pullRequest < 1) {
    throw new TypeError(`${field}.pullRequest must be a positive integer`);
  }
  if (!SAFE_SHA.test(value.headSha || "")) {
    throw new TypeError(`${field}.headSha must be a hexadecimal revision`);
  }
  return Object.freeze({
    repository: value.repository,
    pullRequest: value.pullRequest,
    headSha: value.headSha
  });
}
