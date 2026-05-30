import { z } from "zod";
import { schemaVersion } from "./defaults.js";
import { fileReferenceSchema } from "./file-references.js";
import { diagnosticSchema } from "./json.js";
import {
  candidateReadinessLevels,
  ciRunStatuses,
  confidenceLevels,
  evidenceFreshnessStates,
  fixAttemptOutcomes,
  fixAttemptStatuses,
  revalidationOutcomes,
  synthesisValidationStatuses,
} from "./type-kinds.js";

const revalidationProgressSchema = z.object({
  kind: z.enum(["metric-reduction"]),
  metric: z.string(),
  unit: z.string(),
  before: z.number(),
  after: z.number(),
  delta: z.number(),
  evidenceIds: z.array(z.string()),
});

export const revalidationRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("revalidation"),
  id: z.string(),
  targetType: z.enum(["finding", "theme", "all"]),
  targetId: z.string().optional(),
  runId: z.string(),
  priorLifecycleState: z.string().optional(),
  outcome: z.preprocess((value) => {
    if (value === "fixed") {
      return "resolved";
    }
    if (value === "changed") {
      return "partially-resolved";
    }
    if (value === "unchanged") {
      return "still-open";
    }
    return value;
  }, z.enum(revalidationOutcomes)),
  confidence: z.enum(confidenceLevels).default("medium"),
  rationale: z.string().default("Historical revalidation record without a rationale."),
  nextAction: z.string().default("Inspect the latest finding state before proceeding."),
  evidenceBundleId: z.string().optional(),
  evidenceFreshness: z.enum(evidenceFreshnessStates).optional(),
  evidenceIds: z.array(z.string()),
  previousObservationId: z.string().optional(),
  newObservationId: z.string().optional(),
  verificationRunIds: z.array(z.string()).default([]),
  changedFiles: z.array(z.string()).default([]),
  dirtyState: z.object({
    dirty: z.boolean(),
    files: z.array(z.string()),
  }).optional(),
  supersededByFindingId: z.string().optional(),
  replacementFindingId: z.string().optional(),
  progress: revalidationProgressSchema.optional(),
  diagnostics: z.array(diagnosticSchema),
  createdAt: z.string(),
});

export type RevalidationRecord = z.infer<typeof revalidationRecordSchema>;

export const ciRunRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("ci_run"),
  id: z.string(),
  runId: z.string().optional(),
  baselineRef: z.string().optional(),
  status: z.enum(ciRunStatuses),
  policy: z.record(z.string(), z.unknown()),
  blockingFindingIds: z.array(z.string()),
  artifactPaths: z.object({
    json: z.string().optional(),
    markdown: z.string().optional(),
    sarif: z.string().optional(),
  }),
  diagnostics: z.array(diagnosticSchema),
  createdAt: z.string(),
});

export type CiRunRecord = z.infer<typeof ciRunRecordSchema>;

export const retentionManifestRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("retention_manifest"),
  id: z.string(),
  dryRun: z.boolean(),
  keepRuns: z.number().int().nonnegative().optional(),
  keepDays: z.number().int().nonnegative().optional(),
  deletePaths: z.array(z.string()),
  retainedPaths: z.array(z.string()),
  blockedPaths: z.array(z.object({
    path: z.string(),
    reason: z.string(),
  })),
  privacyNotes: z.array(z.string()),
  createdAt: z.string(),
});

export type RetentionManifestRecord = z.infer<typeof retentionManifestRecordSchema>;

export const fixAttemptRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("fix_attempt"),
  id: z.string(),
  findingId: z.string(),
  candidateId: z.string().optional(),
  planId: z.string().optional(),
  status: z.enum(fixAttemptStatuses),
  outcome: z.enum(fixAttemptOutcomes).optional(),
  dryRun: z.boolean(),
  attemptNumber: z.number().int().positive().optional(),
  maxAttempts: z.number().int().positive().optional(),
  previousAttemptIds: z.array(z.string()).optional(),
  branch: z.string().optional(),
  dirtyBefore: z.array(z.string()).optional(),
  dirtyAfter: z.array(z.string()).optional(),
  allowedWriteScope: z.array(z.string()).optional(),
  outOfScopeFiles: z.array(z.string()).optional(),
  noExternalSideEffects: z.boolean().default(true),
  beforeEvidenceIds: z.array(z.string()).optional(),
  afterRevalidationId: z.string().optional(),
  changedFiles: z.array(z.string()),
  patchPreviewPath: z.string().optional(),
  verificationCommands: z.array(z.string()),
  verificationResults: z.array(z.object({
    command: z.string(),
    exitCode: z.number().int().optional(),
    passed: z.boolean(),
    durationMs: z.number().int().nonnegative().optional(),
    summary: z.string().optional(),
    outputPath: z.string().optional(),
  })),
  worker: z.object({
    provider: z.string(),
    command: z.string(),
    exitCode: z.number().int().nullable(),
    outputPath: z.string().optional(),
    timedOut: z.boolean().optional(),
    timeoutReason: z.enum(["idle", "hard"]).optional(),
  }).optional(),
  pr: z.object({
    branch: z.string(),
    base: z.string().optional(),
    commitSha: z.string().optional(),
    url: z.string().optional(),
    summaryPath: z.string().optional(),
    externalSideEffects: z.array(z.string()),
  }).optional(),
  diagnostics: z.array(diagnosticSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type FixAttemptRecord = z.infer<typeof fixAttemptRecordSchema>;

export const synthesisAttemptRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("synthesis_attempt"),
  id: z.string(),
  runId: z.string(),
  provider: z.string(),
  model: z.string().optional(),
  promptVersion: z.string(),
  promptBytes: z.number().int().nonnegative(),
  runtime: z.record(z.string(), z.unknown()),
  reviewerIds: z.array(z.string()),
  reviewerRubricVersions: z.record(z.string(), z.string()).optional(),
  evidenceManifest: z.object({
    evidenceCount: z.number().int().nonnegative(),
    includedEvidenceIds: z.array(z.string()),
    includedFileRefs: z.array(fileReferenceSchema),
    omittedEvidenceIds: z.array(z.string()),
    includeSource: z.boolean(),
    tokenBudget: z.number().int().positive(),
    excerptBudget: z.number().int().nonnegative(),
  }),
  rawCandidateCount: z.number().int().nonnegative(),
  acceptedCandidateCount: z.number().int().nonnegative(),
  rejectedCandidateCount: z.number().int().nonnegative(),
  rejectedEvidenceIds: z.array(z.string()),
  notes: z.array(z.string()),
  validations: z.array(z.object({
    id: z.string(),
    status: z.enum(synthesisValidationStatuses),
    draftTitle: z.string(),
    candidateId: z.string().optional(),
    evidenceIds: z.array(z.string()),
    fileRefs: z.array(fileReferenceSchema),
    diagnostics: z.array(diagnosticSchema),
    readiness: z.enum(candidateReadinessLevels).optional(),
    confidenceDowngradeReasons: z.array(z.string()).optional(),
    fixReadiness: z.object({
      minimumFixScope: z.string(),
      suggestedRegressionTest: z.string(),
      whyCurrentTestsMissIt: z.string(),
      confidenceDowngradeReasons: z.array(z.string()),
    }).optional(),
  })),
  diagnostics: z.array(diagnosticSchema),
  createdAt: z.string(),
});

export type SynthesisAttemptRecord = z.infer<typeof synthesisAttemptRecordSchema>;
