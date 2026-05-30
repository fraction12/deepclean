import { z } from "zod";
import { schemaVersion } from "./defaults.js";
import { fileReferenceSchema } from "./file-references.js";
import {
  confidenceLevels,
  featureFileRoles,
  featureKinds,
  featureMapSources,
} from "./type-kinds.js";

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
