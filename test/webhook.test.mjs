import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handlePullRequestWebhook } from "../src/webhook.mjs";

const secret = "test-webhook-secret";
const event = {
  action: "opened",
  repository: { full_name: "acme/site" },
  pull_request: { number: 31, head: { sha: "abcdef123456" }, title: "Update pricing" }
};
const rawBody = JSON.stringify(event);
const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

test("an invalid GitHub signature cannot create work or comments", async () => {
  let writes = 0;
  const boundaries = {
    jobs: { async enqueueOnce() { writes += 1; } },
    comments: { async upsert() { writes += 1; } }
  };

  await assert.rejects(
    handlePullRequestWebhook({ rawBody, signature: "sha256=bad", secret, ...boundaries }),
    (error) => error.statusCode === 401
  );
  assert.equal(writes, 0);
});

test("a signed pull-request event queues one revision and upserts one report comment", async () => {
  const queued = new Map();
  const commentWrites = [];
  const boundaries = {
    jobs: {
      async enqueueOnce(key, job) {
        if (queued.has(key)) return false;
        queued.set(key, job);
        return true;
      }
    },
    comments: {
      async upsert(comment) { commentWrites.push(comment); }
    }
  };

  const first = await handlePullRequestWebhook({ rawBody, signature, secret, reportBaseUrl: "https://gist.test", ...boundaries });
  const redelivery = await handlePullRequestWebhook({ rawBody, signature, secret, reportBaseUrl: "https://gist.test", ...boundaries });

  assert.deepEqual(
    {
      firstQueued: first.queued,
      redeliveryQueued: redelivery.queued,
      key: [...queued.keys()][0],
      commentMarkerStable: commentWrites.length === 2 && commentWrites.every((comment) => comment.marker === "<!-- gist-report -->"),
      link: commentWrites[0].body.includes("https://gist.test/pr/acme/site/31")
    },
    {
      firstQueued: true,
      redeliveryQueued: false,
      key: "acme/site#31@abcdef123456",
      commentMarkerStable: true,
      link: true
    }
  );
});
