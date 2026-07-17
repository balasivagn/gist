#!/usr/bin/env node
/**
 * gist — approve website changes without reading code.
 *
 *   gist init                     install the browser + write .gist/config.json
 *   gist run --pr <n> [opts]      capture before/after, diff, write evidence
 *   gist ui [--port <p>]          open the local viewer over .gist/
 *
 * The AI walkthrough is generated separately by the `/gist` skill inside your
 * coding agent, which reads .gist/**\/evidence.json and writes summary.md.
 */
import { runInit } from "../src/init.js";
import { runCapture } from "../src/run.js";
import { installSkill } from "../src/skill.js";
import { startUi } from "../src/ui.js";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function listFlag(name: string): string[] | undefined {
  const v = flag(name);
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
}

const USAGE = `gist — approve website changes without reading code

Usage:
  gist init                          install the browser, scaffold .gist/config.json, add the /gist skill
  gist run --pr <n> [options]        capture before/after screenshots, diff, write evidence
  gist ui [--port <p>] [--no-open]   serve the local review UI over .gist/ (opens the browser)
  gist skill install                 (re)install the /gist skill into .claude/skills/

Options for run:
  --pr <n>          pull request number (uses gh to resolve the preview URL)
  --base <url>      override the base/production URL
  --head <url>      override the head/preview URL
  --affected <a,b>  routes this PR is expected to change

After a run, generate the plain-English walkthrough with the /gist skill
inside your coding agent.`;

async function main(): Promise<void> {
  const cwd = process.cwd();
  const command = process.argv[2];

  switch (command) {
    case "init":
      await runInit(cwd);
      await installSkill(cwd);
      return;

    case "skill":
      if (process.argv[3] === "install") {
        await installSkill(cwd);
      } else {
        process.stderr.write("Usage: gist skill install\n");
        process.exitCode = 1;
      }
      return;

    case "run": {
      const pr = flag("pr");
      if (!pr || !/^\d+$/.test(pr)) {
        process.stderr.write("gist run requires --pr <number>\n");
        process.exitCode = 1;
        return;
      }
      await runCapture({
        cwd,
        pr: Number(pr),
        baseUrlOverride: flag("base"),
        headUrlOverride: flag("head"),
        affectedRoutes: listFlag("affected"),
      });
      return;
    }

    case "ui": {
      const port = flag("port");
      const { url } = await startUi({
        cwd,
        port: port ? Number(port) : undefined,
        open: !process.argv.includes("--no-open"),
      });
      process.stdout.write(`Gist UI running at ${url}  (Ctrl+C to stop)\n`);
      return;
    }

    default:
      process.stdout.write(`${USAGE}\n`);
      if (command && command !== "help" && command !== "--help") {
        process.exitCode = 1;
      }
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
