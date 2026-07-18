/**
 * `gist init` — one-time setup, kept out of `npm install` so installing the
 * package stays light. It (1) installs the Playwright Chromium browser (the
 * ~heavy download deferred from postinstall) and (2) writes a starter
 * .gist/config.json the user then edits.
 */
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { access, appendFile, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import {
  configExists,
  writeConfig,
  type GistConfig,
} from "./store.js";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);

function makeDefaultConfig(productionUrl: string): GistConfig {
  return {
    version: 1,
    productionUrl,
    viewports: [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ],
    routes: ["/"],
    diffPercentThreshold: 0.5,
    pixelThreshold: 0.1,
  };
}

/**
 * Ask for the production URL interactively. Falls back to a placeholder when
 * stdin is not a TTY (CI, piped input, etc.).
 */
async function promptProductionUrl(): Promise<string> {
  if (!process.stdin.isTTY) return "https://example.com";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      "Production URL (the live site gist run will compare against): ",
      (answer) => {
        rl.close();
        const trimmed = answer.trim();
        resolve(trimmed || "https://example.com");
      },
    );
  });
}

/** True once Chromium is already installed (skips the download). */
async function chromiumInstalled(): Promise<boolean> {
  try {
    // executablePath() throws if the browser binary is not present.
    const p = chromium.executablePath();
    if (!p) return false;
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Install the Playwright Chromium browser via the bundled CLI. */
async function installChromium(log: (m: string) => void): Promise<void> {
  log("Installing the Playwright Chromium browser (first run only)…");
  // `playwright install chromium` — invoked through node so it works whether
  // the package is installed globally or locally.
  await exec(
    process.execPath,
    [require.resolve("playwright/cli.js"), "install", "chromium"],
    { timeout: 300_000 },
  );
  log("Chromium installed.");
}

/** Ensure `.gist/` is gitignored, so a run's screenshots never get committed. */
async function ensureGitignore(
  cwd: string,
  log: (m: string) => void,
): Promise<void> {
  const file = path.join(cwd, ".gitignore");
  let current = "";
  try {
    current = await readFile(file, "utf8");
  } catch {
    /* no .gitignore yet — we'll create it */
  }
  const ignored = current
    .split(/\r?\n/)
    .some((line) => line.trim().replace(/\/$/, "") === ".gist");
  if (ignored) return;
  const prefix = current === "" || current.endsWith("\n") ? "" : "\n";
  await appendFile(file, `${prefix}.gist/\n`, "utf8");
  log("Added .gist/ to .gitignore.");
}

export interface InitResult {
  installedBrowser: boolean;
  wroteConfig: boolean;
}

export async function runInit(
  cwd: string,
  log: (m: string) => void = console.log,
): Promise<InitResult> {
  let installedBrowser = false;
  if (await chromiumInstalled()) {
    log("Chromium already installed — skipping download.");
  } else {
    await installChromium(log);
    installedBrowser = true;
  }

  let wroteConfig = false;
  if (await configExists(cwd)) {
    log(".gist/config.json already exists — leaving it untouched.");
  } else {
    const productionUrl = await promptProductionUrl();
    await writeConfig(cwd, makeDefaultConfig(productionUrl));
    log(`Wrote .gist/config.json with productionUrl: ${productionUrl}`);
    log("Edit .gist/config.json to add routes and adjust viewports.");
    wroteConfig = true;
  }

  await ensureGitignore(cwd, log);

  return { installedBrowser, wroteConfig };
}
