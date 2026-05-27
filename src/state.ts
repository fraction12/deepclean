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
  findingRecordSchema,
  fixAttemptRecordSchema,
  handoffRecordSchema,
  lifecycleEventRecordSchema,
  lockRecordSchema,
  planRecordSchema,
  reportRecordSchema,
  retentionManifestRecordSchema,
  revalidationRecordSchema,
  runRecordSchema,
  triageRecordSchema,
  type CandidateObservationRecord,
  type CandidateRecord,
  type CiRunRecord,
  type ClusterRecord,
  type DeepcleanConfig,
  type EvidenceRecord,
  type FindingRecord,
  type FixAttemptRecord,
  type HandoffRecord,
  type LifecycleEventRecord,
  type LockRecord,
  type PlanRecord,
  type ReportRecord,
  type RetentionManifestRecord,
  type RevalidationRecord,
  type RunRecord,
  type TriageRecord,
} from "./types.js";

export interface StatePaths {
  root: string;
  stateDir: string;
  configPath: string;
  runsDir: string;
  findingsDir: string;
  observationsDir: string;
  evidenceDir: string;
  candidatesDir: string;
  clustersDir: string;
  reportsDir: string;
  triageDir: string;
  handoffsDir: string;
  plansDir: string;
  lifecycleDir: string;
  revalidationsDir: string;
  ciDir: string;
  locksDir: string;
  retentionDir: string;
  fixesDir: string;
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
    evidenceDir: path.join(stateDir, "evidence"),
    candidatesDir: path.join(stateDir, "candidates"),
    clustersDir: path.join(stateDir, "clusters"),
    reportsDir: path.join(stateDir, "reports"),
    triageDir: path.join(stateDir, "triage"),
    handoffsDir: path.join(stateDir, "handoffs"),
    plansDir: path.join(stateDir, "plans"),
    lifecycleDir: path.join(stateDir, "lifecycle"),
    revalidationsDir: path.join(stateDir, "revalidations"),
    ciDir: path.join(stateDir, "ci"),
    locksDir: path.join(stateDir, "locks"),
    retentionDir: path.join(stateDir, "retention"),
    fixesDir: path.join(stateDir, "fixes"),
  };
}

export async function ensureState(paths: StatePaths): Promise<DeepcleanConfig> {
  await Promise.all([
    mkdir(paths.runsDir, { recursive: true }),
    mkdir(paths.findingsDir, { recursive: true }),
    mkdir(paths.observationsDir, { recursive: true }),
    mkdir(paths.evidenceDir, { recursive: true }),
    mkdir(paths.candidatesDir, { recursive: true }),
    mkdir(paths.clustersDir, { recursive: true }),
    mkdir(paths.reportsDir, { recursive: true }),
    mkdir(paths.triageDir, { recursive: true }),
    mkdir(paths.handoffsDir, { recursive: true }),
    mkdir(paths.plansDir, { recursive: true }),
    mkdir(paths.lifecycleDir, { recursive: true }),
    mkdir(paths.revalidationsDir, { recursive: true }),
    mkdir(paths.ciDir, { recursive: true }),
    mkdir(paths.locksDir, { recursive: true }),
    mkdir(paths.retentionDir, { recursive: true }),
    mkdir(paths.fixesDir, { recursive: true }),
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
  };
}
