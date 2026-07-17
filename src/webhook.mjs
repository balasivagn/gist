import { createHmac, timingSafeEqual } from "node:crypto";

function unauthorized() {
  const error = new Error("Invalid GitHub webhook signature");
  error.statusCode = 401;
  return error;
}

function verifySignature(rawBody, signature, secret) {
  if (typeof rawBody !== "string" || typeof signature !== "string" || typeof secret !== "string") return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

const SUPPORTED_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);

export async function handlePullRequestWebhook({ rawBody, signature, secret, reportBaseUrl, jobs, comments }) {
  if (!verifySignature(rawBody, signature, secret)) throw unauthorized();
  const event = JSON.parse(rawBody);
  if (!SUPPORTED_ACTIONS.has(event.action)) return { accepted: false, queued: false };
  const repository = event.repository?.full_name;
  const pullRequest = event.pull_request?.number;
  const headSha = event.pull_request?.head?.sha;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "") || !Number.isInteger(pullRequest) || !/^[A-Fa-f0-9]{6,64}$/.test(headSha || "")) {
    throw new TypeError("Pull-request webhook payload is missing a safe repository, number, or head revision");
  }
  const key = `${repository}#${pullRequest}@${headSha}`;
  const job = { repository, pullRequest, headSha, title: event.pull_request.title };
  const queued = await jobs.enqueueOnce(key, job);
  const link = `${String(reportBaseUrl).replace(/\/$/, "")}/pr/${repository}/${pullRequest}`;
  await comments.upsert({
    repository,
    pullRequest,
    marker: "<!-- gist-report -->",
    body: `<!-- gist-report -->\n### Gist is building your review\n\n[Open the website change report](${link})`
  });
  return { accepted: true, queued, key, link };
}
