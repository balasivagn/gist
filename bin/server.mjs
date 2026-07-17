#!/usr/bin/env node
import { createServer } from "node:http";
import { resolve } from "node:path";

import { handleGistRequest } from "../src/hosted-service.mjs";

const port = Number(process.env.PORT || 3000);
const reportRoot = resolve(process.env.REPORT_ROOT || ".data/reports");
const ingestToken = process.env.GIST_INGEST_TOKEN;
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const maxBodyBytes = Number(process.env.MAX_INGEST_BYTES || 60_000_000);

if (!ingestToken) throw new Error("GIST_INGEST_TOKEN is required");

const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    let received = 0;
    for await (const chunk of incoming) {
      received += chunk.length;
      if (received > maxBodyBytes) {
        outgoing.writeHead(413, { "content-type": "application/json" });
        outgoing.end('{"error":"report exceeds ingest budget"}');
        return;
      }
      chunks.push(chunk);
    }
    const origin = publicBaseUrl.replace(/\/$/, "");
    const options = { method: incoming.method, headers: incoming.headers };
    if (!["GET", "HEAD"].includes(incoming.method) && chunks.length > 0) options.body = Buffer.concat(chunks);
    const response = await handleGistRequest(new Request(`${origin}${incoming.url}`, options), {
      reportRoot,
      ingestToken,
      publicBaseUrl: origin,
      maxBodyBytes
    });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ error: "internal error" }));
    console.error(error);
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Gist listening on ${port}`);
});
