/**
 * Environment preflight for `gist run`. The goal: when something is missing,
 * highlight it with an actionable message instead of failing on a cryptic
 * downstream error. Distinguishes REQUIRED (blocks the run) from OPTIONAL
 * (degrades gracefully — e.g. no gh just means you supply --head yourself).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { access } from "node:fs/promises";
import { configExists } from "./store.js";

const exec = promisify(execFile);

/** True if a CLI is on PATH (any exit code — we only care that it runs). */
async function hasCommand(cmd: string): Promise<boolean> {
  try {
    await exec(cmd, ["--version"], { timeout: 8_000 });
    return true;
  } catch (err) {
    // A non-zero exit still means the binary exists; ENOENT means it doesn't.
    return !(err && typeof err === "object" && (err as { code?: string }).code === "ENOENT");
  }
}

async function chromiumInstalled(): Promise<boolean> {
  try {
    const p = chromium.executablePath();
    if (!p) return false;
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export interface PreflightInput {
  cwd: string;
  /** True when --head was supplied, so gh is not needed for this run. */
  headOverridden: boolean;
}

export interface PreflightReport {
  ok: boolean;
  /** Blocking problems — the run should not start. */
  errors: string[];
  /** Non-blocking notes — the run continues, possibly degraded. */
  warnings: string[];
}

export async function preflight(input: PreflightInput): Promise<PreflightReport> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // REQUIRED: config must exist (written by `gist init`).
  if (!(await configExists(input.cwd))) {
    errors.push(
      "No .gist/config.json — run `gist init` first (it also installs the browser).",
    );
  }

  // REQUIRED: the Playwright browser must be installed.
  if (!(await chromiumInstalled())) {
    errors.push(
      "The Playwright browser isn't installed — run `gist init` (or `npx playwright install chromium`).",
    );
  }

  // OPTIONAL: gh. Only needed to auto-resolve the preview URL. If --head is
  // given we don't touch gh at all, so stay silent in that case.
  if (!input.headOverridden && !(await hasCommand("gh"))) {
    warnings.push(
      "GitHub CLI (`gh`) not found — can't auto-detect the PR's preview URL. " +
        "Install it (https://cli.github.com) or pass the preview URL with --head <url>.",
    );
  }

  // OPTIONAL: git. Used for local PR metadata fallback; a run still works
  // without it (the title just stays generic).
  if (!(await hasCommand("git"))) {
    warnings.push(
      "`git` not found — PR metadata (branch, commit) will be blank. This does not block the run.",
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}
