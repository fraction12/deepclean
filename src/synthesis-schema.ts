import { z } from "zod";
import {
  candidateCategories,
  candidateReadinessLevels,
  confidenceLevels,
  effortLevels,
  impactLevels,
  priorities,
  riskLevels,
} from "./types.js";

const synthesizedFileRefSchema = z.object({
  path: z.string(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
});

const childSliceOutputSchema = z.object({
  title: z.string().min(1),
  ownedFiles: z.array(synthesizedFileRefSchema).min(1),
  contextFiles: z.array(synthesizedFileRefSchema).default([]),
  expectedBehavior: z.string().min(1),
  proofRequired: z.array(z.string().min(1)).min(1),
  verification: z.array(z.string().min(1)).min(1),
  nonGoals: z.array(z.string().min(1)),
  doNotTouch: z.array(z.string().min(1)),
});

export const synthesisOutputSchema = z.object({
  candidates: z.array(z.object({
    title: z.string().min(1),
    category: z.enum(candidateCategories),
    priority: z.enum(priorities),
    confidence: z.enum(confidenceLevels),
    impact: z.enum(impactLevels),
    effort: z.enum(effortLevels),
    risk: z.enum(riskLevels),
    readiness: z.enum(candidateReadinessLevels),
    files: z.array(synthesizedFileRefSchema).min(1),
    ownedFiles: z.array(synthesizedFileRefSchema).min(1),
    contextFiles: z.array(synthesizedFileRefSchema),
    evidenceIds: z.array(z.string()).min(1),
    whyItMatters: z.string().min(1),
    likelyRootCause: z.string().min(1),
    suggestedDirection: z.string().min(1),
    expectedBehavior: z.string().min(1),
    proofRequired: z.array(z.string().min(1)).min(1),
    nonGoals: z.array(z.string().min(1)),
    doNotTouch: z.array(z.string().min(1)),
    splitChildren: z.array(childSliceOutputSchema).default([]),
    confidenceDowngradeReasons: z.array(z.string().min(1)),
    verification: z.array(z.string()).min(1),
    fixReadiness: z.object({
      minimumFixScope: z.string().min(1),
      suggestedRegressionTest: z.string().min(1),
      whyCurrentTestsMissIt: z.string().min(1),
      confidenceDowngradeReasons: z.array(z.string().min(1)),
    }),
    supportingQuotes: z.array(z.object({
      path: z.string(),
      text: z.string().min(1),
    })).default([]),
  })),
  rejectedEvidenceIds: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

export type SynthesisOutput = z.infer<typeof synthesisOutputSchema>;

export function parseSynthesisOutput(raw: string): SynthesisOutput {
  const trimmed = raw.trim();
  const direct = tryParseJson(trimmed);
  if (direct) {
    return synthesisOutputSchema.parse(direct);
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Codex did not return JSON");
  }
  return synthesisOutputSchema.parse(JSON.parse(match[0]));
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function jsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["candidates", "rejectedEvidenceIds", "notes"],
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "category",
            "priority",
            "confidence",
            "impact",
            "effort",
            "risk",
            "readiness",
            "files",
            "ownedFiles",
            "contextFiles",
            "evidenceIds",
            "whyItMatters",
            "likelyRootCause",
            "suggestedDirection",
            "expectedBehavior",
            "proofRequired",
            "nonGoals",
            "doNotTouch",
            "splitChildren",
            "confidenceDowngradeReasons",
            "verification",
            "fixReadiness",
            "supportingQuotes",
          ],
          properties: {
            title: { type: "string" },
            category: { enum: [...candidateCategories] },
            priority: { enum: [...priorities] },
            confidence: { enum: [...confidenceLevels] },
            impact: { enum: [...impactLevels] },
            effort: { enum: [...effortLevels] },
            risk: { enum: [...riskLevels] },
            readiness: { enum: [...candidateReadinessLevels] },
            files: {
              type: "array",
              minItems: 1,
              items: fileRefJsonSchema(),
            },
            ownedFiles: { type: "array", minItems: 1, items: fileRefJsonSchema() },
            contextFiles: { type: "array", items: fileRefJsonSchema() },
            evidenceIds: { type: "array", items: { type: "string" }, minItems: 1 },
            whyItMatters: { type: "string" },
            likelyRootCause: { type: "string" },
            suggestedDirection: { type: "string" },
            expectedBehavior: { type: "string" },
            proofRequired: { type: "array", items: { type: "string" }, minItems: 1 },
            nonGoals: { type: "array", items: { type: "string" } },
            doNotTouch: { type: "array", items: { type: "string" } },
            splitChildren: {
              type: "array",
              items: childSliceJsonSchema(),
            },
            confidenceDowngradeReasons: { type: "array", items: { type: "string" } },
            verification: { type: "array", items: { type: "string" }, minItems: 1 },
            fixReadiness: {
              type: "object",
              additionalProperties: false,
              required: [
                "minimumFixScope",
                "suggestedRegressionTest",
                "whyCurrentTestsMissIt",
                "confidenceDowngradeReasons",
              ],
              properties: {
                minimumFixScope: { type: "string" },
                suggestedRegressionTest: { type: "string" },
                whyCurrentTestsMissIt: { type: "string" },
                confidenceDowngradeReasons: { type: "array", items: { type: "string" } },
              },
            },
            supportingQuotes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["path", "text"],
                properties: {
                  path: { type: "string" },
                  text: { type: "string" },
                },
              },
            },
          },
        },
      },
      rejectedEvidenceIds: { type: "array", items: { type: "string" } },
      notes: { type: "array", items: { type: "string" } },
    },
  };
}

function fileRefJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["path", "startLine", "endLine"],
    properties: {
      path: { type: "string" },
      startLine: { type: "integer", minimum: 1 },
      endLine: { type: "integer", minimum: 1 },
    },
  };
}

function childSliceJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "ownedFiles",
      "contextFiles",
      "expectedBehavior",
      "proofRequired",
      "verification",
      "nonGoals",
      "doNotTouch",
    ],
    properties: {
      title: { type: "string" },
      ownedFiles: { type: "array", minItems: 1, items: fileRefJsonSchema() },
      contextFiles: { type: "array", items: fileRefJsonSchema() },
      expectedBehavior: { type: "string" },
      proofRequired: { type: "array", items: { type: "string" }, minItems: 1 },
      verification: { type: "array", items: { type: "string" }, minItems: 1 },
      nonGoals: { type: "array", items: { type: "string" } },
      doNotTouch: { type: "array", items: { type: "string" } },
    },
  };
}

