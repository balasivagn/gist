export async function uploadEvidence({ baseUrl, token, evidence, fetchImpl = fetch }) {
  const endpoint = new URL("/api/ingest/evidence", baseUrl);
  if (!["http:", "https:"].includes(endpoint.protocol)) {
    throw new TypeError("Gist ingest URL must use HTTP or HTTPS");
  }
  if (typeof token !== "string" || token.trim() === "") {
    throw new TypeError("GIST_TOKEN is required to publish");
  }
  const response = await fetchImpl(endpoint.href, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ evidence }),
  });
  if (!response.ok) throw new Error(`Gist ingest failed with HTTP ${response.status}`);
  return response.json();
}

/** @deprecated Prefer uploadEvidence — HTML ingest is no longer the primary path. */
export async function uploadReport({ baseUrl, token, html, status, fetchImpl = fetch }) {
  const endpoint = new URL("/api/ingest/evidence", baseUrl);
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost") {
    throw new TypeError("Gist ingest URL must use HTTPS");
  }
  if (typeof token !== "string" || token.trim() === "") {
    throw new TypeError("GIST_TOKEN is required to publish");
  }
  void html;
  void status;
  throw new TypeError("uploadReport is deprecated; use uploadEvidence with structured evidence");
}
