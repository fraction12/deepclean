import { z } from "zod";
import { schemaVersion } from "./defaults.js";
import { fileReferenceSchema } from "./file-references.js";
import { diagnosticSchema } from "./json.js";

export { configSchema, schemaVersion, type DeepcleanConfig } from "./defaults.js";
export { fileReferenceSchema, type FileReference } from "./file-references.js";
export { diagnosticSchema, type Diagnostic, type ErrorEnvelope, type JsonEnvelope } from "./json.js";

export const candidateStatuses = [
  "open",
  "investigating",
  "handed-off",
  "ignored",
  "false-positive",
  "stale",
  "fixed",
  "superseded",
] as const;

export const candidateCategories = [
  "architecture",
  "complexity",
  "duplication",
  "testability",
  "dead-weight",
  "ai-slop",
  "domain-drift",
  "diagnostic",
] as const;

export const priorities = ["P0", "P1", "P2", "P3"] as const;
export const confidenceLevels = ["low", "medium", "high"] as const;
export const effortLevels = ["small", "medium", "large"] as const;
export const impactLevels = ["local", "feature", "cross-cutting"] as const;
export const riskLevels = ["safe", "moderate", "design-needed"] as const;
export const candidateReadinessLevels = [
  "fix-ready",
  "split-needed",
  "design-needed",
  "needs-human",
  "defer",
] as const;
export const clusterActionability = ["bounded", "too-broad"] as const;
export const identityConfidenceLevels = ["low", "medium", "high"] as const;
export const decompositionStrategies = [
  "large-function-slices",
  "large-file-slices",
  "dependency-hotspot-slices",
  "wrapper-slices",
] as const;
export const lifecycleEventKinds = [
  "created",
  "observed",
  "triaged",
  "suppressed",
  "revalidated",
  "changed",
  "fixed",
  "stale",
  "superseded",
  "fix-refused",
  "patch-started",
  "patch-applied",
  "scope-failed",
  "fix-attempted",
  "verification-passed",
  "verification-failed",
  "unverified",
] as const;
export const lifecycleStates = [
  "new",
  "ready",
  "design-needed",
  "split",
  "attempted",
  "resolved",
  "partially-resolved",
  "still-open",
  "needs-human",
  "suppressed",
  "stale",
  "superseded",
  // Legacy states kept for compatibility with older persisted state.
  "open",
  "fixed",
  "inconclusive",
] as const;
export const revalidationOutcomes = [
  "resolved",
  "partially-resolved",
  "still-open",
  "needs-human",
  "stale",
  "superseded",
  "inconclusive",
] as const;
export const baselineStatuses = [
  "new",
  "existing",
  "worsened",
  "improved",
  "fixed",
  "unknown",
] as const;
export const evidenceFreshnessStates = [
  "fresh",
  "baseline",
  "reused",
  "stale",
] as const;
export const fixAttemptStatuses = [
  "planned",
  "previewed",
  "applied",
  "passed",
  "failed",
  "scope-failed",
  "unverified",
] as const;
export const fixAttemptOutcomes = [
  "resolved",
  "partially-resolved",
  "still-open",
  "superseded",
  "needs_human",
] as const;
export const synthesisValidationStatuses = ["accepted", "rejected"] as const;
export const ciRunStatuses = [
  "passed",
  "failed",
  "policy-failed",
  "error",
] as const;
export const featureKinds = [
  "package-script",
  "route",
  "component",
  "module",
  "python-module",
  "test-suite",
  "config",
] as const;
export const featureMapSources = ["heuristic", "auto", "agent"] as const;
export const featureFileRoles = ["entrypoint", "owned", "context", "shared", "test", "config", "generated"] as const;

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

export const evidenceRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("evidence"),
  id: z.string(),
  runId: z.string(),
  adapter: z.string(),
  kind: z.string(),
  title: z.string(),
  summary: z.string(),
  files: z.array(fileReferenceSchema),
  affectedFeatureIds: z.array(z.string()).default([]),
  fileRoles: z.array(z.object({
    path: z.string(),
    featureId: z.string(),
    role: z.enum(featureFileRoles),
  })).default([]),
  data: z.record(z.string(), z.unknown()),
  confidence: z.enum(confidenceLevels),
  createdAt: z.string(),
});

export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;

export const featureRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("feature"),
  featureId: z.string(),
  runId: z.string(),
  title: z.string(),
  summary: z.string(),
  kind: z.enum(featureKinds),
  source: z.string(),
  mapSource: z.enum(featureMapSources).default("heuristic"),
  mapperVersion: z.string().default("local-v1"),
  confidence: z.enum(confidenceLevels),
  entrypoints: z.array(fileReferenceSchema),
  ownedFiles: z.array(fileReferenceSchema),
  contextFiles: z.array(fileReferenceSchema),
  testFiles: z.array(fileReferenceSchema),
  fileRoles: z.array(z.object({
    path: z.string(),
    role: z.enum(featureFileRoles),
  })).default([]),
  reasons: z.array(z.string()).default([]),
  verification: z.array(z.string()),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type FeatureRecord = z.infer<typeof featureRecordSchema>;

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

export const findingRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("finding"),
  id: z.string(),
  signature: findingSignatureSchema,
  identityConfidence: z.enum(identityConfidenceLevels),
  title: z.string(),
  category: z.enum(candidateCategories),
  status: z.enum(candidateStatuses),
  lifecycleState: z.enum(lifecycleStates),
  priority: z.enum(priorities),
  confidence: z.enum(confidenceLevels),
  impact: z.enum(impactLevels),
  effort: z.enum(effortLevels),
  risk: z.enum(riskLevels),
  files: z.array(fileReferenceSchema),
  evidenceIds: z.array(z.string()),
  decomposition: candidateDecompositionSchema.optional(),
  parentFindingId: z.string().optional(),
  childFindingIds: z.array(z.string()).default([]),
  supersededByFindingId: z.string().optional(),
  supersedesFindingIds: z.array(z.string()).default([]),
  observationIds: z.array(z.string()),
  currentObservationId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type FindingRecord = z.infer<typeof findingRecordSchema>;

export const candidateObservationRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("candidate_observation"),
  id: z.string(),
  findingId: z.string(),
  candidateId: z.string(),
  runId: z.string(),
  displayId: z.string().optional(),
  signature: findingSignatureSchema,
  identityConfidence: z.enum(identityConfidenceLevels),
  baselineStatus: z.enum(baselineStatuses).optional(),
  files: z.array(fileReferenceSchema).default([]),
  evidenceIds: z.array(z.string()).default([]),
  rank: z.number().int().positive().optional(),
  evidenceFreshness: z.enum(evidenceFreshnessStates),
  observedAt: z.string(),
});

export type CandidateObservationRecord = z.infer<typeof candidateObservationRecordSchema>;

export const identityMatchRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("identity_match"),
  id: z.string(),
  runId: z.string(),
  candidateId: z.string(),
  signature: findingSignatureSchema,
  matchedFindingId: z.string().optional(),
  confidence: z.enum(identityConfidenceLevels),
  reason: z.string(),
  unsafeMergeRefused: z.boolean().default(false),
  possiblePredecessorFindingIds: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export type IdentityMatchRecord = z.infer<typeof identityMatchRecordSchema>;

export const lifecycleEventRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("lifecycle_event"),
  id: z.string(),
  targetType: z.enum(["finding", "theme", "report", "plan", "handoff", "revalidation", "fix_attempt"]),
  targetId: z.string(),
  findingId: z.string().optional(),
  runId: z.string().optional(),
  kind: z.enum(lifecycleEventKinds),
  fromState: z.string().optional(),
  toState: z.string().optional(),
  note: z.string().optional(),
  actor: z.string().optional(),
  command: z.string().optional(),
  createdAt: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type LifecycleEventRecord = z.infer<typeof lifecycleEventRecordSchema>;

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

export const clusterRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("cluster"),
  id: z.string(),
  runId: z.string(),
  title: z.string(),
  summary: z.string(),
  category: z.enum(candidateCategories),
  status: z.enum(candidateStatuses),
  priority: z.enum(priorities),
  confidence: z.enum(confidenceLevels),
  impact: z.enum(impactLevels),
  effort: z.enum(effortLevels),
  risk: z.enum(riskLevels),
  candidateIds: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  files: z.array(fileReferenceSchema),
  rationale: z.string(),
  suggestedDirection: z.string(),
  verification: z.array(z.string()),
  actionability: z.enum(clusterActionability).optional(),
  warnings: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ClusterRecord = z.infer<typeof clusterRecordSchema>;

export const runRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("run"),
  id: z.string(),
  command: z.literal("scan"),
  root: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  featureCount: z.number().int().nonnegative().optional(),
  evidenceCount: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative(),
  clusterCount: z.number().int().nonnegative().optional(),
  synthesis: z.object({
    requested: z.boolean(),
    provider: z.string().optional(),
    candidateCount: z.number().int().nonnegative(),
    attemptId: z.string().optional(),
    acceptedCandidateCount: z.number().int().nonnegative().optional(),
    rejectedCandidateCount: z.number().int().nonnegative().optional(),
    runtime: z.record(z.string(), z.unknown()).optional(),
  }),
  scope: z.object({
    incremental: z.boolean(),
    since: z.string().optional(),
    mergeBase: z.string().optional(),
    includeDirty: z.boolean(),
    paths: z.array(z.string()),
    changedPaths: z.array(z.string()),
    categories: z.array(z.string()),
    reviewers: z.array(z.string()),
    onlyExisting: z.boolean(),
    newOnly: z.boolean(),
    dirtyPaths: z.array(z.string()),
  }).optional(),
  diagnostics: z.array(diagnosticSchema),
});

export type RunRecord = z.infer<typeof runRecordSchema>;

export const triageRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("triage"),
  id: z.string(),
  candidateId: z.string(),
  fromStatus: z.enum(candidateStatuses),
  toStatus: z.enum(candidateStatuses),
  note: z.string(),
  createdAt: z.string(),
});

export type TriageRecord = z.infer<typeof triageRecordSchema>;

export const reportRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("report"),
  id: z.string(),
  runId: z.string(),
  createdAt: z.string(),
  candidateIds: z.array(z.string()),
  summary: z.object({
    open: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    byPriority: z.record(z.string(), z.number().int().nonnegative()),
  }),
  recommendations: z.object({
    startHere: z.object({
      id: z.string(),
      type: z.enum(["candidate", "theme"]),
      reason: z.string(),
      featureId: z.string().optional(),
      featureTitle: z.string().optional(),
    }).optional(),
    topCandidateIds: z.array(z.string()),
    topThemeIds: z.array(z.string()),
    warnings: z.array(z.string()),
    suggestedPlanTargets: z.array(z.string()),
  }).optional(),
});

export type ReportRecord = z.infer<typeof reportRecordSchema>;

export const planStepSchema = z.object({
  title: z.string(),
  description: z.string(),
  candidateIds: z.array(z.string()),
  files: z.array(fileReferenceSchema),
  verification: z.array(z.string()),
});

export const planRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("plan"),
  id: z.string(),
  runId: z.string(),
  targetType: z.enum(["candidate", "cluster"]),
  targetId: z.string(),
  title: z.string(),
  summary: z.string(),
  steps: z.array(planStepSchema),
  constraints: z.array(z.string()),
  verification: z.array(z.string()),
  createdAt: z.string(),
  content: z.string(),
});

export type PlanRecord = z.infer<typeof planRecordSchema>;

export const handoffRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("handoff"),
  id: z.string(),
  candidateId: z.string(),
  format: z.string(),
  createdAt: z.string(),
  content: z.string(),
});

export type HandoffRecord = z.infer<typeof handoffRecordSchema>;
