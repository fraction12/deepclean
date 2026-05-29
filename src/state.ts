import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultConfig, stateDirName } from "./defaults.js";
import {
  candidateRecordSchema,
  clusterRecordSchema,
  configSchema,
  candidateObservationRecordSchema,
  ciRunRecordSchema,
  evidenceRecordSchema,
  featureRecordSchema,
  findingRecordSchema,
  fixAttemptRecordSchema,
  handoffRecordSchema,
  identityMatchRecordSchema,
  lifecycleEventRecordSchema,
  lockRecordSchema,
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
  type DeepcleanConfig,
  type EvidenceRecord,
  type FeatureRecord,
  type FindingRecord,
  type FixAttemptRecord,
  type HandoffRecord,
  type IdentityMatchRecord,
  type LifecycleEventRecord,
  type LockRecord,
  type PlanRecord,
  type ReportRecord,
  type RetentionManifestRecord,
  type RevalidationRecord,
  type RunRecord,
  type SynthesisAttemptRecord,
  type TriageRecord,
} from "./types.js";

export interface StatePaths {
  root: string;
  stateDir: string;
  configPath: string;
  runsDir: string;
  findingsDir: string;
  observationsDir: string;
  featuresDir: string;
  evidenceDir: string;
  candidatesDir: string;
  clustersDir: string;
  reportsDir: string;
  triageDir: string;
  handoffsDir: string;
  plansDir: string;
  lifecycleDir: string;
  identityMatchesDir: string;
  revalidationsDir: string;
  ciDir: string;
  locksDir: string;
  retentionDir: string;
  fixesDir: string;
  synthesisDir: string;
}

export function resolveStatePaths(options: {
  cwd: string;
  root?: string | undefined;
  stateDir?: string | undefined;
  config?: string | undefined;
}): StatePaths {
  const root = path.resolve(options.cwd, options.root ?? ".");
  const stateDir = path.resolve(root, options.stateDir ?? stateDirName);
  return {
    root,
    stateDir,
    configPath: path.resolve(root, options.config ?? path.join(stateDir, "config.json")),
    runsDir: path.join(stateDir, "runs"),
    findingsDir: path.join(stateDir, "findings"),
    observationsDir: path.join(stateDir, "observations"),
    featuresDir: path.join(stateDir, "features"),
    evidenceDir: path.join(stateDir, "evidence"),
    candidatesDir: path.join(stateDir, "candidates"),
    clustersDir: path.join(stateDir, "clusters"),
    reportsDir: path.join(stateDir, "reports"),
    triageDir: path.join(stateDir, "triage"),
    handoffsDir: path.join(stateDir, "handoffs"),
    plansDir: path.join(stateDir, "plans"),
    lifecycleDir: path.join(stateDir, "lifecycle"),
    identityMatchesDir: path.join(stateDir, "identity-matches"),
    revalidationsDir: path.join(stateDir, "revalidations"),
    ciDir: path.join(stateDir, "ci"),
    locksDir: path.join(stateDir, "locks"),
    retentionDir: path.join(stateDir, "retention"),
    fixesDir: path.join(stateDir, "fixes"),
    synthesisDir: path.join(stateDir, "synthesis"),
  };
}

export async function ensureState(paths: StatePaths): Promise<DeepcleanConfig> {
  await Promise.all([
    mkdir(paths.runsDir, { recursive: true }),
    mkdir(paths.findingsDir, { recursive: true }),
    mkdir(paths.observationsDir, { recursive: true }),
    mkdir(paths.featuresDir, { recursive: true }),
    mkdir(paths.evidenceDir, { recursive: true }),
    mkdir(paths.candidatesDir, { recursive: true }),
    mkdir(paths.clustersDir, { recursive: true }),
    mkdir(paths.reportsDir, { recursive: true }),
    mkdir(paths.triageDir, { recursive: true }),
    mkdir(paths.handoffsDir, { recursive: true }),
    mkdir(paths.plansDir, { recursive: true }),
    mkdir(paths.lifecycleDir, { recursive: true }),
    mkdir(paths.identityMatchesDir, { recursive: true }),
    mkdir(paths.revalidationsDir, { recursive: true }),
    mkdir(paths.ciDir, { recursive: true }),
    mkdir(paths.locksDir, { recursive: true }),
    mkdir(paths.retentionDir, { recursive: true }),
    mkdir(paths.fixesDir, { recursive: true }),
    mkdir(paths.synthesisDir, { recursive: true }),
  ]);

  try {
    return await readConfig(paths);
  } catch {
    const config = defaultConfig();
    await writeJson(paths.configPath, config);
    return config;
  }
}

export async function readConfig(paths: StatePaths): Promise<DeepcleanConfig> {
  const raw = await readFile(paths.configPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<DeepcleanConfig>;
  return configSchema.parse(mergeConfig(defaultConfig(), parsed));
}

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

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function mergeConfig(defaults: DeepcleanConfig, value: Partial<DeepcleanConfig>): DeepcleanConfig {
  return {
    ...defaults,
    ...value,
    reviewSynthesis: {
      ...defaults.reviewSynthesis,
      ...value.reviewSynthesis,
    },
    candidateCaps: {
      byKind: {
        ...defaults.candidateCaps.byKind,
        ...value.candidateCaps?.byKind,
      },
      byKindAndArea: {
        ...defaults.candidateCaps.byKindAndArea,
        ...value.candidateCaps?.byKindAndArea,
      },
    },
    clusters: {
      ...defaults.clusters,
      ...value.clusters,
    },
    architecture: {
      ...defaults.architecture,
      ...value.architecture,
      layers: value.architecture?.layers ?? defaults.architecture.layers,
      rules: value.architecture?.rules ?? defaults.architecture.rules,
    },
    reviewers: {
      ...defaults.reviewers,
      ...value.reviewers,
    },
    externalAnalyzers: {
      jscpd: {
        ...defaults.externalAnalyzers.jscpd,
        ...value.externalAnalyzers?.jscpd,
      },
      semgrep: {
        ...defaults.externalAnalyzers.semgrep,
        ...value.externalAnalyzers?.semgrep,
      },
      sarifPaths: value.externalAnalyzers?.sarifPaths ?? defaults.externalAnalyzers.sarifPaths,
    },
    privacy: {
      ...defaults.privacy,
      ...value.privacy,
    },
    fixExecution: {
      ...defaults.fixExecution,
      ...value.fixExecution,
    },
  };
}
