import { z } from "zod";
import { schemaVersion } from "./defaults.js";
import { fileReferenceSchema } from "./file-references.js";
import { diagnosticSchema } from "./json.js";
import {
  confidenceLevels,
  prOpportunityClassifications,
  prOpportunityStatuses,
  riskLevels,
} from "./type-kinds.js";

export const prOpportunitySourceSignalSchema = z.object({
  kind: z.string(),
  id: z.string().optional(),
  weight: z.number().optional(),
  summary: z.string(),
});

export type PrOpportunitySourceSignal = z.infer<typeof prOpportunitySourceSignalSchema>;

export const prOpportunityRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("pr_opportunity"),
  id: z.string(),
  runId: z.string(),
  targetCandidateIds: z.array(z.string()).default([]),
  targetFindingIds: z.array(z.string()).default([]),
  targetClusterIds: z.array(z.string()).default([]),
  classification: z.enum(prOpportunityClassifications),
  status: z.enum(prOpportunityStatuses),
  title: z.string(),
  oneSentenceChange: z.string(),
  rationale: z.string(),
  score: z.number(),
  confidence: z.enum(confidenceLevels),
  risk: z.enum(riskLevels),
  ownedFiles: z.array(fileReferenceSchema),
  contextFiles: z.array(fileReferenceSchema).default([]),
  doNotTouch: z.array(z.string()).default([]),
  behaviorInvariants: z.array(z.string()).default([]),
  validationPlan: z.array(z.string()).default([]),
  testsRequiredFirst: z.boolean().default(false),
  expectedReviewerConcern: z.string().optional(),
  stopLine: z.string(),
  expectedPayoff: z.string(),
  refusalReason: z.string().optional(),
  sourceSignals: z.array(prOpportunitySourceSignalSchema).default([]),
  diagnostics: z.array(diagnosticSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PrOpportunityRecord = z.infer<typeof prOpportunityRecordSchema>;

export const campaignSummaryRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("campaign_summary"),
  id: z.string(),
  runId: z.string().optional(),
  currentRunId: z.string().optional(),
  opportunityRunId: z.string().optional(),
  recommendedOpportunityId: z.string().optional(),
  stopCampaignRationale: z.string().optional(),
  counts: z.object({
    byClassification: z.record(z.string(), z.number().int().nonnegative()),
    byStatus: z.record(z.string(), z.number().int().nonnegative()),
  }),
  completedOpportunityIds: z.array(z.string()).default([]),
  supersededOpportunityIds: z.array(z.string()).default([]),
  knownFixAttemptIds: z.array(z.string()).default([]),
  knownPrUrls: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  remainingDebt: z.array(z.object({
    classification: z.enum(prOpportunityClassifications),
    count: z.number().int().nonnegative(),
    summary: z.string(),
  })).default([]),
  diagnostics: z.array(diagnosticSchema).default([]),
  createdAt: z.string(),
});

export type CampaignSummaryRecord = z.infer<typeof campaignSummaryRecordSchema>;
