import { z } from "zod";
import { schemaVersion } from "./defaults.js";
import { fileReferenceSchema } from "./file-references.js";
import { diagnosticSchema } from "./json.js";
import {
  analyzerCoverageStatuses,
  analyzerEvidenceClasses,
  fixabilityLevels,
  qualityActionabilities,
  qualityGateFamilies,
  qualityGateStatuses,
  qualityProfileModes,
  qualityProfileScopes,
} from "./type-kinds.js";

export const analyzerClassSchema = z.object({
  id: z.string(),
  family: z.enum(qualityGateFamilies),
  evidenceClass: z.enum(analyzerEvidenceClasses),
  required: z.boolean().default(false),
  command: z.string().optional(),
  outputPath: z.string().optional(),
  notes: z.array(z.string()).default([]),
});

export type AnalyzerClass = z.infer<typeof analyzerClassSchema>;

export const qualityGatePolicySchema = z.object({
  family: z.enum(qualityGateFamilies),
  mode: z.enum(qualityProfileModes),
  thresholds: z.record(z.string(), z.unknown()).default({}),
  requiredAnalyzerClasses: z.array(z.string()).default([]),
  advisoryAnalyzerClasses: z.array(z.string()).default([]),
});

export type QualityGatePolicy = z.infer<typeof qualityGatePolicySchema>;

export const qualityProfileRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("quality_profile"),
  id: z.string(),
  name: z.string(),
  mode: z.enum(qualityProfileModes),
  scope: z.enum(qualityProfileScopes).default("pr"),
  extends: z.string().optional(),
  gates: z.array(qualityGatePolicySchema),
  analyzerInputs: z.array(analyzerClassSchema).default([]),
  requiredAnalyzerClasses: z.array(z.string()).default([]),
  recommendedAnalyzerClasses: z.array(z.string()).default([]),
  baselineRef: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type QualityProfileRecord = z.infer<typeof qualityProfileRecordSchema>;

export const qualityGateFindingSchema = z.object({
  id: z.string(),
  family: z.enum(qualityGateFamilies),
  title: z.string(),
  severity: z.enum(["blocker", "advisory", "info"]),
  actionability: z.enum(qualityActionabilities).optional(),
  fixability: z.enum(fixabilityLevels).optional(),
  baselineStatus: z.enum(["new", "existing", "worsened", "improved", "fixed", "unknown"]).default("unknown"),
  evidenceIds: z.array(z.string()).default([]),
  candidateIds: z.array(z.string()).default([]),
  findingIds: z.array(z.string()).default([]),
  opportunityIds: z.array(z.string()).default([]),
  analyzerRuleIds: z.array(z.string()).default([]),
  files: z.array(fileReferenceSchema).default([]),
  summary: z.string(),
});

export type QualityGateFinding = z.infer<typeof qualityGateFindingSchema>;

export const analyzerProvenanceSchema = z.object({
  analyzerId: z.string(),
  family: z.enum(qualityGateFamilies),
  evidenceClass: z.enum(analyzerEvidenceClasses),
  status: z.enum(analyzerCoverageStatuses),
  command: z.string().optional(),
  outputPath: z.string().optional(),
  ruleIds: z.array(z.string()).default([]),
  diagnosticIds: z.array(z.string()).default([]),
});

export type AnalyzerProvenance = z.infer<typeof analyzerProvenanceSchema>;

export const qualityGateCoverageSchema = z.object({
  family: z.enum(qualityGateFamilies),
  status: z.enum(analyzerCoverageStatuses),
  evidenceClass: z.enum(analyzerEvidenceClasses),
  analyzerIds: z.array(z.string()).default([]),
  summary: z.string(),
});

export type QualityGateCoverage = z.infer<typeof qualityGateCoverageSchema>;

export const qualityGateResultRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("quality_gate_result"),
  id: z.string(),
  runId: z.string().optional(),
  profileId: z.string(),
  baselineRef: z.string().optional(),
  headRef: z.string().optional(),
  status: z.enum(qualityGateStatuses),
  blockers: z.array(qualityGateFindingSchema),
  advisories: z.array(qualityGateFindingSchema),
  regressions: z.array(qualityGateFindingSchema),
  improvements: z.array(qualityGateFindingSchema),
  analyzerProvenance: z.array(analyzerProvenanceSchema),
  coverageStatus: z.array(qualityGateCoverageSchema).default([]),
  artifactPaths: z.object({
    json: z.string().optional(),
    markdown: z.string().optional(),
    sarif: z.string().optional(),
  }).default({}),
  diagnostics: z.array(diagnosticSchema),
  createdAt: z.string(),
});

export type QualityGateResultRecord = z.infer<typeof qualityGateResultRecordSchema>;

export const analyzerSetupRecommendationSchema = z.object({
  analyzerId: z.string(),
  family: z.enum(qualityGateFamilies),
  evidenceClass: z.enum(analyzerEvidenceClasses).default("recommended-analyzer"),
  title: z.string(),
  command: z.string().optional(),
  outputPath: z.string().optional(),
  filesToChange: z.array(z.string()).default([]),
  immediatelyRunnable: z.boolean(),
  requiresInstall: z.boolean(),
  advisory: z.boolean().default(true),
  rationale: z.string(),
});

export type AnalyzerSetupRecommendation = z.infer<typeof analyzerSetupRecommendationSchema>;

export const analyzerSetupPlanRecordSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("analyzer_setup_plan"),
  id: z.string(),
  root: z.string(),
  ecosystem: z.string(),
  packageManager: z.string().optional(),
  existingScripts: z.record(z.string(), z.string()).default({}),
  ciFiles: z.array(z.string()).default([]),
  configuredAnalyzers: z.array(analyzerClassSchema).default([]),
  recommendations: z.array(analyzerSetupRecommendationSchema),
  coverageStatus: z.array(qualityGateCoverageSchema).default([]),
  dryRun: z.boolean().default(true),
  diagnostics: z.array(diagnosticSchema),
  createdAt: z.string(),
});

export type AnalyzerSetupPlanRecord = z.infer<typeof analyzerSetupPlanRecordSchema>;
