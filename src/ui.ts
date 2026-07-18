/**
 * `gist ui` — the local viewer (part 2). A tiny zero-dependency Node http
 * server over the `.gist/` tree: it lists PRs → runs → summary and serves the
 * screenshots. It never calls an LLM (the /gist skill wrote summary.md already);
 * it only reads the data surface. Deliberately not Next.js — keeps the install
 * light and the "local, single command" promise intact.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  GIST_DIR,
  listPrs,
  listRuns,
  readEvidence,
  readPrMeta,
  readRegions,
  readSummary,
  screenshotsDir,
} from "./store.js";
import { renderShell } from "./ui-shell.js";

async function collectState(cwd: string) {
  const prNumbers = await listPrs(cwd);
  const prs = [];
  for (const pr of prNumbers) {
    const meta = await readPrMeta(cwd, pr);
    const runIds = await listRuns(cwd, pr);
    const runs = [];
    for (const runId of runIds) {
      try {
        const evidence = await readEvidence(cwd, pr, runId);
        const summary = await readSummary(cwd, pr, runId);
        const regions = await readRegions(cwd, pr, runId);
        runs.push({ evidence, summary, regions });
      } catch {
        /* skip a half-written run */
      }
    }
    prs.push({ pr, meta, runs });
  }
  return { prs };
}

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
};

async function serveScreenshot(
  cwd: string,
  url: URL,
  res: ServerResponse,
): Promise<boolean> {
  // /shot/<pr>/<runId>/<filename>
  const m = /^\/shot\/(\d+)\/([^/]+)\/([^/]+)$/.exec(url.pathname);
  if (!m) return false;
  const [, prRaw, runId, filename] = m;
  if (filename!.includes("..") || path.isAbsolute(filename!)) {
    res.writeHead(400).end("bad filename");
    return true;
  }
  const file = path.join(screenshotsDir(cwd, Number(prRaw), runId!), filename!);
  try {
    const buffer = await fs.readFile(file);
    res.writeHead(200, {
      "content-type": CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
    });
    res.end(buffer);
  } catch {
    res.writeHead(404).end("not found");
  }
  return true;
}

export interface UiOptions {
  cwd: string;
  port?: number;
  host?: string;
  /** Open the URL in the default browser once the server is up (default true). */
  open?: boolean;
}

/** Best-effort open a URL in the OS default browser; never throws. */
function openBrowser(url: string): void {
  let cmd = "xdg-open";
  if (process.platform === "darwin") cmd = "open";
  else if (process.platform === "win32") cmd = "cmd";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* opening is a convenience — the printed URL is the fallback */
  }
}

export async function startUi(opts: UiOptions): Promise<{ url: string; close: () => Promise<void> }> {
  const cwd = opts.cwd;
  const port = opts.port ?? 4100;
  const host = opts.host ?? "127.0.0.1";

  // Fail early with guidance if there's nothing to show.
  try {
    await fs.access(path.join(cwd, GIST_DIR));
  } catch {
    throw new Error(
      `No ${GIST_DIR}/ found in ${cwd}. Run \`gist init\` then \`gist run --pr <n>\` first.`,
    );
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    try {
      if (url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(renderShell());
        return;
      }
      if (url.pathname === "/api/state") {
        const state = await collectState(cwd);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(state));
        return;
      }
      if (await serveScreenshot(cwd, url, res)) return;
      res.writeHead(404).end("not found");
    } catch (err) {
      res.writeHead(500).end(err instanceof Error ? err.message : "error");
    }
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const url = `http://${host}:${port}`;
  if (opts.open !== false) openBrowser(url);
  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  };
}
