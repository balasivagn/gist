/**
 * Offline eval harness for the change-review AI pipeline (docs/CHANGE-REVIEW.md §11).
 *
 *   npm run eval            # all fixtures
 *   npm run eval insert-section   # one fixture by name
 *
 * Requires ANTHROPIC_API_KEY. Sends each fixture's before/after/diff PNGs + PR
 * intent to the model under the SOP, forces structured output, and scores it.
 * The fabrication guard (mustNotContain) is a hard fail regardless of other
 * scores — it regression-tests the "Article cards" failure.
 *
 * This is a DEV tool. It is not shipped, not run in `npm test` (which is
 * offline + deterministic), and depends on @anthropic-ai/sdk (a devDependency).
 */
import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REVIEW_SCHEMA, type Expected, type Fixture, type ReviewOutput } from "./schema.js";

const MODEL = "claude-opus-4-8";
const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(EVAL_DIR, "fixtures");

// The SOP, compressed to a system prompt. Mirrors skill/gist/SKILL.md so the
// eval measures the same behaviour the skill is supposed to produce.
const SYSTEM = `You review website changes for a NON-TECHNICAL approver. You are given, for one page: a BEFORE screenshot, an AFTER screenshot, and a DIFF image (red marks changed pixels), plus the PR's stated intent.

Follow this procedure and return ONLY the structured output:

PASS 0 — From the PR intent, list concrete claims it makes (the "ledger").

GATE — Decide how reviewable this page is:
- refuse:viewport-mismatch if before/after are clearly different widths.
- refuse:baseline-mismatch if the BEFORE looks like an entirely different site.
- triage:redesign if nearly the whole page changed (not one inserted section).
- triage:new-page / triage:removed-page if the page exists on only one side.
- analyze otherwise.
If not "analyze", return an empty regions array.

PASS 1 — OBSERVE (analyze only), intent-blind. Find REAL content changes. For each, you MUST cite specific content visible in BOTH before and after (citationBase / citationHead). NO CITATION, NO REGION — never invent an element or label you cannot see. If content merely moved down because something was inserted above it, that is reflow — describe the INSERT, never list the moved-but-identical content as a change.

PASS 2 — VERIFY. Drop any region whose before/after content isn't genuinely different, or that is only movement, or that the diff doesn't support.

PASS 3 — RECONCILE against the ledger. Each surviving region is "intended" (a claim covers it) or "changed-unmentioned" (no claim covers it). Then list any ledger claim with no matching region in "missing".

Rules: movement is never a region; every region needs a real citation; use the approver's plain language.`;

async function loadFixture(name: string): Promise<{ fixture: Fixture; images: Anthropic.ImageBlockParam[] }> {
  const dir = path.join(FIXTURES_DIR, name);
  const intent = JSON.parse(await fs.readFile(path.join(dir, "intent.json"), "utf8"));
  const expected: Expected = JSON.parse(await fs.readFile(path.join(dir, "expected.json"), "utf8"));

  const images: Anthropic.ImageBlockParam[] = [];
  for (const [label, file] of [["BEFORE", "base.png"], ["AFTER", "head.png"], ["DIFF", "diff.png"]] as const) {
    try {
      const data = (await fs.readFile(path.join(dir, file))).toString("base64");
      images.push({ type: "image", source: { type: "base64", media_type: "image/png", data } });
      void label;
    } catch {
      /* a fixture may omit an image (e.g. new-page has no base) */
    }
  }
  return { fixture: { name, intent, expected }, images };
}

async function runFixture(client: Anthropic, name: string): Promise<{ name: string; pass: boolean; reasons: string[] }> {
  const { fixture, images } = await loadFixture(name);
  const i = fixture.intent;

  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: `PR title: ${i.title}\nPR body: ${i.body}\nComments: ${i.comments.join(" | ") || "(none)"}` },
    { type: "text", text: "Images below are BEFORE, then AFTER, then DIFF:" },
    ...images,
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: REVIEW_SCHEMA } },
    messages: [{ role: "user", content }],
  });

  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "{}";
  const out: ReviewOutput = JSON.parse(text);
  return { name, ...score(out, fixture.expected) };
}

/** Score one output against expected. Fabrication guard is a hard override. */
function score(out: ReviewOutput, exp: Expected): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Fabrication guard — highest priority, hard fail.
  const haystack = JSON.stringify(out).toLowerCase();
  for (const banned of exp.mustNotContain ?? []) {
    if (haystack.includes(banned.toLowerCase())) {
      return { pass: false, reasons: [`FABRICATION: output mentions "${banned}" which does not exist`] };
    }
  }

  // Gate must match.
  if (out.gate !== exp.gate) reasons.push(`gate: got "${out.gate}", expected "${exp.gate}"`);

  // Expected regions: every expected area should appear with (if given) the right verdict.
  for (const er of exp.regions ?? []) {
    const hit = out.regions.find((r) => r.area.toLowerCase().includes(er.area.toLowerCase()));
    if (!hit) { reasons.push(`missing expected region in area "${er.area}"`); continue; }
    if (er.verdict && hit.verdict !== er.verdict)
      reasons.push(`region "${er.area}": verdict got "${hit.verdict}", expected "${er.verdict}"`);
    if (er.changeType && hit.changeType !== er.changeType)
      reasons.push(`region "${er.area}": changeType got "${hit.changeType}", expected "${er.changeType}"`);
  }

  // Every region must carry both citations (the core rule).
  for (const r of out.regions) {
    if (!r.citationBase?.trim() || !r.citationHead?.trim())
      reasons.push(`region "${r.label}" is missing a citation (no-citation-no-region violated)`);
  }

  // Missing-claim detection.
  for (const m of exp.missing ?? []) {
    const hit = out.missing.some((x) => x.toLowerCase().includes(m.toLowerCase()));
    if (!hit) reasons.push(`expected "missing" claim not detected: "${m}"`);
  }

  return { pass: reasons.length === 0, reasons };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — the eval needs a live model. Aborting.");
    process.exit(2);
  }
  const only = process.argv[2];
  const names = only ? [only] : (await fs.readdir(FIXTURES_DIR)).filter((n) => !n.startsWith("."));
  if (names.length === 0) {
    console.error(`No fixtures in ${FIXTURES_DIR}`);
    process.exit(2);
  }

  const client = new Anthropic();
  let passed = 0;
  const results: Array<{ name: string; pass: boolean; reasons: string[] }> = [];
  for (const name of names) {
    process.stdout.write(`• ${name} … `);
    try {
      const r = await runFixture(client, name);
      results.push(r);
      if (r.pass) { passed++; console.log("PASS"); }
      else { console.log("FAIL"); r.reasons.forEach((x) => console.log(`    - ${x}`)); }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name, pass: false, reasons: [`ERROR: ${msg}`] });
      console.log(`ERROR: ${msg}`);
    }
  }

  const guardFails = results.filter((r) => r.reasons.some((x) => x.startsWith("FABRICATION")));
  console.log(`\n${passed}/${names.length} fixtures passed.`);
  if (guardFails.length) console.log(`${guardFails.length} FABRICATION guard failure(s) — these are release-blocking.`);
  process.exit(passed === names.length ? 0 : 1);
}

main();
