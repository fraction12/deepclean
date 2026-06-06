import { z } from "zod";
import { schemaVersion } from "./defaults.js";
import { fileReferenceSchema } from "./file-references.js";
import {
  baselineStatuses,
  candidateCategories,
  candidateReadinessLevels,
  candidateStatuses,
  confidenceLevels,
  decompositionStrategies,
  effortLevels,
  fixabilityLevels,
  identityConfidenceLevels,
  impactLevels,
  lifecycleStates,
  priorities,
  riskLevels,
  slopTypes,
} from "./type-kinds.js";

export const findingSignatureSchema = z.object({
  version: z.literal("1"),
  value: z.string(),
  components: z.object({
    category: z.string(),
    normalizedTitle: z.string(),
    evidenceKinds: z.array(z.string()),
    primaryAnchors: z.array(fileReferenceSchema),
    graphNeighborhood: z.array(z.string()).optional(),
    analyzerRuleIds: z.array(z.string()).optional(),
  }),
});

export type FindingSignature = z.infer<typeof findingSignatureSchema>;

export const candidateDecompositionSchema = z.object({
  parentCandidateId: z.string().optional(),
  childCandidateIds: z.array(z.string()).optional(),
  rootCandidateId: z.string().optional(),
  strategy: z.enum(decompositionStrategies),
  sequence: z.number().int().positive().optional(),
  total: z.number().int().positive().optional(),
  reason: z.string(),
  createdAt: z.string(),
});

export type CandidateDecomposition = z.infer<typeof candidateDecompositionSchema>;

export const childSliceSchema = z.object({
  title: z.string(),
  ownedFiles: z.array(fileReferenceSchema),
  contextFiles: z.array(fileReferenceSchema).default([]),
  expectedBehavior: z.string(),
  proofRequired: z.array(z.string()),
  verification: z.array(z.string()),
  nonGoals: z.array(z.string()),
  doNotTouch: z.array(z.string()),
});

export type ChildSlice = z.infer<typeof childSliceSchema>;

export const candidateRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("candidate"),
  id: z.string(),
  runId: z.string(),
  findingId: z.string().optional(),
  signature: findingSignatureSchema.optional(),
  identityConfidence: z.enum(identityConfidenceLevels).optional(),
  lifecycleState: z.enum(lifecycleStates).optional(),
  baselineStatus: z.enum(baselineStatuses).optional(),
  title: z.string(),
  category: z.enum(candidateCategories),
  slopType: z.enum(slopTypes).optional(),
  fixability: z.enum(fixabilityLevels).optional(),
  status: z.enum(candidateStatuses),
  priority: z.enum(priorities),
  confidence: z.enum(confidenceLevels),
  impact: z.enum(impactLevels),
  effort: z.enum(effortLevels),
  risk: z.enum(riskLevels),
  readiness: z.enum(candidateReadinessLevels).optional(),
  files: z.array(fileReferenceSchema),
  ownedFiles: z.array(fileReferenceSchema).optional(),
  contextFiles: z.array(fileReferenceSchema).optional(),
  evidenceIds: z.array(z.string()),
  affectedFeatureIds: z.array(z.string()).default([]),
  featureScope: z.enum(["feature-local", "shared-context", "cross-feature", "unmapped"]).default("unmapped"),
  whyItMatters: z.string(),
  likelyRootCause: z.string(),
  suggestedDirection: z.string(),
  expectedBehavior: z.string().optional(),
  proofRequired: z.array(z.string()).optional(),
  nonGoals: z.array(z.string()).optional(),
  doNotTouch: z.array(z.string()).optional(),
  splitChildren: z.array(childSliceSchema).optional(),
  confidenceDowngradeReasons: z.array(z.string()).optional(),
  verification: z.array(z.string()),
  fixReadiness: z.object({
    minimumFixScope: z.string(),
    suggestedRegressionTest: z.string(),
    whyCurrentTestsMissIt: z.string(),
    confidenceDowngradeReasons: z.array(z.string()),
  }).optional(),
  decomposition: candidateDecompositionSchema.optional(),
  provenance: z.object({
    source: z.enum(["local-evidence", "model-synthesis", "candidate-decomposition"]),
    provider: z.string().optional(),
    model: z.string().optional(),
    promptVersion: z.string().optional(),
    synthesisAttemptId: z.string().optional(),
    validationId: z.string().optional(),
    reviewers: z.array(z.string()).optional(),
    reviewerRubricVersions: z.record(z.string(), z.string()).optional(),
    runtime: z.record(z.string(), z.unknown()).optional(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CandidateRecord = z.infer<typeof candidateRecordSchema>;
