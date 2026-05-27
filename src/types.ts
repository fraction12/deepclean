import { z } from "zod";

export const schemaVersion = "0.1.0" as const;

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
export const clusterActionability = ["bounded", "too-broad"] as const;
export const identityConfidenceLevels = ["low", "medium", "high"] as const;
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
  "fix-attempted",
  "verification-passed",
  "verification-failed",
] as const;
export const lifecycleStates = [
  "open",
  "suppressed",
  "stale",
  "fixed",
  "superseded",
  "inconclusive",
] as const;
export const revalidationOutcomes = [
  "unchanged",
  "changed",
  "fixed",
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
  "unverified",
] as const;
export const ciRunStatuses = [
  "passed",
  "failed",
  "policy-failed",
  "error",
] as const;

export const diagnosticSchema = z.object({
  level: z.enum(["info", "warning", "error"]),
  code: z.string(),
  message: z.string(),
  adapter: z.string().optional(),
});

export const configSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("config"),
  enabledAdapters: z.array(z.string()),
  exclude: z.array(z.string()),
  reviewSynthesis: z.object({
    enabled: z.boolean(),
    provider: z.literal("codex"),
    command: z.string(),
    model: z.string().optional(),
    timeoutMs: z.number().int().positive(),
    maxCandidates: z.number().int().positive(),
  }),
  candidateCaps: z.object({
    byKind: z.record(z.string(), z.number().int().nonnegative()),
    byKindAndArea: z.record(z.string(), z.number().int().nonnegative()),
  }),
  clusters: z.object({
    maxCandidates: z.number().int().positive(),
    maxFiles: z.number().int().positive(),
    splitBroad: z.boolean(),
  }),
  reviewers: z.object({
    enabled: z.array(z.string()),
    customPaths: z.array(z.string()),
  }),
  externalAnalyzers: z.object({
    jscpd: z.object({
      enabled: z.boolean(),
      command: z.string(),
      minTokens: z.number().int().positive(),
      maxFindings: z.number().int().positive(),
    }),
    semgrep: z.object({
      enabled: z.boolean(),
      command: z.string(),
      config: z.string(),
      timeoutMs: z.number().int().positive(),
      maxFindings: z.number().int().positive(),
    }),
    sarifPaths: z.array(z.string()),
  }),
  privacy: z.object({
    allowSourceInModel: z.boolean(),
    allowWebResearch: z.boolean(),
  }),
});

export type DeepcleanConfig = z.infer<typeof configSchema>;

export const fileReferenceSchema = z.object({
  path: z.string(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
});

export type FileReference = z.infer<typeof fileReferenceSchema>;

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
  data: z.record(z.string(), z.unknown()),
  confidence: z.enum(confidenceLevels),
  createdAt: z.string(),
});

export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;

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
  files: z.array(fileReferenceSchema),
  evidenceIds: z.array(z.string()),
  whyItMatters: z.string(),
  likelyRootCause: z.string(),
  suggestedDirection: z.string(),
  verification: z.array(z.string()),
  provenance: z.object({
    source: z.enum(["local-evidence", "model-synthesis"]),
    provider: z.string().optional(),
    model: z.string().optional(),
    promptVersion: z.string().optional(),
    reviewers: z.array(z.string()).optional(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CandidateRecord = z.infer<typeof candidateRecordSchema>;

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
  signature: findingSignatureSchema,
  identityConfidence: z.enum(identityConfidenceLevels),
  baselineStatus: z.enum(baselineStatuses).optional(),
  evidenceFreshness: z.enum(evidenceFreshnessStates),
  observedAt: z.string(),
});

export type CandidateObservationRecord = z.infer<typeof candidateObservationRecordSchema>;

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

export const revalidationRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("revalidation"),
  id: z.string(),
  targetType: z.enum(["finding", "theme", "all"]),
  targetId: z.string().optional(),
  runId: z.string(),
  outcome: z.enum(revalidationOutcomes),
  evidenceIds: z.array(z.string()),
  previousObservationId: z.string().optional(),
  newObservationId: z.string().optional(),
  supersededByFindingId: z.string().optional(),
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

export const lockRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("lock"),
  id: z.string(),
  owner: z.string(),
  pid: z.number().int().nonnegative(),
  command: z.string(),
  statePath: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
});

export type LockRecord = z.infer<typeof lockRecordSchema>;

export const retentionManifestRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("retention_manifest"),
  id: z.string(),
  dryRun: z.boolean(),
  keepRuns: z.number().int().nonnegative().optional(),
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
  planId: z.string().optional(),
  status: z.enum(fixAttemptStatuses),
  dryRun: z.boolean(),
  changedFiles: z.array(z.string()),
  patchPreviewPath: z.string().optional(),
  verificationCommands: z.array(z.string()),
  verificationResults: z.array(z.object({
    command: z.string(),
    exitCode: z.number().int().optional(),
    passed: z.boolean(),
    outputPath: z.string().optional(),
  })),
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
  evidenceCount: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative(),
  clusterCount: z.number().int().nonnegative().optional(),
  synthesis: z.object({
    requested: z.boolean(),
    provider: z.string().optional(),
    candidateCount: z.number().int().nonnegative(),
  }),
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

export type Diagnostic = z.infer<typeof diagnosticSchema>;

export interface CommandEnvelope<T> {
  ok: true;
  command: string;
  data: T;
  diagnostics: Diagnostic[];
}

export interface ErrorEnvelope {
  ok: false;
  command: string;
  error: {
    code: string;
    message: string;
  };
  diagnostics: Diagnostic[];
}

export type JsonEnvelope<T> = CommandEnvelope<T> | ErrorEnvelope;
