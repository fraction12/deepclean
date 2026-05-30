import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { lockRecordSchema, type LockRecord } from "./locks.js";
import type { StatePaths } from "./state-paths.js";
import {
  candidateObservationRecordSchema,
  candidateRecordSchema,
  ciRunRecordSchema,
  clusterRecordSchema,
  evidenceRecordSchema,
  featureRecordSchema,
  findingRecordSchema,
  fixAttemptRecordSchema,
  handoffRecordSchema,
  identityMatchRecordSchema,
  lifecycleEventRecordSchema,
  planRecordSchema,
  reportRecordSchema,
  retentionManifestRecordSchema,
  revalidationRecordSchema,
  runRecordSchema,
  synthesisAttemptRecordSchema,
  triageRecordSchema,
  type CandidateObservationRecord,
  type CandidateRecord,
  type CiRunRecord,
  type ClusterRecord,
  type EvidenceRecord,
  type FeatureRecord,
  type FindingRecord,
  type FixAttemptRecord,
  type HandoffRecord,
  type IdentityMatchRecord,
  type LifecycleEventRecord,
  type PlanRecord,
  type ReportRecord,
  type RetentionManifestRecord,
  type RevalidationRecord,
  type RunRecord,
  type SynthesisAttemptRecord,
  type TriageRecord,
} from "./types.js";

export async function writeRun(paths: StatePaths, run: RunRecord): Promise<string> {
  runRecordSchema.parse(run);
  const filePath = path.join(paths.runsDir, `${run.id}.json`);
  await writeJson(filePath, run);
  return filePath;
}

export async function writeEvidence(
  paths: StatePaths,
  runId: string,
  records: EvidenceRecord[],
): Promise<string> {
  for (const record of records) {
    evidenceRecordSchema.parse(record);
  }
  const filePath = path.join(paths.evidenceDir, `${runId}.json`);
  await writeJson(filePath, records);
  return filePath;
}

export async function writeFeatures(
  paths: StatePaths,
  runId: string,
  records: FeatureRecord[],
): Promise<string> {
  for (const record of records) {
    featureRecordSchema.parse(record);
  }
  const filePath = path.join(paths.featuresDir, `${runId}.json`);
  await writeJson(filePath, records);
  return filePath;
}

export async function writeCandidates(
  paths: StatePaths,
  runId: string,
  records: CandidateRecord[],
): Promise<string> {
  for (const record of records) {
    candidateRecordSchema.parse(record);
  }
  const filePath = path.join(paths.candidatesDir, `${runId}.json`);
  await writeJson(filePath, records);
  return filePath;
}

export async function writeFinding(
  paths: StatePaths,
  record: FindingRecord,
): Promise<string> {
  findingRecordSchema.parse(record);
  const filePath = path.join(paths.findingsDir, `${record.id}.json`);
  await writeJson(filePath, record);
  return filePath;
}

export async function writeFindings(
  paths: StatePaths,
  records: FindingRecord[],
): Promise<string[]> {
  const written: string[] = [];
  for (const record of records) {
    written.push(await writeFinding(paths, record));
  }
  return written;
}

export async function writeCandidateObservations(
  paths: StatePaths,
  runId: string,
  records: CandidateObservationRecord[],
): Promise<string> {
  for (const record of records) {
    candidateObservationRecordSchema.parse(record);
  }
  const filePath = path.join(paths.observationsDir, `${runId}.json`);
  await writeJson(filePath, records);
  return filePath;
}

export async function writeLifecycleEvent(
  paths: StatePaths,
  record: LifecycleEventRecord,
): Promise<string> {
  lifecycleEventRecordSchema.parse(record);
  const filePath = path.join(paths.lifecycleDir, `${record.id}.json`);
  await writeJson(filePath, record);
  return filePath;
}

export async function writeLifecycleEvents(
  paths: StatePaths,
  records: LifecycleEventRecord[],
): Promise<string[]> {
  const written: string[] = [];
  for (const record of records) {
    written.push(await writeLifecycleEvent(paths, record));
  }
  return written;
}

export async function writeIdentityMatch(
  paths: StatePaths,
  record: IdentityMatchRecord,
): Promise<string> {
  identityMatchRecordSchema.parse(record);
  const filePath = path.join(paths.identityMatchesDir, `${record.id}.json`);
  await writeJson(filePath, record);
  return filePath;
}

export async function writeIdentityMatches(
  paths: StatePaths,
  records: IdentityMatchRecord[],
): Promise<string[]> {
  const written: string[] = [];
  for (const record of records) {
    written.push(await writeIdentityMatch(paths, record));
  }
  return written;
}

export async function writeRevalidation(
  paths: StatePaths,
  record: RevalidationRecord,
): Promise<string> {
  revalidationRecordSchema.parse(record);
  const filePath = path.join(paths.revalidationsDir, `${record.id}.json`);
  await writeJson(filePath, record);
  return filePath;
}

export async function writeCiRun(
  paths: StatePaths,
  record: CiRunRecord,
): Promise<string> {
  ciRunRecordSchema.parse(record);
  const filePath = path.join(paths.ciDir, `${record.id}.json`);
  await writeJson(filePath, record);
  return filePath;
}

export async function writeLock(
  paths: StatePaths,
  record: LockRecord,
): Promise<string> {
  lockRecordSchema.parse(record);
  const filePath = path.join(paths.locksDir, `${record.id}.json`);
  await writeJson(filePath, record);
  return filePath;
}

export async function writeRetentionManifest(
  paths: StatePaths,
  record: RetentionManifestRecord,
): Promise<string> {
  retentionManifestRecordSchema.parse(record);
  const filePath = path.join(paths.retentionDir, `${record.id}.json`);
  await writeJson(filePath, record);
  return filePath;
}

export async function writeFixAttempt(
  paths: StatePaths,
  record: FixAttemptRecord,
): Promise<string> {
  fixAttemptRecordSchema.parse(record);
  const filePath = path.join(paths.fixesDir, `${record.id}.json`);
  await writeJson(filePath, record);
  return filePath;
}

export async function writeSynthesisAttempt(
  paths: StatePaths,
  record: SynthesisAttemptRecord,
): Promise<string> {
  synthesisAttemptRecordSchema.parse(record);
  const filePath = path.join(paths.synthesisDir, `${record.runId}.json`);
  await writeJson(filePath, record);
  return filePath;
}

export async function writeReport(
  paths: StatePaths,
  report: ReportRecord,
  markdown: string,
): Promise<{ jsonPath: string; markdownPath: string }> {
  reportRecordSchema.parse(report);
  const jsonPath = path.join(paths.reportsDir, `${report.id}.json`);
  const markdownPath = path.join(paths.reportsDir, `${report.id}.md`);
  await writeJson(jsonPath, report);
  await writeFile(markdownPath, markdown, "utf8");
  return { jsonPath, markdownPath };
}

export async function writeClusters(
  paths: StatePaths,
  runId: string,
  records: ClusterRecord[],
): Promise<string> {
  for (const record of records) {
    clusterRecordSchema.parse(record);
  }
  const filePath = path.join(paths.clustersDir, `${runId}.json`);
  await writeJson(filePath, records);
  return filePath;
}

export async function writeTriage(
  paths: StatePaths,
  triage: TriageRecord,
): Promise<string> {
  triageRecordSchema.parse(triage);
  const filePath = path.join(paths.triageDir, `${triage.id}.json`);
  await writeJson(filePath, triage);
  return filePath;
}

export async function writeHandoff(
  paths: StatePaths,
  handoff: HandoffRecord,
): Promise<string> {
  handoffRecordSchema.parse(handoff);
  const filePath = path.join(paths.handoffsDir, `${handoff.id}.json`);
  await writeJson(filePath, handoff);
  return filePath;
}

export async function writePlan(
  paths: StatePaths,
  plan: PlanRecord,
): Promise<string> {
  planRecordSchema.parse(plan);
  const filePath = path.join(paths.plansDir, `${plan.id}.json`);
  await writeJson(filePath, plan);
  return filePath;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
