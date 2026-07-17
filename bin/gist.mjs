#!/usr/bin/env node
/**
 * Launcher: runs the TypeScript CLI (bin/gist.ts) through tsx so users never
 * need a build step or a global tsx. tsx is a runtime dependency for this
 * reason. Argv after the command is forwarded untouched.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, "gist.ts");
const tsxBin = require.resolve("tsx/cli");

const child = spawn(process.execPath, [tsxBin, entry, ...process.argv.slice(2)], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
