/**
 * `gist skill install` — copy the bundled /gist skill into a project's
 * .claude/skills/ so the coding agent can see it. Doing this in code (instead
 * of a copy-paste shell snippet in the docs) removes the single most fragile
 * step of setup: the skill's real location depends on how the package was
 * installed (nvm, custom prefix, local vs global), but the running CLI always
 * knows where it lives relative to itself.
 */
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The skill directory shipped inside this package (…/skill/gist). */
function bundledSkillDir(): string {
  // this file is at <pkg>/src/skill.ts → skill lives at <pkg>/skill/gist
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "skill", "gist");
}

export interface SkillInstallResult {
  dest: string;
}

export async function installSkill(
  cwd: string,
  log: (m: string) => void = console.log,
): Promise<SkillInstallResult> {
  const src = bundledSkillDir();
  const dest = path.join(cwd, ".claude", "skills", "gist");
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
  log(`Installed the /gist skill → ${path.relative(cwd, dest)}`);
  log("In Claude Code, run `/gist` after a `gist run` to write the summary.");
  return { dest };
}
