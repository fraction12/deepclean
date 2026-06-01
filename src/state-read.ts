import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { StatePaths } from "./state-paths.js";
import {
  candidateObservationRecordSchema,
  candidateRecordSchema,
  analyzerSetupPlanRecordSchema,
  campaignSummaryRecordSchema,
  clusterRecordSchema,
  evidenceRecordSchema,
  featureRecordSchema,
  findingRecordSchema,
  fixAttemptRecordSchema,
  handoffRecordSchema,
  identityMatchRecordSchema,
  lifecycleEventRecordSchema,
  planRecordSchema,
  prOpportunityRecordSchema,
  qualityGateResultRecordSchema,
  qualityProfileRecordSchema,
  reportRecordSchema,
  revalidationRecordSchema,
  runRecordSchema,
  synthesisAttemptRecordSchema,
  type CandidateObservationRecord,
  type CandidateRecord,
  type AnalyzerSetupPlanRecord,
  type CampaignSummaryRecord,
  type ClusterRecord,
  type EvidenceRecord,
  type FeatureRecord,
  type FindingRecord,
  type FixAttemptRecord,
  type HandoffRecord,
  type IdentityMatchRecord,
  type LifecycleEventRecord,
  type PlanRecord,
  type PrOpportunityRecord,
  type QualityGateResultRecord,
  type QualityProfileRecord,
  type ReportRecord,
  type RevalidationRecord,
  type RunRecord,
  type SynthesisAttemptRecord,
} from "./types.js";
import { writeCandidates } from "./state-write.js";

export async function latestRunId(paths: StatePaths): Promise<string | undefined> {
  const files = await jsonFiles(paths.runsDir);
  return files.at(-1)?.replace(/\.json$/, "");
}

export async function readRuns(paths: StatePaths): Promise<RunRecord[]> {
  const files = await jsonFiles(paths.runsDir);
  const runs: RunRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.runsDir, file), "utf8");
    runs.push(runRecordSchema.parse(JSON.parse(raw)));
  }
  return runs.sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.id.localeCompare(b.id));
}

export async function readLatestCandidates(
  paths: StatePaths,
): Promise<CandidateRecord[]> {
  const runId = await latestRunId(paths);
  if (!runId) {
    return [];
  }
  return readCandidates(paths, runId);
}

export async function readLatestClusters(paths: StatePaths): Promise<ClusterRecord[]> {
  const runId = await latestRunId(paths);
  if (!runId) {
    return [];
  }
  return readClusters(paths, runId);
}

export async function readLatestEvidence(paths: StatePaths): Promise<EvidenceRecord[]> {
  const runId = await latestRunId(paths);
  if (!runId) {
    return [];
  }
  return readEvidence(paths, runId);
}

export async function readLatestSynthesisAttempt(paths: StatePaths): Promise<SynthesisAttemptRecord | undefined> {
  const runId = await latestRunId(paths);
  if (!runId) {
    return undefined;
  }
  return readSynthesisAttempt(paths, runId);
}

export async function readLatestFeatures(paths: StatePaths): Promise<FeatureRecord[]> {
  const runId = await latestFeatureRunId(paths);
  if (!runId) {
    return [];
  }
  return readFeatures(paths, runId);
}

export async function readFindings(paths: StatePaths): Promise<FindingRecord[]> {
  const files = await jsonFiles(paths.findingsDir);
  const findings: FindingRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.findingsDir, file), "utf8");
    findings.push(findingRecordSchema.parse(JSON.parse(raw)));
  }
  return findings.sort((a, b) => a.id.localeCompare(b.id));
}

export async function readLatestObservations(
  paths: StatePaths,
): Promise<CandidateObservationRecord[]> {
  const runId = await latestRunId(paths);
  if (!runId) {
    return [];
  }
  return readCandidateObservations(paths, runId);
}

export async function readCandidateObservations(
  paths: StatePaths,
  runId: string,
): Promise<CandidateObservationRecord[]> {
  try {
    const raw = await readFile(path.join(paths.observationsDir, `${runId}.json`), "utf8");
    const parsed = JSON.parse(raw) as unknown[];
    return parsed.map((item) => candidateObservationRecordSchema.parse(item));
  } catch {
    return [];
  }
}

export async function readLifecycleEvents(paths: StatePaths): Promise<LifecycleEventRecord[]> {
  const files = await jsonFiles(paths.lifecycleDir);
  const events: LifecycleEventRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.lifecycleDir, file), "utf8");
    events.push(lifecycleEventRecordSchema.parse(JSON.parse(raw)));
  }
  return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function readIdentityMatches(paths: StatePaths): Promise<IdentityMatchRecord[]> {
  const files = await jsonFiles(paths.identityMatchesDir);
  const records: IdentityMatchRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.identityMatchesDir, file), "utf8");
    records.push(identityMatchRecordSchema.parse(JSON.parse(raw)));
  }
  return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function readFixAttempts(paths: StatePaths): Promise<FixAttemptRecord[]> {
  const files = await jsonFiles(paths.fixesDir);
  const attempts: FixAttemptRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.fixesDir, file), "utf8");
    attempts.push(fixAttemptRecordSchema.parse(JSON.parse(raw)));
  }
  return attempts.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function readRevalidations(paths: StatePaths): Promise<RevalidationRecord[]> {
  const files = await jsonFiles(paths.revalidationsDir);
  const records: RevalidationRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.revalidationsDir, file), "utf8");
    records.push(revalidationRecordSchema.parse(JSON.parse(raw)));
  }
  return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function readLatestPrOpportunities(paths: StatePaths): Promise<PrOpportunityRecord[]> {
  const runId = await latestRunId(paths);
  if (!runId) {
    return [];
  }
  return readPrOpportunities(paths, runId);
}

export async function readAllPrOpportunities(paths: StatePaths): Promise<PrOpportunityRecord[]> {
  const files = await jsonFiles(paths.opportunitiesDir);
  const records: PrOpportunityRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.opportunitiesDir, file), "utf8");
    const parsed = JSON.parse(raw) as unknown[];
    records.push(...parsed.map((item) => prOpportunityRecordSchema.parse(item)));
  }
  return records.sort((a, b) => a.runId.localeCompare(b.runId) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function readPrOpportunities(
  paths: StatePaths,
  runId: string,
): Promise<PrOpportunityRecord[]> {
  try {
    const raw = await readFile(path.join(paths.opportunitiesDir, `${runId}.json`), "utf8");
    const parsed = JSON.parse(raw) as unknown[];
    return parsed.map((item) => prOpportunityRecordSchema.parse(item));
  } catch {
    return [];
  }
}

export async function readCampaignSummaries(paths: StatePaths): Promise<CampaignSummaryRecord[]> {
  const files = await jsonFiles(paths.campaignsDir);
  const summaries: CampaignSummaryRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.campaignsDir, file), "utf8");
    summaries.push(campaignSummaryRecordSchema.parse(JSON.parse(raw)));
  }
  return summaries.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function readQualityProfiles(paths: StatePaths): Promise<QualityProfileRecord[]> {
  const files = await jsonFiles(paths.qualityProfilesDir);
  const profiles: QualityProfileRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.qualityProfilesDir, file), "utf8");
    profiles.push(qualityProfileRecordSchema.parse(JSON.parse(raw)));
  }
  return profiles.sort((a, b) => a.id.localeCompare(b.id));
}

export async function readQualityGateResults(paths: StatePaths): Promise<QualityGateResultRecord[]> {
  const files = await jsonFiles(paths.qualityResultsDir);
  const results: QualityGateResultRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.qualityResultsDir, file), "utf8");
    results.push(qualityGateResultRecordSchema.parse(JSON.parse(raw)));
  }
  return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function readAnalyzerSetupPlans(paths: StatePaths): Promise<AnalyzerSetupPlanRecord[]> {
  const files = await jsonFiles(paths.analyzerSetupDir);
  const plans: AnalyzerSetupPlanRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.analyzerSetupDir, file), "utf8");
    plans.push(analyzerSetupPlanRecordSchema.parse(JSON.parse(raw)));
  }
  return plans.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function readReports(paths: StatePaths): Promise<ReportRecord[]> {
  const files = await jsonFiles(paths.reportsDir);
  const reports: ReportRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.reportsDir, file), "utf8");
    reports.push(reportRecordSchema.parse(JSON.parse(raw)));
  }
  return reports.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function readPlans(paths: StatePaths): Promise<PlanRecord[]> {
  const files = await jsonFiles(paths.plansDir);
  const plans: PlanRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.plansDir, file), "utf8");
    plans.push(planRecordSchema.parse(JSON.parse(raw)));
  }
  return plans.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function readHandoffs(paths: StatePaths): Promise<HandoffRecord[]> {
  const files = await jsonFiles(paths.handoffsDir);
  const handoffs: HandoffRecord[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(paths.handoffsDir, file), "utf8");
    handoffs.push(handoffRecordSchema.parse(JSON.parse(raw)));
  }
  return handoffs.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function readClusters(
  paths: StatePaths,
  runId: string,
): Promise<ClusterRecord[]> {
  try {
    const raw = await readFile(path.join(paths.clustersDir, `${runId}.json`), "utf8");
    const parsed = JSON.parse(raw) as unknown[];
    return parsed.map((item) => clusterRecordSchema.parse(item));
  } catch {
    return [];
  }
}

export async function readCandidates(
  paths: StatePaths,
  runId: string,
): Promise<CandidateRecord[]> {
  const raw = await readFile(path.join(paths.candidatesDir, `${runId}.json`), "utf8");
  const parsed = JSON.parse(raw) as unknown[];
  return parsed.map((item) => candidateRecordSchema.parse(item));
}

export async function readEvidence(
  paths: StatePaths,
  runId: string,
): Promise<EvidenceRecord[]> {
  const raw = await readFile(path.join(paths.evidenceDir, `${runId}.json`), "utf8");
  const parsed = JSON.parse(raw) as unknown[];
  return parsed.map((item) => evidenceRecordSchema.parse(item));
}

export async function readSynthesisAttempt(
  paths: StatePaths,
  runId: string,
): Promise<SynthesisAttemptRecord | undefined> {
  try {
    const raw = await readFile(path.join(paths.synthesisDir, `${runId}.json`), "utf8");
    return synthesisAttemptRecordSchema.parse(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export async function readFeatures(
  paths: StatePaths,
  runId: string,
): Promise<FeatureRecord[]> {
  const raw = await readFile(path.join(paths.featuresDir, `${runId}.json`), "utf8");
  const parsed = JSON.parse(raw) as unknown[];
  return parsed.map((item) => featureRecordSchema.parse(item));
}

export async function updateLatestCandidates(
  paths: StatePaths,
  candidates: CandidateRecord[],
): Promise<string> {
  const runId = await latestRunId(paths);
  if (!runId) {
    throw new Error("No scan run exists yet");
  }
  return writeCandidates(paths, runId, candidates);
}

async function jsonFiles(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files.filter((file) => file.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

async function latestFeatureRunId(paths: StatePaths): Promise<string | undefined> {
  const files = await jsonFiles(paths.featuresDir);
  return files.at(-1)?.replace(/\.json$/, "");
}
