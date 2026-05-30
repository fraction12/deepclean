import { z } from "zod";
import { schemaVersion } from "./defaults.js";
import { fileReferenceSchema } from "./file-references.js";
import {
  baselineStatuses,
  candidateCategories,
  candidateStatuses,
  confidenceLevels,
  effortLevels,
  evidenceFreshnessStates,
  identityConfidenceLevels,
  impactLevels,
  lifecycleEventKinds,
  lifecycleStates,
  priorities,
  riskLevels,
} from "./type-kinds.js";
import {
  candidateDecompositionSchema,
  findingSignatureSchema,
} from "./candidate-types.js";

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
