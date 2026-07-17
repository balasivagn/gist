export async function uploadReport({ baseUrl, token, html, status, fetchImpl = fetch }) {
  const endpoint = new URL("/api/ingest", baseUrl);
  if (endpoint.protocol !== "https:") throw new TypeError("Gist ingest URL must use HTTPS");
  if (typeof token !== "string" || token.trim() === "") throw new TypeError("GIST_TOKEN is required to publish");
  const response = await fetchImpl(endpoint.href, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ html, status })
  });
  if (!response.ok) throw new Error(`Gist ingest failed with HTTP ${response.status}`);
  return response.json();
}
