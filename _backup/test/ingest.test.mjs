import assert from "node:assert/strict";
import test from "node:test";

import { uploadEvidence } from "../src/ingest.mjs";

test("self-host publication uploads structured evidence to the Gist ingest boundary", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 201,
      async json() {
        return { url: "https://gist.app/pr/acme/site/4", runId: "abc" };
      },
    };
  };

  const evidence = {
    version: 1,
    repository: "acme/site",
    pullRequest: { number: 4, title: "Add signup", headSha: "abc1234" },
    pages: [{ route: "/", title: "Home", status: "expected-change", diffRatio: 0.1 }],
  };

  const result = await uploadEvidence({
    baseUrl: "https://gist.app/",
    token: "repo-token",
    evidence,
    fetchImpl,
  });

  const payload = JSON.parse(requests[0].options.body);
  assert.deepEqual(
    {
      endpoint: requests[0].url,
      authorization: requests[0].options.headers.authorization,
      contentType: requests[0].options.headers["content-type"],
      repository: payload.evidence.repository,
      reportUrl: result.url,
    },
    {
      endpoint: "https://gist.app/api/ingest/evidence",
      authorization: "Bearer repo-token",
      contentType: "application/json",
      repository: "acme/site",
      reportUrl: "https://gist.app/pr/acme/site/4",
    },
  );
});
