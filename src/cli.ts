#!/usr/bin/env node

import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
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
  readConfig,
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
  type DeepcleanConfig,
  type Diagnostic,
  type EvidenceRecord,
} from "./types.js";
import { timestampId } from "./ids.js";
import { synthesizeWithCodex } from "./synthesis.js";
import { inferVerificationProfile } from "./verification.js";

const execFileAsync = promisify(execFile);

const commands = [
  "init",
  "doctor",
  "status",
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
  console.log(`deepclean: local cleanup reports and agent-ready plans

Usage:
  deepclean <command> [args] [flags]

Commands:
  init                         Create or validate .deepclean state
  doctor                       Check environment, config, state, git, provider, and privacy readiness
  status                       Summarize current project-local Deepclean state
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
      case "doctor":
        return await doctorCommand(context);
      case "status":
        return await statusCommand(context);
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

async function doctorCommand(context: CommandContext): Promise<number> {
  const diagnostics: Diagnostic[] = [];
  const initialized = await pathExists(context.paths.stateDir);
  const missingDirs = initialized ? await missingStateDirectories(context.paths) : [];
  const configResult = await readConfigForDoctor(context.paths);
  diagnostics.push(...configResult.diagnostics);
  if (missingDirs.length > 0) {
    diagnostics.push({
      level: "warning",
      code: "state_dirs_missing",
      message: `Missing state directories: ${missingDirs.join(", ")}`,
    });
  }

  const git = await gitDoctor(context.paths.root);
  if (!git.available) {
    diagnostics.push({
      level: "warning",
      code: "git_unavailable",
      message: git.error ?? "Git is unavailable for this repository.",
    });
  }
  const provider = configResult.config
    ? await providerDoctor(context.paths.root, configResult.config.reviewSynthesis.command)
    : { command: undefined, available: false, error: "Config is unavailable." };
  if (configResult.config && !provider.available) {
    diagnostics.push({
      level: "warning",
      code: "provider_unavailable",
      message: provider.error ?? `Provider command is unavailable: ${provider.command}`,
    });
  }

  const data = {
    root: context.paths.root,
    stateDir: context.paths.stateDir,
    initialized,
    packageVersion: await packageVersion(),
    config: {
      path: context.paths.configPath,
      valid: configResult.valid,
      error: configResult.error,
    },
    state: {
      valid: initialized && missingDirs.length === 0,
      missingDirs,
    },
    git,
    provider,
    privacy: configResult.config?.privacy,
    supportedSurfaces: await supportedSurfaces(context.paths.root),
  };

  emit(context.json, ok("doctor", data, diagnostics));
  if (!context.json && !context.quiet) {
    console.log(`Deepclean ${data.packageVersion}`);
    console.log(`root: ${data.root}`);
    console.log(`state: ${data.state.valid ? "ok" : initialized ? "incomplete" : "not initialized"}`);
    console.log(`config: ${data.config.valid ? "ok" : "invalid"}`);
    console.log(`git: ${git.available ? git.dirty ? "dirty" : "clean" : "unavailable"}`);
    console.log(`provider: ${provider.available ? "ok" : "unavailable"}`);
    printDiagnostics(diagnostics);
  }
  return 0;
}

async function statusCommand(context: CommandContext): Promise<number> {
  const diagnostics: Diagnostic[] = [];
  const initialized = await pathExists(context.paths.stateDir);
  const latest = initialized ? await latestRunId(context.paths) : undefined;
  const candidates = latest ? await readLatestCandidates(context.paths) : [];
  const clusters = latest ? await readLatestClusters(context.paths) : [];
  const evidence = latest ? await readLatestEvidence(context.paths) : [];
  const git = await gitDoctor(context.paths.root);
  if (!git.available) {
    diagnostics.push({
      level: "warning",
      code: "git_unavailable",
      message: git.error ?? "Git is unavailable for this repository.",
    });
  }
  const artifactCounts = await stateArtifactCounts(context.paths);
  const statusCounts = countBy(candidates, (candidate) => candidate.status);
  const data = {
    root: context.paths.root,
    stateDir: context.paths.stateDir,
    initialized,
    latestRunId: latest,
    git: {
      branch: git.branch,
      dirty: git.dirty,
      available: git.available,
    },
    queue: {
      total: candidates.length,
      open: candidates.filter((candidate) => candidate.status === "open").length,
      byStatus: statusCounts,
      themes: clusters.length,
      evidence: evidence.length,
    },
    locks: {
      active: artifactCounts["locks"] ?? 0,
      stale: 0,
    },
    pendingRevalidation: candidates.filter((candidate) => candidate.lifecycleState === "stale").length,
    artifacts: artifactCounts,
  };

  emit(context.json, ok("status", data, diagnostics));
  if (!context.json && !context.quiet) {
    console.log(`root: ${data.root}`);
    console.log(`state: ${initialized ? "initialized" : "not initialized"}`);
    console.log(`latest run: ${latest ?? "none"}`);
    console.log(`queue: ${data.queue.open} open / ${data.queue.total} total`);
    console.log(`git: ${git.available ? git.dirty ? "dirty" : "clean" : "unavailable"}`);
    printDiagnostics(diagnostics);
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

function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    console.log(`${diagnostic.level}: ${diagnostic.code}: ${diagnostic.message}`);
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function missingStateDirectories(paths: StatePaths): Promise<string[]> {
  const expected: Array<[string, string]> = [
    ["runs", paths.runsDir],
    ["findings", paths.findingsDir],
    ["observations", paths.observationsDir],
    ["evidence", paths.evidenceDir],
    ["candidates", paths.candidatesDir],
    ["clusters", paths.clustersDir],
    ["reports", paths.reportsDir],
    ["triage", paths.triageDir],
    ["handoffs", paths.handoffsDir],
    ["plans", paths.plansDir],
    ["lifecycle", paths.lifecycleDir],
    ["revalidations", paths.revalidationsDir],
    ["ci", paths.ciDir],
    ["locks", paths.locksDir],
    ["retention", paths.retentionDir],
    ["fixes", paths.fixesDir],
  ];
  const missing: string[] = [];
  for (const [name, dir] of expected) {
    if (!(await pathExists(dir))) {
      missing.push(name);
    }
  }
  return missing;
}

async function readConfigForDoctor(paths: StatePaths): Promise<{
  valid: boolean;
  config?: DeepcleanConfig;
  error?: string;
  diagnostics: Diagnostic[];
}> {
  if (!(await pathExists(paths.configPath))) {
    return {
      valid: false,
      error: "Config file is missing.",
      diagnostics: [{
        level: "info",
        code: "config_missing",
        message: "Run `deepclean init` to create project-local configuration.",
      }],
    };
  }
  try {
    return {
      valid: true,
      config: await readConfig(paths),
      diagnostics: [],
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
      diagnostics: [{
        level: "error",
        code: "config_invalid",
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }
}

async function gitDoctor(root: string): Promise<{
  available: boolean;
  dirty: boolean;
  branch?: string;
  error?: string;
}> {
  try {
    const { stdout: statusOutput } = await execFileAsync("git", ["status", "--short"], { cwd: root, timeout: 5000 });
    const branchOutput = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, timeout: 5000 })
      .then((result) => result.stdout.trim())
      .catch(() => undefined);
    const result: {
      available: boolean;
      dirty: boolean;
      branch?: string;
    } = {
      available: true,
      dirty: statusOutput.trim().length > 0,
    };
    if (branchOutput) {
      result.branch = branchOutput;
    }
    return result;
  } catch (error) {
    return {
      available: false,
      dirty: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function providerDoctor(root: string, command: string): Promise<{
  command: string | undefined;
  available: boolean;
  error?: string;
}> {
  try {
    await execFileAsync(command, ["--version"], { cwd: root, timeout: 5000 });
    return { command, available: true };
  } catch (error) {
    return {
      command,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function supportedSurfaces(root: string): Promise<string[]> {
  const checks: Array<[string, string]> = [
    ["node", "package.json"],
    ["typescript", "tsconfig.json"],
    ["python", "pyproject.toml"],
    ["python", "requirements.txt"],
    ["make", "Makefile"],
  ];
  const found = new Set<string>();
  for (const [surface, file] of checks) {
    if (await pathExists(path.join(root, file))) {
      found.add(surface);
    }
  }
  return [...found].sort();
}

async function stateArtifactCounts(paths: StatePaths): Promise<Record<string, number>> {
  const dirs: Array<[string, string]> = [
    ["runs", paths.runsDir],
    ["findings", paths.findingsDir],
    ["observations", paths.observationsDir],
    ["evidence", paths.evidenceDir],
    ["candidates", paths.candidatesDir],
    ["clusters", paths.clustersDir],
    ["reports", paths.reportsDir],
    ["triage", paths.triageDir],
    ["handoffs", paths.handoffsDir],
    ["plans", paths.plansDir],
    ["lifecycle", paths.lifecycleDir],
    ["revalidations", paths.revalidationsDir],
    ["ci", paths.ciDir],
    ["locks", paths.locksDir],
    ["retention", paths.retentionDir],
    ["fixes", paths.fixesDir],
  ];
  const counts: Record<string, number> = {};
  for (const [name, dir] of dirs) {
    counts[name] = await countJsonFiles(dir);
  }
  return counts;
}

async function countJsonFiles(dir: string): Promise<number> {
  try {
    const files = await readdir(dir);
    return files.filter((file) => file.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

function countBy<T>(items: T[], keyFor: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFor(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
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
