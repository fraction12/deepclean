import { z } from "zod";
import { schemaVersion } from "./defaults.js";
import { fileReferenceSchema } from "./file-references.js";
import { diagnosticSchema } from "./json.js";
import {
  candidateCategories,
  candidateStatuses,
  clusterActionability,
  confidenceLevels,
  effortLevels,
  impactLevels,
  priorities,
  riskLevels,
} from "./type-kinds.js";

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
    bySlopType: z.record(z.string(), z.number().int().nonnegative()).optional(),
    byFixability: z.record(z.string(), z.number().int().nonnegative()).optional(),
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
  targetType: z.enum(["candidate", "cluster", "opportunity"]),
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
  candidateId: z.string().optional(),
  targetType: z.enum(["candidate", "opportunity"]).default("candidate"),
  targetId: z.string().optional(),
  opportunityId: z.string().optional(),
  format: z.string(),
  createdAt: z.string(),
  content: z.string(),
});

export type HandoffRecord = z.infer<typeof handoffRecordSchema>;
