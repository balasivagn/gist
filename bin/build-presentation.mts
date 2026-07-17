import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildDirectedPresentation } from "../lib/domain/presentation";
import { directScenesWithAnthropic } from "../lib/ai/scene-director";
import { enforceReportBudgets } from "../src/budgets.mjs";

const configPath = process.argv[2];
const evidencePath = process.argv[3];
const outputPath = process.argv[4];

const config = JSON.parse(await readFile(resolve(configPath), "utf8"));
const evidence = JSON.parse(await readFile(resolve(evidencePath), "utf8"));
const presentation = await buildDirectedPresentation(evidence, {
  direct: async (directed) =>
    directScenesWithAnthropic({
      evidence: directed,
      assetsDirectory: resolve(outputPath, "assets"),
      fetchImages: false,
    }),
});
const artifact = JSON.stringify({ evidence, presentation });
enforceReportBudgets({ evidence, html: artifact, limits: config.limits });
await mkdir(dirname(resolve(outputPath, "presentation.json")), { recursive: true });
await writeFile(
  resolve(outputPath, "presentation.json"),
  `${JSON.stringify(presentation, null, 2)}\n`,
  "utf8",
);
await writeFile(resolve(outputPath, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`${resolve(outputPath)}\n`);
