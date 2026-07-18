/**
 * Structured-output schema for the change-review eval (docs/CHANGE-REVIEW.md §11).
 *
 * The eval sends a fixture's before/after/diff screenshots + PR intent to a
 * Claude model, forcing it to run the SOP and return this shape. We then score
 * it against the fixture's expected.json. This mirrors what the /gist skill
 * produces (regions.json + gate), but as a single structured call so it's
 * gradeable offline.
 */

/** JSON Schema passed to output_config.format — structured-output constrained. */
export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    gate: {
      type: "string",
      description:
        "Deterministic-style gate the model believes applies to this page.",
      enum: [
        "analyze",
        "refuse:viewport-mismatch",
        "refuse:baseline-mismatch",
        "refuse:capture-error",
        "triage:redesign",
        "triage:new-page",
        "triage:removed-page",
      ],
    },
    ledger: {
      type: "array",
      description: "Intent claims extracted from the PR text (Pass 0).",
      items: { type: "string" },
    },
    regions: {
      type: "array",
      description:
        "Real content-change regions (Pass 1-3). Movement/reflow is NEVER a region.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          area: {
            type: "string",
            description:
              "Coarse page area this change is in, e.g. hero, nav, pricing, footer.",
          },
          changeType: {
            type: "string",
            enum: ["text-edit", "added", "removed", "restyle"],
          },
          verdict: {
            type: "string",
            enum: ["intended", "changed-unmentioned"],
          },
          citationBase: {
            type: "string",
            description: "What is visible in the BEFORE screenshot here.",
          },
          citationHead: {
            type: "string",
            description: "What is visible in the AFTER screenshot here.",
          },
        },
        required: [
          "label",
          "area",
          "changeType",
          "verdict",
          "citationBase",
          "citationHead",
        ],
      },
    },
    missing: {
      type: "array",
      description: "PR claims with no matching region (promised but absent).",
      items: { type: "string" },
    },
  },
  required: ["gate", "ledger", "regions", "missing"],
} as const;

export interface ReviewOutput {
  gate: string;
  ledger: string[];
  regions: Array<{
    label: string;
    area: string;
    changeType: "text-edit" | "added" | "removed" | "restyle";
    verdict: "intended" | "changed-unmentioned";
    citationBase: string;
    citationHead: string;
  }>;
  missing: string[];
}

/** A fixture's ground-truth labels (expected.json). */
export interface Expected {
  gate: string;
  ledger?: string[];
  regions?: Array<{
    area: string;
    changeType?: string;
    verdict?: string;
  }>;
  missing?: string[];
  /** Content/areas that do NOT exist — if the model names one, the case fails hard. */
  mustNotContain?: string[];
}

export interface Fixture {
  name: string;
  intent: { title: string; body: string; comments: string[] };
  expected: Expected;
}
