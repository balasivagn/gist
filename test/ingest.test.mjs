import assert from "node:assert/strict";
import test from "node:test";

import { uploadReport } from "../src/ingest.mjs";

test("self-host publication uploads the report to the configured Gist ingest boundary", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 201, async json() { return { url: "https://gist.app/pr/acme/site/4" }; } };
  };

  const result = await uploadReport({
    baseUrl: "https://gist.app/",
    token: "repo-token",
    html: "<html>report</html>",
    status: { state: "complete", repository: "acme/site", pullRequest: 4 },
    fetchImpl
  });

  const payload = JSON.parse(requests[0].options.body);
  assert.deepEqual(
    {
      endpoint: requests[0].url,
      authorization: requests[0].options.headers.authorization,
      contentType: requests[0].options.headers["content-type"],
      repository: payload.status.repository,
      html: payload.html,
      reportUrl: result.url
    },
    {
      endpoint: "https://gist.app/api/ingest",
      authorization: "Bearer repo-token",
      contentType: "application/json",
      repository: "acme/site",
      html: "<html>report</html>",
      reportUrl: "https://gist.app/pr/acme/site/4"
    }
  );
});
