#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { importBalancefloRun } from "../src/balanceflo-import.mjs";

function option(name, required = true) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (required && !value) throw new TypeError(`Missing --${name}`);
  return value;
}

const output = resolve(option("out"));
const evidence = await importBalancefloRun({
  runDirectory: resolve(option("run")),
  repository: option("repository"),
  pullRequest: option("pr"),
  title: option("title", false)
});
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`${output}\n`);
