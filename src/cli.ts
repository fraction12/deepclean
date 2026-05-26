#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, flagBoolean, flagString, type ParsedArgs } from "./args.js";
import { candidatesFromEvidence, rankCandidates, reassignCandidateIds } from "./candidates.js";
import { buildClusters, unclusteredCandidateIds } from "./clusters.js";
import { discoverSourceFiles } from "./discovery.js";
import { runEvidenceAdapters } from "./evidence.js";
import { fail, ok } from "./json.js";
import { buildCandidatePlan, buildClusterPlan } from "./plans.js";
import {
  buildHandoff,
  buildReportRecord,
  renderMarkdownReport,
  renderMarkdownReportWithClusters,
} from "./reporting.js";
import {
  ensureState,
  latestRunId,
  readLatestCandidates,
  readLatestClusters,
  readLatestEvidence,
  resolveStatePaths,
  updateLatestCandidates,
  writeCandidates,
  writeClusters,
  writeEvidence,
  writeHandoff,
  writePlan,
  writeReport,
  writeRun,
  writeTriage,
  type StatePaths,
} from "./state.js";
import {
  candidateStatuses,
  schemaVersion,
  type CandidateRecord,
  type ClusterRecord,
  type EvidenceRecord,
} from "./types.js";
import { timestampId } from "./ids.js";
import { synthesizeWithCodex } from "./synthesis.js";
import { inferVerificationProfile } from "./verification.js";

const commands = [
  "init",
  "scan",
  "report",
  "next",
  "show",
  "cluster",
  "plan",
  "triage",
  "handoff",
  "export",
] as const;

interface CommandContext {
  cwd: string;
  parsed: ParsedArgs;
  paths: StatePaths;
  json: boolean;
  quiet: boolean;
}

function printHelp(): void {
  console.log(`deepclean: agent-first cleanup reports for working-but-sloppy codebases

Usage:
  deepclean <command> [args] [flags]

Commands:
  init                         Create or validate .deepclean state
  scan                         Collect local evidence and generate candidates
    --synthesize               Run local Codex synthesis over evidence
    --allow-source-in-model    Include source samples in Codex prompt
    --model <model>            Override Codex model for synthesis
  report                       Write and print a ranked report
  next                         Show the highest-priority open candidate
  show <candidate-or-theme>    Show one candidate or cleanup theme with evidence
  cluster [theme-id]           Group related candidates into cleanup themes
  plan <candidate-or-theme>    Generate an agent-ready cleanup plan
  triage <candidate-id>        Update candidate status with --status and --note
  handoff <candidate-id>       Generate an agent-ready handoff packet
  export <candidate-id>        Alias for handoff

Global flags:
  --json                       Emit JSON envelope
  --plain                      Avoid styled output
  --no-input                   Never prompt
  --root <path>                Target repository root
  --state-dir <path>           State directory, defaults to .deepclean
  --config <path>              Config file, defaults to .deepclean/config.json
  --quiet                      Suppress human success output
  --debug                      Include stack traces for unexpected errors
  -h, --help                   Show help
  --version                    Show version`);
}

export async function main(argv: string[], cwd = process.cwd()): Promise<number> {
  const parsed = parseArgs(argv);
  const command = parsed.command;
  const json = flagBoolean(parsed.flags, "json");
  const quiet = flagBoolean(parsed.flags, "quiet");
  const debug = flagBoolean(parsed.flags, "debug");

  if (!command && flagBoolean(parsed.flags, "version")) {
    console.log(await packageVersion());
    return 0;
  }

  if (!command || command === "-h" || command === "--help" || flagBoolean(parsed.flags, "help") || flagBoolean(parsed.flags, "h")) {
    printHelp();
    return 0;
  }

  if (command === "--version" || command === "version") {
    console.log(await packageVersion());
    return 0;
  }

  if (!commands.includes(command as (typeof commands)[number])) {
    emit(json, fail(command, "unknown_command", `Unknown command: ${command}`));
    return 2;
  }

  const paths = resolveStatePaths({
    cwd,
    root: flagString(parsed.flags, "root"),
    stateDir: flagString(parsed.flags, "state-dir"),
    config: flagString(parsed.flags, "config"),
  });

  const context: CommandContext = { cwd, parsed, paths, json, quiet };

  try {
    switch (command) {
      case "init":
        return await initCommand(context);
      case "scan":
        return await scanCommand(context);
      case "report":
        return await reportCommand(context);
      case "next":
        return await nextCommand(context);
      case "show":
        return await showCommand(context);
      case "cluster":
        return await clusterCommand(context);
      case "plan":
        return await planCommand(context);
      case "triage":
        return await triageCommand(context);
      case "handoff":
      case "export":
        return await handoffCommand(context);
    }
    emit(json, fail(command, "unknown_command", `Unknown command: ${command}`));
    return 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(json, fail(command, "command_failed", debug && error instanceof Error && error.stack ? error.stack : message));
    return 1;
  }
}

async function initCommand(context: CommandContext): Promise<number> {
  const config = await ensureState(context.paths);
  const data = {
    root: context.paths.root,
    stateDir: context.paths.stateDir,
    configPath: context.paths.configPath,
    config,
  };
  emit(context.json, ok("init", data));
  if (!context.json && !context.quiet) {
    console.log(`Initialized Deepclean state at ${path.relative(context.paths.root, context.paths.stateDir) || context.paths.stateDir}`);
  }
  return 0;
}

async function scanCommand(context: CommandContext): Promise<number> {
  const startedAt = new Date().toISOString();
  const runId = timestampId("run");
  const config = await ensureState(context.paths);
  const verificationProfile = await inferVerificationProfile(context.paths.root);
  const files = await discoverSourceFiles(context.paths.root, config.exclude);
  const adapterResult = await runEvidenceAdapters(config.enabledAdapters, {
    root: context.paths.root,
    runId,
    createdAt: startedAt,
    files,
    config,
  });
  const completedAt = new Date().toISOString();
  const localCandidates = candidatesFromEvidence(
    runId,
    adapterResult.evidence,
    completedAt,
    config.candidateCaps,
    verificationProfile,
  );
  const synthesisRequested = flagBoolean(context.parsed.flags, "synthesize")
    || config.reviewSynthesis.enabled;
  const synthesisResult = synthesisRequested
    ? await synthesizeWithCodex({
      root: context.paths.root,
      runId,
      createdAt: completedAt,
      evidence: adapterResult.evidence,
      config,
      existingCandidates: localCandidates,
      includeSource: flagBoolean(context.parsed.flags, "allow-source-in-model")
        || config.privacy.allowSourceInModel,
      model: flagString(context.parsed.flags, "model"),
      verificationProfile,
    })
    : { candidates: [], diagnostics: [] };
  const diagnostics = [...adapterResult.diagnostics, ...synthesisResult.diagnostics];
  const candidates = reassignCandidateIds(rankCandidates([
    ...localCandidates,
    ...synthesisResult.candidates,
  ]));
  const clusters = buildClusters(runId, candidates, adapterResult.evidence, completedAt, config.clusters);

  await writeEvidence(context.paths, runId, adapterResult.evidence);
  await writeCandidates(context.paths, runId, candidates);
  await writeClusters(context.paths, runId, clusters);
  await writeRun(context.paths, {
    schemaVersion,
    recordType: "run",
    id: runId,
    command: "scan",
    root: context.paths.root,
    startedAt,
    completedAt,
    evidenceCount: adapterResult.evidence.length,
    candidateCount: candidates.length,
    clusterCount: clusters.length,
    synthesis: {
      requested: synthesisRequested,
      provider: synthesisRequested ? "codex" : undefined,
      candidateCount: synthesisResult.candidates.length,
    },
    diagnostics,
  });

  const data = {
    runId,
    root: context.paths.root,
    sourceFileCount: files.length,
    evidenceCount: adapterResult.evidence.length,
    candidateCount: candidates.length,
    clusterCount: clusters.length,
    synthesis: {
      requested: synthesisRequested,
      candidateCount: synthesisResult.candidates.length,
    },
    candidates,
    clusters,
  };

  emit(context.json, ok("scan", data, diagnostics));
  if (!context.json && !context.quiet) {
    const synthesisText = synthesisRequested
      ? `, ${synthesisResult.candidates.length} synthesized`
      : "";
    console.log(`Scan complete: ${adapterResult.evidence.length} evidence records, ${candidates.length} candidates, ${clusters.length} clusters${synthesisText}`);
    printCandidateSummary(candidates);
  }
  return 0;
}

async function reportCommand(context: CommandContext): Promise<number> {
  const { candidates, evidence, runId } = await latestState(context.paths);
  const config = await ensureState(context.paths);
  const ranked = rankCandidates(candidates);
  const clusters = buildClusters(runId, ranked, evidence, new Date().toISOString(), config.clusters);
  await writeClusters(context.paths, runId, clusters);
  const report = buildReportRecord(runId, ranked, clusters);
  const markdown = clusters.length > 0
    ? renderMarkdownReportWithClusters(ranked, clusters)
    : renderMarkdownReport(ranked);
  const paths = await writeReport(context.paths, report, markdown);

  emit(context.json, ok("report", {
    report,
    paths,
    reportPath: paths.markdownPath,
    markdownPath: paths.markdownPath,
    jsonPath: paths.jsonPath,
    candidates: ranked,
    clusters,
    evidenceCount: evidence.length,
  }));
  if (!context.json && !context.quiet) {
    console.log(markdown.trimEnd());
    console.log("");
    console.log(`Report written to ${path.relative(context.paths.root, paths.markdownPath)}`);
  }
  return 0;
}

async function nextCommand(context: CommandContext): Promise<number> {
  const candidates = rankCandidates(await readLatestCandidates(context.paths));
  const candidate = candidates.find((item) => item.status === "open");
  emit(context.json, ok("next", { candidate: candidate ?? null }));
  if (!context.json && !context.quiet) {
    if (!candidate) {
      console.log("No open candidates.");
    } else {
      printCandidate(candidate);
    }
  }
  return 0;
}

async function showCommand(context: CommandContext): Promise<number> {
  const id = requireCandidateId(context);
  const { candidates, evidence, clusters, runId } = await latestState(context.paths);
  const config = await ensureState(context.paths);
  const availableClusters = clusters.length > 0 ? clusters : buildClusters(runId, candidates, evidence, new Date().toISOString(), config.clusters);
  const cluster = availableClusters.find((item) => item.id === id);
  if (cluster) {
    const clusterCandidates = candidates.filter((item) => cluster.candidateIds.includes(item.id));
    const supportingEvidence = evidenceForIds(evidence, cluster.evidenceIds);
    emit(context.json, ok("show", { cluster, candidates: clusterCandidates, evidence: supportingEvidence }));
    if (!context.json && !context.quiet) {
      printCluster(cluster);
      for (const candidate of clusterCandidates) {
        console.log(`  candidate ${candidate.id}: ${candidate.title}`);
      }
    }
    return 0;
  }
  const candidate = candidates.find((item) => item.id === id);
  if (!candidate) {
    emit(context.json, fail("show", "candidate_not_found", `Candidate not found: ${id}`));
    return 1;
  }
  const supportingEvidence = evidenceForIds(evidence, candidate.evidenceIds);
  emit(context.json, ok("show", { candidate, evidence: supportingEvidence }));
  if (!context.json && !context.quiet) {
    printCandidate(candidate);
    for (const record of supportingEvidence) {
      console.log(`  evidence ${record.id}: ${record.summary}`);
    }
  }
  return 0;
}

async function clusterCommand(context: CommandContext): Promise<number> {
  const id = context.parsed.positional[0];
  const { candidates, evidence, runId } = await latestState(context.paths);
  const config = await ensureState(context.paths);
  const ranked = rankCandidates(candidates);
  const clusters = buildClusters(runId, ranked, evidence, new Date().toISOString(), config.clusters);
  const clustersPath = await writeClusters(context.paths, runId, clusters);

  if (id) {
    const cluster = clusters.find((item) => item.id === id);
    if (!cluster) {
      emit(context.json, fail("cluster", "theme_not_found", `Theme not found: ${id}`));
      return 1;
    }
    const clusterCandidates = ranked.filter((item) => cluster.candidateIds.includes(item.id));
    const supportingEvidence = evidence.filter((item) => cluster.evidenceIds.includes(item.id));
    emit(context.json, ok("cluster", { cluster, candidates: clusterCandidates, evidence: supportingEvidence, path: clustersPath }));
    if (!context.json && !context.quiet) {
      printCluster(cluster);
      for (const candidate of clusterCandidates) {
        console.log(`  ${candidate.id} ${candidate.title}`);
      }
    }
    return 0;
  }

  const unclustered = unclusteredCandidateIds(ranked, clusters);
  emit(context.json, ok("cluster", { clusters, unclusteredCandidateIds: unclustered, path: clustersPath }));
  if (!context.json && !context.quiet) {
    if (clusters.length === 0) {
      console.log("No related cleanup themes found.");
    } else {
      for (const cluster of clusters) {
        printCluster(cluster);
      }
      if (unclustered.length > 0) {
        console.log(`Candidates outside cleanup themes: ${unclustered.join(", ")}`);
      }
    }
  }
  return 0;
}

async function planCommand(context: CommandContext): Promise<number> {
  const id = requireCandidateId(context);
  const { candidates, evidence, clusters, runId } = await latestState(context.paths);
  const config = await ensureState(context.paths);
  const availableClusters = clusters.length > 0 ? clusters : buildClusters(runId, candidates, evidence, new Date().toISOString(), config.clusters);
  if (clusters.length === 0 && availableClusters.length > 0) {
    await writeClusters(context.paths, runId, availableClusters);
  }

  const cluster = availableClusters.find((item) => item.id === id);
  if (cluster) {
    if (cluster.actionability === "too-broad") {
      emit(context.json, fail("plan", "theme_too_broad", `${cluster.id} is too broad for an agent-ready plan. Split or triage the theme first.`));
      return 2;
    }
    const clusterCandidates = candidates.filter((item) => cluster.candidateIds.includes(item.id));
    const supportingEvidence = evidenceForIds(evidence, cluster.evidenceIds);
    const plan = buildClusterPlan(runId, cluster, clusterCandidates, supportingEvidence);
    const planPath = await writePlan(context.paths, plan);
    emit(context.json, ok("plan", { plan, path: planPath, planPath, cluster, candidates: clusterCandidates, evidence: supportingEvidence }));
    if (!context.json && !context.quiet) {
      console.log(plan.content);
      console.log("");
      console.log(`Plan written to ${path.relative(context.paths.root, planPath)}`);
    }
    return 0;
  }

  const candidate = candidates.find((item) => item.id === id);
  if (!candidate) {
    emit(context.json, fail("plan", "target_not_found", `Candidate or theme not found: ${id}`));
    return 1;
  }
  const supportingEvidence = evidenceForIds(evidence, candidate.evidenceIds);
  const plan = buildCandidatePlan(runId, candidate, supportingEvidence);
  const planPath = await writePlan(context.paths, plan);
  emit(context.json, ok("plan", { plan, path: planPath, planPath, candidate, evidence: supportingEvidence }));
  if (!context.json && !context.quiet) {
    console.log(plan.content);
    console.log("");
    console.log(`Plan written to ${path.relative(context.paths.root, planPath)}`);
  }
  return 0;
}

async function triageCommand(context: CommandContext): Promise<number> {
  const id = requireCandidateId(context);
  const status = flagString(context.parsed.flags, "status");
  const note = flagString(context.parsed.flags, "note");

  if (!status || !candidateStatuses.includes(status as (typeof candidateStatuses)[number])) {
    emit(context.json, fail("triage", "invalid_status", `--status is required and must be one of: ${candidateStatuses.join(", ")}`));
    return 2;
  }
  if (status !== "open" && (!note || note.trim().length === 0)) {
    emit(context.json, fail("triage", "note_required", "--note is required when setting a non-open status"));
    return 2;
  }

  const candidates = await readLatestCandidates(context.paths);
  const index = candidates.findIndex((item) => item.id === id);
  if (index < 0) {
    emit(context.json, fail("triage", "candidate_not_found", `Candidate not found: ${id}`));
    return 1;
  }

  const existing = candidates[index];
  if (!existing) {
    emit(context.json, fail("triage", "candidate_not_found", `Candidate not found: ${id}`));
    return 1;
  }

  const now = new Date().toISOString();
  const updated: CandidateRecord = {
    ...existing,
    status: status as CandidateRecord["status"],
    updatedAt: now,
  };
  candidates[index] = updated;
  await updateLatestCandidates(context.paths, candidates);
  const triage = {
    schemaVersion,
    recordType: "triage" as const,
    id: timestampId("triage"),
    candidateId: id,
    fromStatus: existing.status,
    toStatus: updated.status,
    note: note ?? "",
    createdAt: now,
  };
  await writeTriage(context.paths, triage);

  emit(context.json, ok("triage", { candidate: updated, triage }));
  if (!context.json && !context.quiet) {
    console.log(`${id}: ${existing.status} -> ${updated.status}`);
  }
  return 0;
}

async function handoffCommand(context: CommandContext): Promise<number> {
  const id = requireCandidateId(context);
  const format = flagString(context.parsed.flags, "format") ?? "codex";
  const { candidates, evidence } = await latestState(context.paths);
  const candidate = candidates.find((item) => item.id === id);
  if (!candidate) {
    emit(context.json, fail("handoff", "candidate_not_found", `Candidate not found: ${id}`));
    return 1;
  }
  const supportingEvidence = evidenceForIds(evidence, candidate.evidenceIds);
  const handoff = buildHandoff(candidate, supportingEvidence, format);
  const handoffPath = await writeHandoff(context.paths, handoff);

  emit(context.json, ok("handoff", { handoff, path: handoffPath }));
  if (!context.json && !context.quiet) {
    console.log(handoff.content);
    console.log("");
    console.log(`Handoff written to ${path.relative(context.paths.root, handoffPath)}`);
  }
  return 0;
}

async function latestState(paths: StatePaths): Promise<{
  runId: string;
  candidates: CandidateRecord[];
  clusters: ClusterRecord[];
  evidence: EvidenceRecord[];
}> {
  const runId = await latestRunId(paths);
  if (!runId) {
    throw new Error("No scan run found. Run `deepclean scan` first.");
  }
  const [candidates, clusters, evidence] = await Promise.all([
    readLatestCandidates(paths),
    readLatestClusters(paths),
    readLatestEvidence(paths),
  ]);
  return { runId, candidates, clusters, evidence };
}

function requireCandidateId(context: CommandContext): string {
  const id = context.parsed.positional[0];
  if (!id) {
    throw new Error("Candidate ID is required");
  }
  return id;
}

function emit<T>(json: boolean, value: T): void {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
  }
}

function printCandidateSummary(candidates: CandidateRecord[]): void {
  for (const candidate of candidates.slice(0, 10)) {
    console.log(`${candidate.priority} ${candidate.id} ${candidate.title}`);
  }
  if (candidates.length > 10) {
    console.log(`... ${candidates.length - 10} more`);
  }
}

function printCandidate(candidate: CandidateRecord): void {
  console.log(`${candidate.priority} ${candidate.id} ${candidate.title}`);
  console.log(`  category: ${candidate.category}`);
  console.log(`  status: ${candidate.status}`);
  console.log(`  confidence: ${candidate.confidence}`);
  console.log(`  impact: ${candidate.impact}`);
  console.log(`  effort: ${candidate.effort}`);
  console.log(`  risk: ${candidate.risk}`);
  console.log(`  files: ${candidate.files.map((file) => file.path).join(", ") || "n/a"}`);
  console.log(`  suggested: ${candidate.suggestedDirection}`);
}

function printCluster(cluster: ClusterRecord): void {
  console.log(`${cluster.priority} ${cluster.id} ${cluster.title}`);
  console.log(`  candidates: ${cluster.candidateIds.join(", ")}`);
  console.log(`  category: ${cluster.category}`);
  console.log(`  confidence: ${cluster.confidence}`);
  console.log(`  impact: ${cluster.impact}`);
  console.log(`  actionability: ${cluster.actionability ?? "bounded"}`);
  console.log(`  files: ${cluster.files.map((file) => file.path).join(", ") || "n/a"}`);
  for (const warning of cluster.warnings ?? []) {
    console.log(`  warning: ${warning}`);
  }
  console.log(`  suggested: ${cluster.suggestedDirection}`);
}

function evidenceForIds(evidence: EvidenceRecord[], ids: string[]): EvidenceRecord[] {
  const wanted = new Set(ids);
  return evidence.filter((item) => wanted.has(item.id));
}

async function packageVersion(): Promise<string> {
  try {
    const packagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { version?: unknown };
    return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const entryPath = process.argv[1] ? realpathSync(process.argv[1]) : undefined;
const modulePath = realpathSync(fileURLToPath(import.meta.url));
if (entryPath === modulePath) {
  process.exitCode = await main(process.argv.slice(2));
}
