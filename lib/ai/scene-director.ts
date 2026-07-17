import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

import type { Evidence, EvidencePage, SceneDirectorResult } from "../domain/types";

const MODEL = process.env.GIST_ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

const SCENE_DIRECTOR_TOOL: Anthropic.Tool = {
  name: "direct_walkthrough_scenes",
  description:
    "Return a change-focused walkthrough: each slide is one visual change (multiple changes may share a route).",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["headline", "summary", "slides"],
    properties: {
      headline: { type: "string" },
      summary: { type: "string" },
      slides: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["route", "changeTitle", "caption", "source", "focus", "zoom", "annotations"],
          properties: {
            route: { type: "string" },
            changeTitle: {
              type: "string",
              description: "Short name of this change (e.g. New signup button). Not just the page name.",
            },
            caption: { type: "string" },
            source: { type: "string", enum: ["preview", "production"] },
            focus: {
              type: "object",
              additionalProperties: false,
              required: ["x", "y", "w", "h"],
              properties: {
                x: { type: "number", minimum: 0, maximum: 1 },
                y: { type: "number", minimum: 0, maximum: 1 },
                w: { type: "number", minimum: 0.08, maximum: 1 },
                h: { type: "number", minimum: 0.08, maximum: 1 },
              },
            },
            zoom: { type: "number", minimum: 1, maximum: 2.5 },
            annotations: {
              type: "array",
              maxItems: 3,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["type", "x", "y", "label"],
                properties: {
                  type: { type: "string", enum: ["box", "pin"] },
                  x: { type: "number", minimum: 0, maximum: 1 },
                  y: { type: "number", minimum: 0, maximum: 1 },
                  w: { type: "number", minimum: 0, maximum: 1 },
                  h: { type: "number", minimum: 0, maximum: 1 },
                  label: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
};

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new TypeError("AI scene director returned no JSON object");
  const sliced = raw.slice(start, end + 1);
  try {
    return JSON.parse(sliced);
  } catch {
    const repaired = sliced.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(repaired);
  }
}

function resultFromResponse(response: Anthropic.Message): SceneDirectorResult {
  const toolBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === SCENE_DIRECTOR_TOOL.name,
  );
  if (toolBlock) return toolBlock.input as SceneDirectorResult;

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  if (!text.trim()) {
    throw new TypeError("AI scene director returned no structured scenes");
  }
  return extractJson(text) as SceneDirectorResult;
}

async function thumbnailJpeg(path: string): Promise<{ data: string; mediaType: "image/jpeg" }> {
  // Anthropic rejects any side > 8000px; tall full-page captures must be capped.
  const data = await sharp(await readFile(path))
    .rotate()
    .resize({
      width: 720,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 72 })
    .toBuffer();
  return { data: data.toString("base64"), mediaType: "image/jpeg" };
}

async function redDiffJpeg(
  beforePath: string,
  afterPath: string,
  threshold = 28,
): Promise<{ data: string; mediaType: "image/jpeg" }> {
  const before = sharp(await readFile(beforePath))
    .rotate()
    .resize({ width: 720, height: 1600, fit: "inside", withoutEnlargement: true });
  const after = sharp(await readFile(afterPath))
    .rotate()
    .resize({ width: 720, height: 1600, fit: "inside", withoutEnlargement: true });
  const beforeMeta = await before.toBuffer({ resolveWithObject: true });
  const afterMeta = await after.toBuffer({ resolveWithObject: true });
  const w = Math.min(beforeMeta.info.width, afterMeta.info.width);
  const h = Math.min(beforeMeta.info.height, afterMeta.info.height);

  const beforeRaw = await sharp(beforeMeta.data)
    .extract({ left: 0, top: 0, width: w, height: h })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const afterRaw = await sharp(afterMeta.data)
    .extract({ left: 0, top: 0, width: w, height: h })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < beforeRaw.length; i += 4) {
    const delta =
      Math.abs(beforeRaw[i] - afterRaw[i]) +
      Math.abs(beforeRaw[i + 1] - afterRaw[i + 1]) +
      Math.abs(beforeRaw[i + 2] - afterRaw[i + 2]);
    const gray = Math.round(0.299 * afterRaw[i] + 0.587 * afterRaw[i + 1] + 0.114 * afterRaw[i + 2]);
    if (delta > threshold) {
      out[i] = 220;
      out[i + 1] = 38;
      out[i + 2] = 38;
      out[i + 3] = 255;
    } else {
      out[i] = gray;
      out[i + 1] = gray;
      out[i + 2] = gray;
      out[i + 3] = 255;
    }
  }

  const data = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .jpeg({ quality: 70 })
    .toBuffer();
  return { data: data.toString("base64"), mediaType: "image/jpeg" };
}

function assetPath(assetsDirectory: string, page: EvidencePage, kind: "preview" | "production") {
  const filename = kind === "preview" ? page.assetRefs?.preview : page.assetRefs?.production;
  return filename ? join(assetsDirectory, filename) : null;
}

export function requireAnthropicApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.trim() === "") {
    throw new TypeError("ANTHROPIC_API_KEY is required — Gist walkthrough scenes are AI-directed");
  }
  return key;
}

export async function directScenesWithAnthropic(options: {
  evidence: Evidence;
  assetsDirectory: string;
  apiKey?: string;
  fetchImages?: boolean;
}): Promise<SceneDirectorResult> {
  if (process.env.GIST_MOCK_SCENES === "1") {
    const pages = options.evidence.pages.filter((page) => page.status !== "pass").slice(0, 5);
    const first = pages[0] || options.evidence.pages[0];
    const slides =
      pages.length > 0
        ? pages.flatMap((page, index) => {
            const base = {
              route: page.route,
              source: "preview" as const,
              annotations: [] as SceneDirectorResult["slides"][0]["annotations"],
            };
            if (index === 0 && pages.length === 1) {
              return [
                {
                  ...base,
                  changeTitle: `Update on ${page.title}`,
                  caption: page.caption || `${page.title} changed.`,
                  focus: { x: 0, y: 0, w: 1, h: 0.28 },
                  zoom: 1.2,
                  annotations: [{ type: "pin" as const, x: 0.5, y: 0.12, label: "Look here" }],
                },
                {
                  ...base,
                  changeTitle: `Second change on ${page.title}`,
                  caption: `Another edit on ${page.title}.`,
                  focus: { x: 0.1, y: 0.4, w: 0.8, h: 0.25 },
                  zoom: 1.35,
                  annotations: [{ type: "box" as const, x: 0.15, y: 0.42, w: 0.7, h: 0.18, label: "Changed area" }],
                },
              ];
            }
            return [
              {
                ...base,
                changeTitle: `Change on ${page.title}`,
                caption: page.caption || `${page.title} needs a look.`,
                focus: { x: 0, y: 0, w: 1, h: 0.35 },
                zoom: 1.15,
                annotations: [{ type: "pin" as const, x: 0.5, y: 0.12, label: "Review this area" }],
              },
            ];
          })
        : [
            {
              route: first.route,
              changeTitle: "No visible site changes",
              caption: "The captured pages look the same as production.",
              source: "preview" as const,
              focus: { x: 0, y: 0, w: 1, h: 0.35 },
              zoom: 1,
              annotations: [{ type: "pin" as const, x: 0.5, y: 0.12, label: "No visible change" }],
            },
          ];
    return {
      headline: "Mock change walkthrough",
      summary: "Mock scene director output for local tests.",
      slides: slides.slice(0, 8),
    };
  }

  const apiKey = options.apiKey || requireAnthropicApiKey();
  const client = new Anthropic({ apiKey });
  const candidates = options.evidence.pages.filter((page) => page.status !== "pass").slice(0, 5);

  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];
  content.push({
    type: "text",
    text: `You are the Gist Scene Director for a non-technical website approver.

Call direct_walkthrough_scenes. Each slide is one CHANGE (what shipped), not one page tour.

For each page you may receive BEFORE (production), AFTER (preview), and a DIFF map (red = changed).

Critical rules:
- Navigate by CHANGES. If one page has two separated red regions, emit TWO slides with the SAME route and different focus/changeTitle.
- Do NOT emit one slide per URL by default. Emit only changes worth showing (1–8 total).
- changeTitle names the change ("New signup button"), not just the page ("Home").
- focus must crop THAT change's region. zoom 1.2–1.8 when focusing a real change.
- Annotations only on real differences. Empty annotations OK. Ban: "Header unchanged", "Content identical".
- If DIFF maps are empty/noise for the whole PR: ONE slide only — changeTitle "No visible site changes", pin "No visible change".
- If many pages share the same sitewide shift: prefer ONE sitewide change (or 1–2 exemplars), not five clones.
- Plain English. No jargon (no analytics code, DOM, pixels, diffRatio).
- Headline + summary: what changed, anything wrong, can they approve.

Pull request: ${options.evidence.repository} #${options.evidence.pullRequest.number}
Title: ${options.evidence.pullRequest.title}

Candidate pages:
${candidates
  .map(
    (page, index) =>
      `${index + 1}. ${page.route} — ${page.title} — status=${page.status} — measuredChange=${(page.diffRatio * 100).toFixed(1)}%`,
  )
  .join("\n")}`,
  });

  if (options.fetchImages !== false) {
    for (const [index, page] of candidates.entries()) {
      const beforePath = assetPath(options.assetsDirectory, page, "production");
      const afterPath = assetPath(options.assetsDirectory, page, "preview");
      content.push({
        type: "text",
        text: `Page ${index + 1}: ${page.route} (${page.title}). measuredChange=${(page.diffRatio * 100).toFixed(1)}%. Segment multiple red regions into multiple changes.`,
      });

      if (beforePath) {
        try {
          const before = await thumbnailJpeg(beforePath);
          content.push({ type: "text", text: `BEFORE (production) for ${page.route}:` });
          content.push({
            type: "image",
            source: { type: "base64", media_type: before.mediaType, data: before.data },
          });
        } catch (error) {
          content.push({
            type: "text",
            text: `BEFORE image missing for ${page.route}: ${(error as Error).message}`,
          });
        }
      }

      if (afterPath) {
        try {
          const after = await thumbnailJpeg(afterPath);
          content.push({ type: "text", text: `AFTER (preview) for ${page.route}:` });
          content.push({
            type: "image",
            source: { type: "base64", media_type: after.mediaType, data: after.data },
          });
        } catch (error) {
          content.push({
            type: "text",
            text: `AFTER image missing for ${page.route}: ${(error as Error).message}`,
          });
        }
      }

      if (beforePath && afterPath) {
        try {
          const diff = await redDiffJpeg(beforePath, afterPath);
          content.push({
            type: "text",
            text: `DIFF map for ${page.route} (red = changed). Split into separate changes when red regions are distinct:`,
          });
          content.push({
            type: "image",
            source: { type: "base64", media_type: diff.mediaType, data: diff.data },
          });
        } catch (error) {
          content.push({
            type: "text",
            text: `DIFF map could not be built for ${page.route}: ${(error as Error).message}`,
          });
        }
      }
    }
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2800,
    tools: [SCENE_DIRECTOR_TOOL],
    tool_choice: { type: "tool", name: SCENE_DIRECTOR_TOOL.name },
    messages: [{ role: "user", content }],
  });

  return resultFromResponse(response);
}
