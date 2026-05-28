#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parseArgs, flagBoolean, flagString, type ParsedArgs } from "./args.js";
import { candidatesFromEvidence, rankCandidates, reassignCandidateIds } from "./candidates.js";
import { buildClusters, unclusteredCandidateIds } from "./clusters.js";
import { isSplittableParentCandidate, splitCandidate } from "./decomposition.js";
import { discoverSourceFiles, type SourceFile } from "./discovery.js";
import { runEvidenceAdapters } from "./evidence.js";
import {
  attachFeatureContextToCandidates,
  attachFeatureContextToEvidence,
  featuresForCandidate,
  mapSemanticFeatures,
} from "./features.js";
import { attachStableIdentity } from "./identity.js";
import { fail, ok } from "./json.js";
import {
  LockContentionError,
  lockRecoveryCommand,
  readLockStatuses,
  recoverStaleLocks,
  withStateWriteLock,
} from "./locks.js";
import { buildCandidatePlan, buildClusterPlan } from "./plans.js";
import { classifyRevalidation } from "./revalidation.js";
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
  readCandidates,
  readFindings,
  readLatestCandidates,
  readLatestClusters,
  readLatestEvidence,
  readLatestFeatures,
  readLatestSynthesisAttempt,
  readLifecycleEvents,
  resolveStatePaths,
  updateLatestCandidates,
  writeCandidates,
  writeCandidateObservations,
  writeCiRun,
  writeClusters,
  writeEvidence,
  writeFeatures,
  writeFindings,
  writeFixAttempt,
  writeHandoff,
  writeLifecycleEvents,
  writePlan,
  writeReport,
  writeRetentionManifest,
  writeRevalidation,
  writeRun,
  writeSynthesisAttempt,
  writeTriage,
  type StatePaths,
} from "./state.js";
import {
  candidateStatuses,
  featureMapSources,
  schemaVersion,
  type CandidateRecord,
  type ClusterRecord,
  type DeepcleanConfig,
  type Diagnostic,
  type EvidenceRecord,
  type FeatureRecord,
  type FixAttemptRecord,
  type RetentionManifestRecord,
  type RevalidationRecord,
  type SynthesisAttemptRecord,
} from "./types.js";
import { timestampId } from "./ids.js";
import { collectProcessOutput } from "./process-output.js";
import { synthesizeWithCodex } from "./synthesis.js";
import { inferVerificationProfile } from "./verification.js";

const execFileAsync = promisify(execFile);

const commands = [
  "init",
  "doctor",
  "status",
  "ci",
  "map",
  "scan",
  "report",
  "next",
  "list",
  "findings",
  "show",
  "explain",
  "history",
  "revalidate",
  "unlock",
  "prune",
  "scrub",
  "fix",
  "work",
  "split",
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

interface ScanExecutionResult {
  runId: string;
  diagnostics: Diagnostic[];
  data: {
    runId: string;
    root: string;
    sourceFileCount: number;
    evidenceCount: number;
    candidateCount: number;
    clusterCount: number;
    synthesis: {
      requested: boolean;
      candidateCount: number;
      acceptedCandidateCount?: number | undefined;
      rejectedCandidateCount?: number | undefined;
      attemptId?: string | undefined;
      runtime?: Record<string, unknown>;
    };
    candidates: CandidateRecord[];
    clusters: ClusterRecord[];
    scope: ScanScope;
  };
}

interface ScanPreparation {
  startedAt: string;
  completedAt: string;
  runId: string;
  config: DeepcleanConfig;
  verificationProfile: Awaited<ReturnType<typeof inferVerificationProfile>>;
  discoveredFiles: SourceFile[];
  scope: ScanScope;
  files: SourceFile[];
  features: FeatureRecord[];
  adapterResult: Awaited<ReturnType<typeof runEvidenceAdapters>>;
  evidence: EvidenceRecord[];
  localCandidates: CandidateRecord[];
}

interface ScanScope {
  incremental: boolean;
  since?: string;
  mergeBase?: string;
  includeDirty: boolean;
  paths: string[];
  changedPaths: string[];
  categories: string[];
  reviewers: string[];
  onlyExisting: boolean;
  newOnly: boolean;
  dirtyPaths: string[];
}

interface ProviderRuntimeControls {
  provider: "codex";
  command: string;
  model?: string;
  effort?: string;
  timeoutMs: number;
  retries: number;
  rpm: number;
  concurrency: number;
  tokenBudget: number;
  excerptBudget: number;
  offline: boolean;
  privacyMode: "local-only" | "metadata" | "source-ok";
  allowSourceInModel: boolean;
}

function printHelp(): void {
  console.log(`deepclean: local structure reports and agent-ready plans

Usage:
  deepclean <command> [args] [flags]

Commands:
  init                         Create or validate .deepclean state
  doctor                       Check environment, config, state, git, provider, and privacy readiness
  status                       Summarize current project-local Deepclean state
  ci                           Run non-interactive scan and policy gates for CI
  map                          Write semantic feature records without producing candidates
  scan                         Collect local evidence and generate candidates
    --synthesize               Run local Codex synthesis over evidence (default)
    --evidence-only            Skip synthesis and produce local evidence candidates only
    --allow-source-in-model    Include source samples in Codex prompt
    --offline                  Skip provider calls and network-style analyzers
    --local-only               Alias for --offline
    --provider <provider>      Provider adapter, currently codex
    --model <model>            Override Codex model for synthesis
    --effort <effort>          Record provider reasoning effort
    --timeout <seconds>        Provider timeout in seconds
    --retries <n>              Provider retry attempts
    --rpm <n>                  Provider request-per-minute budget
    --concurrency <n>          Provider concurrency budget
    --token-budget <n>         Provider token budget metadata
    --excerpt-budget <n>       Source excerpt budget; 0 keeps prompts metadata-only
    --privacy-mode <mode>      local-only, metadata, or source-ok
    --since <ref>              Scan files changed since a git ref
    --merge-base <ref>         Use merge-base with ref for changed-file scope
    --include-dirty            Include uncommitted and untracked files in scope
    --paths <a,b>              Restrict scan to paths or path prefixes
    --categories <a,b>         Restrict emitted candidates to categories
    --reviewers <a,b>          Record reviewer-surface scope for synthesis/metadata
    --only-existing            Keep only findings previously known to Deepclean
    --new-only                 Keep only newly discovered findings
  report                       Write and print a ranked report
  next                         Show the highest-priority open candidate
  list                         List findings with shared filters
  findings                     Alias for list
  show <candidate-or-theme>    Show one candidate or cleanup theme with evidence
  explain <candidate-or-finding>
                               Explain evidence, validation, and fix-readiness for a finding
  history <finding-or-candidate-id>
                               Show lifecycle history for a finding
  revalidate <finding-id|candidate-id|all>
                               Freshly recheck whether findings still hold
  unlock --stale               Remove stale project-local writer locks
  prune                       Remove stale Deepclean artifacts with retention safety
    --dry-run                  Persist a manifest without deleting files
    --keep-runs <n>            Keep latest n runs, defaults to 5
    --keep-days <n>            Also keep runs newer than n days
  scrub                        Emit source-safe generated-state export
  fix <finding-or-candidate>   Preview or apply a guarded local patch
    --patch <file>             Patch file to preview/apply
    --dry-run                  Persist preview without changing source
    --apply                    Apply the patch locally
    --allow-dirty              Allow dirty files inside target scope
    --verification <c>         Required verification command for --apply
    --verification-command <c> Alias for --verification
    --allow-files <glob>       Explicitly allow additional changed files
  work <finding-or-candidate>  Candidate-first branch and PR workflow
    --branch <name>            Create or switch to a candidate branch
    --apply                    Apply the bounded patch
    --verification <c>         Required verification command
    --pr                       Push and open a PR after local proof passes
    --no-pr                    Stop after local proof and PR-ready summary
  split <candidate-or-finding> Decompose a broad parent into PR-sized child candidates
  cluster [theme-id]           Group related candidates into cleanup themes
  plan <candidate-or-theme>    Generate an agent-ready cleanup plan
  triage <candidate-id>        Update candidate status with --status and --note
  handoff <candidate-id>       Generate an agent-ready handoff packet
  export <candidate-id>        Alias for handoff
  export --source-safe         Alias for scrub

Global flags:
  --json                       Emit JSON envelope
  --plain                      Avoid styled output
  --no-input                   Never prompt
  --root <path>                Target repository root
  --state-dir <path>           State directory, defaults to .deepclean
  --config <path>              Config file, defaults to .deepclean/config.json
  --quiet                      Suppress human success output
  --debug                      Include stack traces for unexpected errors
  --wait-lock                  Wait for an active writer lock instead of failing immediately
  --lock-timeout-ms <ms>       Maximum time to wait for --wait-lock
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
      case "ci":
        return await withWriteLock(context, () => ciCommand(context));
      case "map":
        return await withWriteLock(context, () => mapCommand(context));
      case "scan":
        return await withWriteLock(context, () => scanCommand(context));
      case "report":
        return await withWriteLock(context, () => reportCommand(context));
      case "next":
        return await nextCommand(context);
      case "list":
      case "findings":
        return await listCommand(context);
      case "show":
        return await showCommand(context);
      case "explain":
        return await explainCommand(context);
      case "history":
        return await historyCommand(context);
      case "revalidate":
        return await withWriteLock(context, () => revalidateCommand(context));
      case "unlock":
        return await unlockCommand(context);
      case "prune":
        return await withWriteLock(context, () => pruneCommand(context));
      case "scrub":
        return await scrubCommand(context);
      case "fix":
        return await withWriteLock(context, () => fixCommand(context));
      case "work":
        return await withWriteLock(context, () => workCommand(context));
      case "split":
        return await withWriteLock(context, () => splitCommand(context));
      case "cluster":
        return await withWriteLock(context, () => clusterCommand(context));
      case "plan":
        return await withWriteLock(context, () => planCommand(context));
      case "triage":
        return await withWriteLock(context, () => triageCommand(context));
      case "handoff":
        return await withWriteLock(context, () => handoffCommand(context));
      case "export":
        if (flagBoolean(context.parsed.flags, "source-safe")) {
          return await scrubCommand(context);
        }
        return await withWriteLock(context, () => handoffCommand(context));
    }
    emit(json, fail(command, "unknown_command", `Unknown command: ${command}`));
    return 2;
  } catch (error) {
    if (error instanceof LockContentionError) {
      emit(json, fail(command, "lock_contention", error.message, [error.diagnostic]));
      if (!json && !quiet) {
        console.error(error.message);
      }
      return 4;
    }
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
  const locks = initialized ? await readLockStatuses(context.paths, {
    staleAfterMs: numberFlag(context, "stale-lock-ms"),
  }) : [];
  const staleLocks = locks.filter((lock) => lock.stale);
  const configResult = await readConfigForDoctor(context.paths);
  diagnostics.push(...configResult.diagnostics);
  if (missingDirs.length > 0) {
    diagnostics.push({
      level: "warning",
      code: "state_dirs_missing",
      message: `Missing state directories: ${missingDirs.join(", ")}`,
    });
  }
  if (staleLocks.length > 0) {
    diagnostics.push({
      level: "warning",
      code: "stale_locks",
      message: `Found ${staleLocks.length} stale writer lock${staleLocks.length === 1 ? "" : "s"}. Run \`${lockRecoveryCommand(context.paths)}\` before the next write command.`,
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
    locks: {
      active: locks.filter((lock) => !lock.stale).length,
      stale: staleLocks.length,
      records: locks.map((lock) => ({
        id: lock.record?.id,
        owner: lock.record?.owner,
        pid: lock.record?.pid,
        command: lock.record?.command,
        statePath: lock.record?.statePath,
        createdAt: lock.record?.createdAt,
        stale: lock.stale,
        reason: lock.reason,
        recoveryCommand: lock.recoveryCommand,
      })),
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
    console.log(`locks: ${data.locks.active} active / ${data.locks.stale} stale`);
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
  const features = initialized ? await readLatestFeatures(context.paths) : [];
  const git = await gitDoctor(context.paths.root);
  if (!git.available) {
    diagnostics.push({
      level: "warning",
      code: "git_unavailable",
      message: git.error ?? "Git is unavailable for this repository.",
    });
  }
  const artifactCounts = await stateArtifactCounts(context.paths);
  const locks = initialized ? await readLockStatuses(context.paths, {
    staleAfterMs: numberFlag(context, "stale-lock-ms"),
  }) : [];
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
      features: features.length,
    },
    locks: {
      active: locks.filter((lock) => !lock.stale).length,
      stale: locks.filter((lock) => lock.stale).length,
      records: locks.map((lock) => ({
        id: lock.record?.id,
        owner: lock.record?.owner,
        pid: lock.record?.pid,
        command: lock.record?.command,
        statePath: lock.record?.statePath,
        createdAt: lock.record?.createdAt,
        stale: lock.stale,
        reason: lock.reason,
        recoveryCommand: lock.recoveryCommand,
      })),
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
    console.log(`locks: ${data.locks.active} active / ${data.locks.stale} stale`);
    printDiagnostics(diagnostics);
  }
  return 0;
}

async function unlockCommand(context: CommandContext): Promise<number> {
  if (!flagBoolean(context.parsed.flags, "stale")) {
    emit(context.json, fail("unlock", "stale_required", "Only stale lock recovery is supported. Rerun with --stale."));
    return 2;
  }
  const result = await recoverStaleLocks(context.paths, {
    staleAfterMs: numberFlag(context, "stale-lock-ms"),
  });
  emit(context.json, ok("unlock", {
    removed: result.removed.map(lockStatusPayload),
    active: result.active.map(lockStatusPayload),
    recoveryCommand: lockRecoveryCommand(context.paths),
  }));
  if (!context.json && !context.quiet) {
    console.log(`Removed ${result.removed.length} stale lock${result.removed.length === 1 ? "" : "s"}.`);
    if (result.active.length > 0) {
      console.log(`${result.active.length} active lock${result.active.length === 1 ? "" : "s"} left in place.`);
    }
  }
  return result.active.length > 0 ? 4 : 0;
}

async function pruneCommand(context: CommandContext): Promise<number> {
  await ensureState(context.paths);
  const manifest = await buildRetentionManifest(context);
  if (!manifest.dryRun) {
    for (const relativePath of manifest.deletePaths) {
      await rm(path.resolve(context.paths.root, relativePath), { force: true });
    }
  }
  const manifestPath = await writeRetentionManifest(context.paths, manifest);
  emit(context.json, ok("prune", {
    dryRun: manifest.dryRun,
    manifest,
    manifestPath,
    deleteCount: manifest.deletePaths.length,
    retainedCount: manifest.retainedPaths.length,
    blockedCount: manifest.blockedPaths.length,
  }));
  if (!context.json && !context.quiet) {
    console.log(`${manifest.dryRun ? "Would delete" : "Deleted"} ${manifest.deletePaths.length} artifact${manifest.deletePaths.length === 1 ? "" : "s"}.`);
    console.log(`Retention manifest written to ${path.relative(context.paths.root, manifestPath)}`);
  }
  return 0;
}

async function scrubCommand(context: CommandContext): Promise<number> {
  const [candidates, clusters, evidence, features] = await Promise.all([
    readLatestCandidates(context.paths),
    readLatestClusters(context.paths),
    readLatestEvidence(context.paths),
    readLatestFeatures(context.paths),
  ]);
  const latest = await latestRunId(context.paths);
  const output = {
    schemaVersion,
    sourceSafe: true,
    generatedAt: new Date().toISOString(),
    project: path.basename(context.paths.root),
    latestRunId: latest,
    counts: {
      candidates: candidates.length,
      clusters: clusters.length,
      evidence: evidence.length,
      features: features.length,
    },
    candidates: rankCandidates(candidates).map((candidate) => ({
      id: candidate.id,
      findingId: candidate.findingId,
      title: candidate.title,
      category: candidate.category,
      status: candidate.status,
      lifecycleState: candidate.lifecycleState,
      priority: candidate.priority,
      confidence: candidate.confidence,
      impact: candidate.impact,
      effort: candidate.effort,
      risk: candidate.risk,
      baselineStatus: candidate.baselineStatus,
      evidenceIds: candidate.evidenceIds,
      files: candidate.files.map((file) => sourceSafeFile(context.paths.root, file)),
      verification: candidate.verification,
    })),
    clusters: clusters.map((cluster) => ({
      id: cluster.id,
      title: cluster.title,
      category: cluster.category,
      priority: cluster.priority,
      confidence: cluster.confidence,
      candidateIds: cluster.candidateIds,
      evidenceIds: cluster.evidenceIds,
      files: cluster.files.map((file) => sourceSafeFile(context.paths.root, file)),
      actionability: cluster.actionability,
      warnings: cluster.warnings,
    })),
    evidence: evidence.map((record) => ({
      id: record.id,
      kind: record.kind,
      title: record.title,
      files: record.files.map((file) => sourceSafeFile(context.paths.root, file)),
    })),
    features: features.map((feature) => ({
      featureId: feature.featureId,
      title: feature.title,
      kind: feature.kind,
      confidence: feature.confidence,
      ownedFiles: feature.ownedFiles.map((file) => sourceSafeFile(context.paths.root, file)),
      testFiles: feature.testFiles.map((file) => sourceSafeFile(context.paths.root, file)),
      verification: feature.verification,
      tags: feature.tags,
    })),
    privacyNotes: [
      "Source-safe export omits source excerpts, model prompts, provider payloads, absolute state paths, and generated handoff/plan prose.",
      "Repository-relative paths are retained so findings remain actionable.",
    ],
  };

  const outputPath = flagString(context.parsed.flags, "output");
  if (outputPath) {
    const resolved = path.resolve(context.paths.root, outputPath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }
  emit(context.json, ok("scrub", {
    export: output,
    ...(outputPath ? { outputPath: path.resolve(context.paths.root, outputPath) } : {}),
  }));
  if (!context.json && !context.quiet) {
    console.log(`Source-safe export: ${output.counts.candidates} candidates, ${output.counts.features} features, ${output.counts.evidence} evidence references`);
    if (outputPath) {
      console.log(`Export written to ${outputPath}`);
    }
  }
  return 0;
}

async function fixCommand(context: CommandContext): Promise<number> {
  const target = requireCandidateId(context);
  const result = await runCandidateFixWorkflow(context, target, {
    command: "fix",
    requirePrProof: false,
    createBranch: false,
    openPr: false,
  });
  if (!result.ok) {
    emit(context.json, fail("fix", result.code, result.message, result.diagnostics));
    return result.exitCode;
  }
  emit(context.json, ok("fix", result.data, result.data.attempt.diagnostics));
  if (!context.json && !context.quiet) {
    console.log(`${result.data.attempt.dryRun ? "Previewed" : "Ran"} fix ${result.data.attempt.id}: ${result.data.attempt.outcome ?? result.data.attempt.status}`);
  }
  return result.exitCode;
}

async function workCommand(context: CommandContext): Promise<number> {
  const target = requireCandidateId(context);
  const result = await runCandidateFixWorkflow(context, target, {
    command: "work",
    requirePrProof: flagBoolean(context.parsed.flags, "pr"),
    createBranch: true,
    openPr: flagBoolean(context.parsed.flags, "pr"),
  });
  if (!result.ok) {
    emit(context.json, fail("work", result.code, result.message, result.diagnostics));
    return result.exitCode;
  }
  emit(context.json, ok("work", result.data, result.data.attempt.diagnostics));
  if (!context.json && !context.quiet) {
    console.log(`Work ${result.data.attempt.id}: ${result.data.attempt.outcome ?? result.data.attempt.status}`);
    if (result.data.pr?.url) {
      console.log(`PR: ${result.data.pr.url}`);
    }
  }
  return result.exitCode;
}

async function splitCommand(context: CommandContext): Promise<number> {
  const target = requireCandidateId(context);
  const state = await latestState(context.paths);
  const resolved = resolveFixTargetFromCandidates(state.candidates, target);
  if (!resolved) {
    emit(context.json, fail("split", "candidate_not_found", `Finding or candidate not found: ${target}`));
    return 1;
  }

  const createdAt = new Date().toISOString();
  const result = await splitCandidate({
    root: context.paths.root,
    runId: state.runId,
    candidate: resolved.candidate,
    candidates: state.candidates,
    evidence: state.evidence,
    features: state.features,
    createdAt,
  });
  if (!result) {
    emit(context.json, fail("split", "candidate_not_splittable", `Candidate is already PR-sized or lacks enough evidence to split: ${target}`));
    return 2;
  }

  const existingChildIds = new Set(result.children.map((child) => child.id));
  const candidates = state.candidates.filter((candidate) => (
    candidate.id !== resolved.candidate.id
    && candidate.decomposition?.parentCandidateId !== resolved.candidate.id
    && !existingChildIds.has(candidate.id)
  ));
  const parentIndex = state.candidates.findIndex((candidate) => candidate.id === resolved.candidate.id);
  const updatedCandidates = [
    ...candidates.slice(0, Math.max(0, parentIndex)),
    result.parent,
    ...candidates.slice(Math.max(0, parentIndex)),
    ...result.children,
  ];
  const identity = attachStableIdentity({
    runId: state.runId,
    candidates: updatedCandidates,
    evidence: state.evidence,
    existingFindings: await readFindings(context.paths),
    observedAt: createdAt,
  });
  await updateLatestCandidates(context.paths, identity.candidates);
  await writeFindings(context.paths, identity.findings);
  await writeCandidateObservations(context.paths, state.runId, identity.observations);
  await writeLifecycleEvents(context.paths, [
    ...identity.lifecycleEvents,
    ...(result.parent.findingId
      ? [{
        schemaVersion,
        recordType: "lifecycle_event" as const,
        id: timestampId("event"),
        targetType: "finding" as const,
        targetId: result.parent.findingId,
        findingId: result.parent.findingId,
        runId: state.runId,
        kind: "superseded" as const,
        fromState: resolved.candidate.status,
        toState: "superseded",
        note: "Parent candidate was decomposed into PR-sized child candidates.",
        command: "split",
        createdAt,
        data: {
          parentCandidateId: result.parent.id,
          childCandidateIds: result.children.map((child) => child.id),
          strategy: result.strategy,
        },
      }]
      : []),
  ]);

  emit(context.json, ok("split", {
    parent: result.parent,
    children: result.children,
    strategy: result.strategy,
    childCandidateIds: result.children.map((child) => child.id),
  }));
  if (!context.json && !context.quiet) {
    console.log(`Split ${result.parent.id} into ${result.children.length} child candidates (${result.strategy}).`);
    for (const child of result.children) {
      console.log(`- ${child.id}: ${child.title}`);
    }
  }
  return 0;
}

async function mapCommand(context: CommandContext): Promise<number> {
  const mapSource = mapSourceFromFlags(context);
  if (!mapSource) {
    emit(context.json, fail("map", "invalid_source", `--source must be one of: ${featureMapSources.join(", ")}`));
    return 2;
  }
  if (mapSource === "agent") {
    emit(context.json, fail(
      "map",
      "unsupported_source",
      "--source agent requires provider-assisted feature-map refinement, which is not implemented yet. Use --source heuristic or --source auto.",
    ));
    return 2;
  }
  const result = await executeFeatureMap(context);
  emit(context.json, ok("map", result));
  if (!context.json && !context.quiet) {
    console.log(`Mapped ${result.featureCount} semantic feature${result.featureCount === 1 ? "" : "s"}.`);
    console.log(`Features written to ${path.relative(context.paths.root, result.path)}`);
  }
  return 0;
}

function mapSourceFromFlags(context: CommandContext): FeatureRecord["mapSource"] | undefined {
  const source = flagString(context.parsed.flags, "source");
  if (!source) {
    return "heuristic";
  }
  if (featureMapSources.includes(source as FeatureRecord["mapSource"])) {
    return source as FeatureRecord["mapSource"];
  }
  return undefined;
}

async function executeFeatureMap(context: CommandContext): Promise<{
  mapId: string;
  root: string;
  mapSource: FeatureRecord["mapSource"];
  sourceFileCount: number;
  featureCount: number;
  features: Awaited<ReturnType<typeof mapSemanticFeatures>>;
  scope: ScanScope;
  path: string;
}> {
  const createdAt = new Date().toISOString();
  const mapId = timestampId("map");
  const mapSource = mapSourceFromFlags(context);
  if (!mapSource) {
    throw new Error(`--source must be one of: ${featureMapSources.join(", ")}`);
  }
  const config = await ensureState(context.paths);
  const verificationProfile = await inferVerificationProfile(context.paths.root);
  const discoveredFiles = await discoverSourceFiles(context.paths.root, config.exclude);
  const scope = await resolveScanScope(context, discoveredFiles);
  const fullFeatures = await mapSemanticFeatures({
    root: context.paths.root,
    runId: mapId,
    createdAt,
    files: discoveredFiles,
    verificationProfile,
    excludes: config.exclude,
    mapSource,
  });
  const files = discoveredFiles.filter((file) => fileInScope(file, scope));
  const features = fullFeatures.filter((feature) => featureInScope(feature, scope));
  const featurePath = await writeFeatures(context.paths, mapId, features);
  return {
    mapId,
    root: context.paths.root,
    mapSource,
    sourceFileCount: discoveredFiles.length,
    featureCount: features.length,
    features,
    scope,
    path: featurePath,
  };
}

async function ciCommand(context: CommandContext): Promise<number> {
  const requireSynthesis = flagBoolean(context.parsed.flags, "require-synthesis");
  const config = await ensureState(context.paths);
  if (requireSynthesis && synthesisDisabledByPolicy(context, config)) {
    const diagnostic: Diagnostic = {
      level: "error",
      code: "ci_synthesis_required",
      message: "CI policy requires synthesis; rerun without evidence-only/local-only flags and with a configured provider.",
    };
    emit(context.json, fail("ci", "ci_synthesis_required", diagnostic.message, [diagnostic]));
    return 2;
  }

  const scan = await executeScan(context, {});
  const synthesisFailure = requireSynthesis ? requiredSynthesisFailure(scan) : undefined;
  if (synthesisFailure) {
    const diagnostics = [
      synthesisFailure,
      ...scan.diagnostics.filter((diagnostic) => !sameSynthesisFailure(diagnostic, synthesisFailure)),
    ];
    emit(context.json, fail("ci", "ci_synthesis_failed", synthesisFailure.message, diagnostics));
    return 2;
  }

  const policy = ciPolicyFromFlags(context);
  const gate = evaluateCiPolicy(scan.data.candidates, policy);
  const createdAt = new Date().toISOString();
  const artifactPaths = await writeCiArtifacts(context, scan.data, gate);
  const ciRun = {
    schemaVersion,
    recordType: "ci_run" as const,
    id: timestampId("ci"),
    runId: scan.runId,
    baselineRef: scan.data.scope.since ?? scan.data.scope.mergeBase,
    status: gate.blockingFindingIds.length > 0 ? "policy-failed" as const : "passed" as const,
    policy,
    blockingFindingIds: gate.blockingFindingIds,
    artifactPaths,
    diagnostics: scan.diagnostics,
    createdAt,
  };
  await writeCiRun(context.paths, ciRun);

  emit(context.json, ok("ci", {
    ciRun,
    policy,
    result: gate,
    scan: scan.data,
  }, scan.diagnostics));
  if (!context.json && !context.quiet) {
    console.log(`CI ${ciRun.status}: ${gate.blockingFindingIds.length} blocking finding${gate.blockingFindingIds.length === 1 ? "" : "s"}`);
  }
  return gate.blockingFindingIds.length > 0 ? 3 : 0;
}

async function scanCommand(context: CommandContext): Promise<number> {
  const result = await executeScan(context, {});
  emit(context.json, ok("scan", result.data, result.diagnostics));
  if (!context.json && !context.quiet) {
    const synthesisText = result.data.synthesis.requested
      ? `, ${result.data.synthesis.candidateCount} synthesized`
      : "";
    console.log(`Scan complete: ${result.data.evidenceCount} evidence records, ${result.data.candidateCount} candidates, ${result.data.clusterCount} clusters${synthesisText}`);
    printCandidateSummary(result.data.candidates);
  }
  return 0;
}

async function executeScan(
  context: CommandContext,
  options: { synthesize?: boolean | undefined },
): Promise<ScanExecutionResult> {
  const {
    startedAt,
    completedAt,
    runId,
    config,
    verificationProfile,
    discoveredFiles,
    scope,
    files,
    features,
    adapterResult,
    evidence,
    localCandidates,
  } = await prepareScanInputs(context);
  const synthesisRequested = options.synthesize ?? true;
  const runtime = providerRuntimeControls(context, config);
  if (synthesisRequested && runtime.offline) {
    adapterResult.diagnostics.push({
      level: "info",
      code: "synthesis_skipped_by_policy",
      message: "Provider synthesis was skipped because evidence-only/offline/local-only mode is active.",
      adapter: "codex-synthesis",
    });
  }
  const shouldSynthesize = synthesisRequested && !runtime.offline;
  const synthesisResult = shouldSynthesize
    ? await synthesizeWithCodex({
      root: context.paths.root,
      runId,
      createdAt: completedAt,
      evidence,
      features,
      config,
      existingCandidates: localCandidates,
      includeSource: runtime.allowSourceInModel,
      runtime,
      verificationProfile,
    })
    : { candidates: [], diagnostics: [] };
  const diagnostics = [...adapterResult.diagnostics, ...synthesisResult.diagnostics];
  const rankedCandidates = attachFeatureContextToCandidates(reassignCandidateIds(rankCandidates([
    ...localCandidates,
    ...synthesisResult.candidates,
  ])), features);
  const identity = attachStableIdentity({
    runId,
    candidates: rankedCandidates,
    evidence,
    existingFindings: await readFindings(context.paths),
    observedAt: completedAt,
  });
  const candidates = filterCandidatesByScanScope(identity.candidates, scope);
  const clusters = buildClusters(runId, candidates, evidence, completedAt, config.clusters);

  await writeFeatures(context.paths, runId, features);
  await writeEvidence(context.paths, runId, evidence);
  if (synthesisResult.attempt) {
    await writeSynthesisAttempt(context.paths, remapSynthesisAttemptCandidateIds(synthesisResult.attempt, candidates));
  }
  await writeCandidates(context.paths, runId, candidates);
  await writeFindings(context.paths, identity.findings);
  await writeCandidateObservations(context.paths, runId, identity.observations);
  await writeLifecycleEvents(context.paths, identity.lifecycleEvents);
  await writeClusters(context.paths, runId, clusters);
  await writeRun(context.paths, {
    schemaVersion,
    recordType: "run",
    id: runId,
    command: "scan",
    root: context.paths.root,
    startedAt,
    completedAt,
    featureCount: features.length,
    evidenceCount: evidence.length,
    candidateCount: candidates.length,
    clusterCount: clusters.length,
    synthesis: {
      requested: shouldSynthesize,
      provider: shouldSynthesize ? runtime.provider : undefined,
      candidateCount: synthesisResult.candidates.length,
      attemptId: synthesisResult.attempt?.id,
      acceptedCandidateCount: synthesisResult.attempt?.acceptedCandidateCount,
      rejectedCandidateCount: synthesisResult.attempt?.rejectedCandidateCount,
      runtime: providerRuntimeSummary(runtime),
    },
    scope,
    diagnostics,
  });

  const data = {
    runId,
    root: context.paths.root,
    sourceFileCount: files.length,
    featureCount: features.length,
    evidenceCount: evidence.length,
    candidateCount: candidates.length,
    clusterCount: clusters.length,
    synthesis: {
      requested: shouldSynthesize,
      candidateCount: synthesisResult.candidates.length,
      attemptId: synthesisResult.attempt?.id,
      acceptedCandidateCount: synthesisResult.attempt?.acceptedCandidateCount,
      rejectedCandidateCount: synthesisResult.attempt?.rejectedCandidateCount,
      runtime: providerRuntimeSummary(runtime),
    },
    candidates,
    clusters,
    features,
    scope,
  };

  return { runId, diagnostics, data };
}

async function prepareScanInputs(context: CommandContext): Promise<ScanPreparation> {
  const startedAt = new Date().toISOString();
  const runId = timestampId("run");
  const config = await ensureState(context.paths);
  const verificationProfile = await inferVerificationProfile(context.paths.root);
  const discoveredFiles = await discoverSourceFiles(context.paths.root, config.exclude);
  const scope = await resolveScanScope(context, discoveredFiles);
  const files = discoveredFiles.filter((file) => fileInScope(file, scope));
  const features = await mapSemanticFeatures({
    root: context.paths.root,
    runId,
    createdAt: startedAt,
    files: discoveredFiles,
    verificationProfile,
    excludes: config.exclude,
    mapSource: "heuristic",
  });
  const adapterResult = await runEvidenceAdapters(config.enabledAdapters, {
    root: context.paths.root,
    runId,
    createdAt: startedAt,
    files,
    config,
  });
  const evidence = attachFeatureContextToEvidence(markDirtyTreeEvidence(adapterResult.evidence, scope), features);
  const completedAt = new Date().toISOString();
  const localCandidates = candidatesFromEvidence(
    runId,
    evidence,
    completedAt,
    config.candidateCaps,
    verificationProfile,
  );

  return {
    startedAt,
    completedAt,
    runId,
    config,
    verificationProfile,
    discoveredFiles,
    scope,
    files,
    features,
    adapterResult,
    evidence,
    localCandidates,
  };
}

function remapSynthesisAttemptCandidateIds(
  attempt: SynthesisAttemptRecord,
  candidates: CandidateRecord[],
): SynthesisAttemptRecord {
  const candidateIdByValidationId = new Map(
    candidates
      .filter((candidate) => candidate.provenance.source === "model-synthesis")
      .flatMap((candidate) => candidate.provenance.validationId
        ? [[candidate.provenance.validationId, candidate.id] as const]
        : []),
  );
  return {
    ...attempt,
    validations: attempt.validations.map((validation) => ({
      ...validation,
      candidateId: candidateIdByValidationId.get(validation.id),
    })),
  };
}

async function reportCommand(context: CommandContext): Promise<number> {
  const { candidates, evidence, features, runId } = await latestState(context.paths);
  const config = await ensureState(context.paths);
  const latestClusters = await readLatestClusters(context.paths);
  const filter = queryFilterFromFlags(context);
  const filtered = filterCandidatesForQuery(candidates, latestClusters, filter);
  const selectedFeature = filter.feature ? features.find((feature) => feature.featureId === filter.feature) : undefined;
  if (filter.feature && !selectedFeature) {
    emit(context.json, fail("report", "feature_not_found", `Feature not found: ${filter.feature}`));
    return 1;
  }
  const ranked = rankCandidates(filtered);
  const clusters = buildClusters(runId, ranked, evidence, new Date().toISOString(), config.clusters);
  await writeClusters(context.paths, runId, clusters);
  const report = buildReportRecord(runId, ranked, clusters, features);
  const markdown = clusters.length > 0
    ? renderMarkdownReportWithClusters(ranked, clusters, features)
    : renderMarkdownReport(ranked, features);
  const paths = await writeReport(context.paths, report, markdown);

  emit(context.json, ok("report", {
    report,
    paths,
    reportPath: paths.markdownPath,
    markdownPath: paths.markdownPath,
    jsonPath: paths.jsonPath,
    candidates: ranked,
    clusters,
    filters: filter,
    selectedFeature,
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
  const [candidates, clusters, features] = await Promise.all([
    readLatestCandidates(context.paths),
    readLatestClusters(context.paths),
    readLatestFeatures(context.paths),
  ]);
  const filter = queryFilterFromFlags(context);
  const selectedFeature = filter.feature ? features.find((feature) => feature.featureId === filter.feature) : undefined;
  if (filter.feature && !selectedFeature) {
    emit(context.json, fail("next", "feature_not_found", `Feature not found: ${filter.feature}`));
    return 1;
  }
  const filtered = filterCandidatesForQuery(candidates, clusters, filter);
  const ranked = rankCandidates(filtered);
  const candidate = ranked.find((item) => item.status === "open");
  emit(context.json, ok("next", { candidate: candidate ?? null, selectedFeature }));
  if (!context.json && !context.quiet) {
    if (!candidate) {
      console.log("No open candidates.");
    } else {
      printCandidate(candidate);
    }
  }
  return 0;
}

async function listCommand(context: CommandContext): Promise<number> {
  const [candidates, clusters, features] = await Promise.all([
    readLatestCandidates(context.paths),
    readLatestClusters(context.paths),
    readLatestFeatures(context.paths),
  ]);
  const filter = queryFilterFromFlags(context);
  const selectedFeature = filter.feature ? features.find((feature) => feature.featureId === filter.feature) : undefined;
  if (filter.feature && !selectedFeature) {
    emit(context.json, fail("list", "feature_not_found", `Feature not found: ${filter.feature}`));
    return 1;
  }
  const filtered = rankCandidates(filterCandidatesForQuery(candidates, clusters, filter));
  const format = flagString(context.parsed.flags, "format");
  const queue = format === "codex" ? filtered.map(candidateQueueItem) : undefined;
  emit(context.json, ok("list", {
    filters: filter,
    count: filtered.length,
    candidates: filtered,
    selectedFeature,
    ...(queue ? { queue } : {}),
  }));
  if (!context.json && !context.quiet) {
    for (const candidate of filtered) {
      console.log(`${candidate.findingId ?? candidate.id} ${candidate.priority} ${candidate.title}`);
    }
  }
  return 0;
}

async function showCommand(context: CommandContext): Promise<number> {
  const id = requireCandidateId(context);
  const { candidates, evidence, features, clusters, runId } = await latestState(context.paths);
  const config = await ensureState(context.paths);
  const availableClusters = clusters.length > 0 ? clusters : buildClusters(runId, candidates, evidence, new Date().toISOString(), config.clusters);
  const cluster = availableClusters.find((item) => item.id === id);
  if (cluster) {
    const clusterCandidates = candidates.filter((item) => cluster.candidateIds.includes(item.id));
    const supportingEvidence = evidenceForIds(evidence, cluster.evidenceIds);
    const affectedFeatures = featuresForCandidates(clusterCandidates, features);
    emit(context.json, ok("show", { cluster, candidates: clusterCandidates, evidence: supportingEvidence, features: affectedFeatures }));
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
  const affectedFeatures = featuresForCandidate(candidate, features);
  emit(context.json, ok("show", { candidate, evidence: supportingEvidence, features: affectedFeatures }));
  if (!context.json && !context.quiet) {
    printCandidate(candidate);
    for (const record of supportingEvidence) {
      console.log(`  evidence ${record.id}: ${record.summary}`);
    }
  }
  return 0;
}

async function explainCommand(context: CommandContext): Promise<number> {
  const id = requireCandidateId(context);
  const { candidates, evidence } = await latestState(context.paths);
  const attempt = await readLatestSynthesisAttempt(context.paths);
  const candidate = candidates.find((item) => item.id === id || item.findingId === id);
  if (!candidate) {
    emit(context.json, fail("explain", "candidate_not_found", `Candidate or finding not found: ${id}`));
    return 1;
  }

  const supportingEvidence = evidenceForIds(evidence, candidate.evidenceIds);
  const validation = validationForCandidate(candidate, attempt);
  const diagnostics = validation?.diagnostics ?? [];
  const explanation = {
    candidate,
    evidence: supportingEvidence,
    synthesisAttempt: attempt ? {
      id: attempt.id,
      runId: attempt.runId,
      provider: attempt.provider,
      model: attempt.model,
      promptVersion: attempt.promptVersion,
      promptBytes: attempt.promptBytes,
      rawCandidateCount: attempt.rawCandidateCount,
      acceptedCandidateCount: attempt.acceptedCandidateCount,
      rejectedCandidateCount: attempt.rejectedCandidateCount,
      evidenceManifest: attempt.evidenceManifest,
    } : undefined,
    validation,
    fixReadiness: candidate.fixReadiness,
    verification: candidate.verification,
    diagnostics,
  };

  emit(context.json, ok("explain", explanation, diagnostics));
  if (!context.json && !context.quiet) {
    printCandidate(candidate);
    console.log("");
    console.log("Why this exists:");
    console.log(`  ${candidate.whyItMatters}`);
    console.log("");
    console.log("Evidence:");
    for (const record of supportingEvidence) {
      console.log(`  ${record.id} ${record.kind}: ${record.summary}`);
      for (const file of record.files) {
        console.log(`    ${formatFileRef(file)}`);
      }
    }
    if (validation) {
      console.log("");
      console.log(`Validation: ${validation.status} (${validation.id})`);
      if (validation.diagnostics.length === 0) {
        console.log("  All cited evidence IDs, file paths, line ranges, and quotes passed validation.");
      } else {
        for (const diagnostic of validation.diagnostics) {
          console.log(`  ${diagnostic.code}: ${diagnostic.message}`);
        }
      }
    }
    if (candidate.fixReadiness) {
      console.log("");
      console.log("Fix readiness:");
      console.log(`  scope: ${candidate.fixReadiness.minimumFixScope}`);
      console.log(`  regression: ${candidate.fixReadiness.suggestedRegressionTest}`);
      console.log(`  test gap: ${candidate.fixReadiness.whyCurrentTestsMissIt}`);
      for (const reason of candidate.fixReadiness.confidenceDowngradeReasons) {
        console.log(`  confidence note: ${reason}`);
      }
    }
    console.log("");
    console.log(`Verification: ${candidate.verification.join("; ") || "n/a"}`);
  }
  return 0;
}

async function historyCommand(context: CommandContext): Promise<number> {
  const id = requireCandidateId(context);
  const runId = flagString(context.parsed.flags, "run");
  const [findings, events] = await Promise.all([
    readFindings(context.paths),
    readLifecycleEvents(context.paths),
  ]);
  const candidate = id.startsWith("candidate-")
    ? await candidateForHistoryLookup(context.paths, id, runId)
    : undefined;
  const findingId = candidate?.findingId ?? id;
  const finding = findings.find((item) => item.id === findingId);
  if (!finding) {
    emit(context.json, fail("history", "finding_not_found", `Finding not found: ${id}`));
    return 1;
  }
  const history = events.filter((event) => event.findingId === finding.id || event.targetId === finding.id);
  emit(context.json, ok("history", { finding, candidate, events: history }));
  if (!context.json && !context.quiet) {
    console.log(`${finding.id}: ${finding.title}`);
    for (const event of history) {
      console.log(`${event.createdAt} ${event.kind}${event.toState ? ` -> ${event.toState}` : ""}`);
    }
  }
  return 0;
}

async function revalidateCommand(context: CommandContext): Promise<number> {
  const target = requireCandidateId(context);
  const beforeFindings = await readFindings(context.paths);
  const targetFindings = await resolveRevalidationTargets(context.paths, target, beforeFindings);
  if (targetFindings.length === 0 && target !== "all") {
    emit(context.json, fail("revalidate", "finding_not_found", `Finding not found: ${target}`));
    return 1;
  }

  const scan = await executeScan(context, { synthesize: false });
  const now = new Date().toISOString();
  const records: RevalidationRecord[] = [];
  for (const finding of target === "all" ? beforeFindings : targetFindings) {
    records.push(await classifyRevalidation({
      root: context.paths.root,
      finding,
      currentCandidates: scan.data.candidates,
      runId: scan.runId,
      createdAt: now,
    }));
  }
  if (target === "all" && beforeFindings.length === 0) {
    records.push(await classifyRevalidation({
      root: context.paths.root,
      finding: undefined,
      currentCandidates: scan.data.candidates,
      runId: scan.runId,
      createdAt: now,
    }));
  }

  for (const record of records) {
    await writeRevalidation(context.paths, record);
  }
  const updatedFindings = beforeFindings.map((finding) => {
    const record = records.find((item) => item.targetId === finding.id);
    if (!record) {
      return finding;
    }
    const state = revalidationOutcomeToLifecycleState(record.outcome);
    return {
      ...finding,
      lifecycleState: state,
      status: revalidationOutcomeToStatus(record.outcome, finding.status),
      updatedAt: record.createdAt,
    };
  });
  await writeFindings(context.paths, updatedFindings);
  await writeLifecycleEvents(context.paths, records.flatMap((record) => (
    record.targetId
      ? [{
        schemaVersion,
        recordType: "lifecycle_event" as const,
        id: timestampId("event"),
        targetType: "finding" as const,
        targetId: record.targetId,
        findingId: record.targetId,
        runId: record.runId,
        kind: "revalidated" as const,
        toState: record.outcome,
        command: "revalidate",
        createdAt: record.createdAt,
        data: { revalidationId: record.id, outcome: record.outcome },
      }]
      : []
  )));

  emit(context.json, ok("revalidate", {
    target,
    runId: scan.runId,
    revalidations: records,
    candidates: scan.data.candidates,
  }, scan.diagnostics));
  if (!context.json && !context.quiet) {
    for (const record of records) {
      console.log(`${record.targetId ?? "all"}: ${record.outcome}`);
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
  const { candidates, evidence, features, clusters, runId } = await latestState(context.paths);
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
    const affectedFeatures = featuresForCandidates(clusterCandidates, features);
    const plan = buildClusterPlan(runId, cluster, clusterCandidates, supportingEvidence, affectedFeatures);
    const planPath = await writePlan(context.paths, plan);
    emit(context.json, ok("plan", { plan, path: planPath, planPath, cluster, candidates: clusterCandidates, evidence: supportingEvidence, features: affectedFeatures }));
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
  const affectedFeatures = featuresForCandidate(candidate, features);
  const plan = buildCandidatePlan(runId, candidate, supportingEvidence, affectedFeatures);
  const planPath = await writePlan(context.paths, plan);
  emit(context.json, ok("plan", { plan, path: planPath, planPath, candidate, evidence: supportingEvidence, features: affectedFeatures }));
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
  if (updated.findingId) {
    await writeLifecycleEvents(context.paths, [{
      schemaVersion,
      recordType: "lifecycle_event",
      id: timestampId("event"),
      targetType: "finding",
      targetId: updated.findingId,
      findingId: updated.findingId,
      runId: updated.runId,
      kind: "triaged",
      fromState: existing.status,
      toState: updated.status,
      note: note ?? "",
      command: "triage",
      createdAt: now,
      data: { candidateId: id, triageId: triage.id },
    }]);
  }

  emit(context.json, ok("triage", { candidate: updated, triage }));
  if (!context.json && !context.quiet) {
    console.log(`${id}: ${existing.status} -> ${updated.status}`);
  }
  return 0;
}

async function handoffCommand(context: CommandContext): Promise<number> {
  const id = requireCandidateId(context);
  const format = flagString(context.parsed.flags, "format") ?? "codex";
  const { candidates, evidence, features } = await latestState(context.paths);
  const candidate = candidates.find((item) => item.id === id);
  if (!candidate) {
    emit(context.json, fail("handoff", "candidate_not_found", `Candidate not found: ${id}`));
    return 1;
  }
  const supportingEvidence = evidenceForIds(evidence, candidate.evidenceIds);
  const affectedFeatures = featuresForCandidate(candidate, features);
  const handoff = buildHandoff(candidate, supportingEvidence, format, affectedFeatures);
  const handoffPath = await writeHandoff(context.paths, handoff);
  const warnings = handoffFreshnessWarnings(candidate);

  emit(context.json, ok("handoff", { handoff, path: handoffPath, warnings, features: affectedFeatures }));
  if (!context.json && !context.quiet) {
    for (const warning of warnings) {
      console.log(`warning: ${warning}`);
    }
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
  features: FeatureRecord[];
}> {
  const runId = await latestRunId(paths);
  if (!runId) {
    throw new Error("No scan run found. Run `deepclean scan` first.");
  }
  const [candidates, clusters, evidence, features] = await Promise.all([
    readLatestCandidates(paths),
    readLatestClusters(paths),
    readLatestEvidence(paths),
    readLatestFeatures(paths),
  ]);
  return { runId, candidates, clusters, evidence, features };
}

type FixWorkflowResult = {
  ok: true;
  exitCode: number;
  data: {
    attempt: FixAttemptRecord;
    attemptPath: string;
    attempts: FixAttemptRecord[];
    attemptPaths: string[];
    planPath: string;
    patchPreviewPath?: string;
    prSummaryPath?: string;
    changedFiles: string[];
    outOfScopeFiles: string[];
    allowedWriteScope: string[];
    revalidation?: RevalidationRecord;
    pr?: FixAttemptRecord["pr"];
    externalSideEffects: string[];
    next: string;
  };
} | {
  ok: false;
  exitCode: number;
  code: string;
  message: string;
  diagnostics?: Diagnostic[];
};

interface FixWorkerPreviousAttempt {
  id: string;
  status: FixAttemptRecord["status"];
  outcome?: FixAttemptRecord["outcome"];
  changedFiles: string[];
  revalidationOutcome?: RevalidationRecord["outcome"] | undefined;
  remainingEvidenceIds: string[];
  diagnostics: string[];
  verificationFailures: Array<{ command: string; outputPath?: string | undefined }>;
}

interface DirtyFileEntry {
  file: string;
  status: string;
}

interface FixWorkflowOptions {
  command: "fix" | "work";
  requirePrProof: boolean;
  createBranch: boolean;
  openPr: boolean;
}

type FixWorkflowTargetContext = {
  ok: true;
  config: DeepcleanConfig;
  state: Awaited<ReturnType<typeof latestState>>;
  resolved: {
    findingId: string;
    candidate: CandidateRecord;
  };
};

async function resolveFixWorkflowTarget(
  context: CommandContext,
  target: string,
): Promise<FixWorkflowTargetContext | Extract<FixWorkflowResult, { ok: false }>> {
  const config = await ensureState(context.paths);
  if (!config.fixExecution.enabled) {
    return {
      ok: false,
      exitCode: 2,
      code: "fix_execution_disabled",
      message: "Fix execution is disabled in .deepclean/config.json. Set fixExecution.enabled to true before running `deepclean fix` or `deepclean work`.",
    };
  }

  if (target.startsWith("theme-")) {
    return {
      ok: false,
      exitCode: 2,
      code: "fix_target_too_broad",
      message: "Fix execution requires one stable finding or candidate, not a broad theme.",
    };
  }

  const state = await latestState(context.paths);
  const resolved = resolveFixTargetFromCandidates(state.candidates, target);
  if (!resolved) {
    return {
      ok: false,
      exitCode: 1,
      code: "finding_not_found",
      message: `Finding or candidate not found: ${target}`,
    };
  }

  if (isSplittableParentCandidate(resolved.candidate, state.evidence)) {
    return {
      ok: false,
      exitCode: 2,
      code: "fix_target_needs_split",
      message: `Candidate is too broad for guarded fix execution. Run \`deepclean split ${resolved.candidate.id}\` and target one child candidate.`,
    };
  }

  return { ok: true, config, state, resolved };
}

function fixWorkflowVerificationBlocker(
  options: FixWorkflowOptions,
  dryRun: boolean,
  verificationCommands: string[],
): Extract<FixWorkflowResult, { ok: false }> | undefined {
  if (!dryRun && verificationCommands.length === 0) {
    return {
      ok: false,
      exitCode: 2,
      code: "verification_required",
      message: "--verification is required for applied candidate fixes unless the candidate or config supplies verification commands.",
    };
  }
  if (options.requirePrProof && verificationCommands.length === 0) {
    return {
      ok: false,
      exitCode: 2,
      code: "verification_required",
      message: "--verification is required before Deepclean can prepare or open a PR.",
    };
  }
  return undefined;
}

async function runCandidateFixWorkflow(
  context: CommandContext,
  target: string,
  options: FixWorkflowOptions,
): Promise<FixWorkflowResult> {
  const targetContext = await resolveFixWorkflowTarget(context, target);
  if (!targetContext.ok) {
    return targetContext;
  }
  const { config, state, resolved } = targetContext;

  const blocked = fixReadinessBlocker(resolved.candidate);
  if (blocked) {
    return { ok: false, exitCode: 2, ...blocked };
  }

  const dryRun = flagBoolean(context.parsed.flags, "dry-run") || !flagBoolean(context.parsed.flags, "apply");
  const verificationCommands = verificationCommandsForFix(context, config, resolved.candidate);
  const verificationBlocker = fixWorkflowVerificationBlocker(options, dryRun, verificationCommands);
  if (verificationBlocker) {
    return verificationBlocker;
  }

  const planResult = await ensureFixPlan(context.paths, state.runId, resolved.candidate, state.evidence, state.features);
  const allowedWriteScope = allowedWriteScopeForCandidate(resolved.candidate, state.features, context);
  const dirtyBefore = (await dirtyFileEntries(context.paths.root)).map((entry) => entry.file);
  const patch = flagString(context.parsed.flags, "patch");
  const patchPath = patch ? path.resolve(context.paths.root, patch) : undefined;
  const allowedDirty = flagBoolean(context.parsed.flags, "allow-dirty");
  const statePrefix = `${relativeStatePath(context.paths, context.paths.stateDir).replace(/\/$/, "")}/`;
  const patchRelativePath = patchPath ? relativeStatePath(context.paths, patchPath) : undefined;
  const dirtyOutsideTarget = dirtyBefore.filter((file) => (
    !isPathAllowed(file, allowedWriteScope)
    && file !== patchRelativePath
    && !file.startsWith(statePrefix)
  ));
  if (!dryRun && dirtyOutsideTarget.length > 0 && !allowedDirty) {
    return {
      ok: false,
      exitCode: 2,
      code: "dirty_tree",
      message: `Dirty files outside target scope: ${dirtyOutsideTarget.join(", ")}`,
    };
  }

  const branch = flagString(context.parsed.flags, "branch");
  if (options.createBranch) {
    if (!branch) {
      return {
        ok: false,
        exitCode: 2,
        code: "branch_required",
        message: "`deepclean work` requires --branch so the patch has an isolated PR lane.",
      };
    }
    if (!dryRun) {
      const branchResult = await checkoutWorkBranch(context.paths.root, branch);
      if (!branchResult.ok) {
        return {
          ok: false,
          exitCode: 2,
          code: "branch_checkout_failed",
          message: branchResult.error,
        };
      }
    }
  }

  const workflowId = timestampId("fix");
  const maxAttempts = (!dryRun && !patchPath)
    ? Math.max(1, config.fixExecution.maxAttempts)
    : 1;
  const diagnostics: Diagnostic[] = [];
  await mkdir(context.paths.fixesDir, { recursive: true });

  const revalidationRequired = flagBoolean(context.parsed.flags, "revalidate") || options.createBranch || options.requirePrProof;
  let currentCandidate = resolved.candidate;
  let currentEvidence = state.evidence;
  let currentFeatures = state.features;
  let remainingEvidence = evidenceForIds(currentEvidence, currentCandidate.evidenceIds);
  const attempts: FixAttemptRecord[] = [];
  const attemptPaths: string[] = [];
  const previousAttemptSummaries: FixWorkerPreviousAttempt[] = [];
  let lastRevalidation: RevalidationRecord | undefined;

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    const attemptId = maxAttempts > 1 ? `${workflowId}-${String(attemptNumber).padStart(2, "0")}` : workflowId;
    const attemptDiagnostics: Diagnostic[] = [];
    let patchPreviewPath: string | undefined;
    let worker: FixAttemptRecord["worker"];
    let status: FixAttemptRecord["status"] = dryRun ? "previewed" : "unverified";
    let changedFiles: string[] = [];
    let verificationResults: FixAttemptRecord["verificationResults"] = [];
    let revalidation: RevalidationRecord | undefined;
    const diffBeforeAttempt = !dryRun ? await scopedDiffSignature(context.paths.root, allowedWriteScope) : "";

    if (patchPath) {
      const patchContent = await readFile(patchPath, "utf8");
      changedFiles = changedFilesFromPatch(patchContent);
      if (changedFiles.length === 0) {
        return {
          ok: false,
          exitCode: 2,
          code: "patch_empty",
          message: "Patch preview did not contain changed files.",
        };
      }
      patchPreviewPath = path.join(context.paths.fixesDir, `${attemptId}.patch`);
      await writeFile(patchPreviewPath, patchContent, "utf8");
      if (!dryRun) {
        const apply = await execFileAsync("git", ["apply", patchPath], { cwd: context.paths.root, timeout: 30_000 })
          .then(() => ({ ok: true, error: undefined as string | undefined }))
          .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        if (!apply.ok) {
          attemptDiagnostics.push({ level: "error", code: "patch_apply_failed", message: apply.error ?? "Patch failed to apply." });
          status = "failed";
        }
      }
    } else if (!dryRun) {
      const workerResult = await runCodexPatchWorker({
        root: context.paths.root,
        command: config.reviewSynthesis.command,
        model: config.reviewSynthesis.model,
        idleTimeoutMs: config.fixExecution.workerIdleTimeoutMs,
        hardTimeoutMs: config.fixExecution.workerHardTimeoutMs,
        attemptId,
        attemptNumber,
        maxAttempts,
        previousAttempts: previousAttemptSummaries,
        candidate: currentCandidate,
        planContent: planResult.plan.content,
        evidence: remainingEvidence.length > 0 ? remainingEvidence : evidenceForIds(currentEvidence, currentCandidate.evidenceIds),
        features: featuresForCandidate(currentCandidate, currentFeatures),
        allowedWriteScope,
        verificationCommands,
        outputDir: context.paths.fixesDir,
      });
      worker = workerResult.worker;
      attemptDiagnostics.push(...workerResult.diagnostics);
      if (workerResult.exitCode !== 0 && !workerResult.timedOut) {
        status = "failed";
      }
    }

    if (!dryRun) {
      changedFiles = uniqueNormalized([
        ...changedFiles,
        ...(await changedFilesSince(context.paths.root, dirtyBefore)),
      ]).filter((file) => !file.startsWith(statePrefix));
    }
    const outOfScopeFiles = changedFiles.filter((file) => !isPathAllowed(file, allowedWriteScope));
    if (!dryRun && worker?.timedOut && changedFiles.length > 0 && outOfScopeFiles.length === 0) {
      attemptDiagnostics.push({
        level: "warning",
        code: "fix_worker_timeout_recovered",
        message: "Patch worker timed out after making in-scope changes; Deepclean will continue with verification and revalidation.",
      });
    }
    const diffAfterAttempt = !dryRun ? await scopedDiffSignature(context.paths.root, allowedWriteScope) : "";
    if (!dryRun && changedFiles.length === 0 && status !== "failed") {
      attemptDiagnostics.push({
        level: "error",
        code: "fix_no_changed_files",
        message: "Patch worker completed without changing candidate-owned files.",
      });
      status = "failed";
    }
    if (!dryRun && changedFiles.length > 0 && diffAfterAttempt === diffBeforeAttempt && status !== "failed") {
      attemptDiagnostics.push({
        level: "error",
        code: "fix_no_retry_progress",
        message: "Patch worker did not make new candidate-owned changes on this attempt.",
      });
      status = "failed";
    }
    if (outOfScopeFiles.length > 0) {
      attemptDiagnostics.push({
        level: "error",
        code: "fix_scope_failed",
        message: `Patch changed files outside candidate scope: ${outOfScopeFiles.join(", ")}`,
      });
      status = "failed";
    }
    if (!dryRun && worker?.timedOut && changedFiles.length === 0) {
      status = "failed";
    }

    if (!dryRun && status !== "failed" && outOfScopeFiles.length === 0) {
      verificationResults = await runFixVerification(context.paths, attemptId, verificationCommands);
      status = verificationResults.every((result) => result.passed) ? "passed" : "failed";
    }

    if (!dryRun && revalidationRequired && outOfScopeFiles.length === 0) {
      const record = await revalidateFixTarget(context, resolved.findingId);
      revalidation = record.revalidation;
      attemptDiagnostics.push(...record.diagnostics);
    }

    let outcome = classifyFixOutcome({
      dryRun,
      status,
      outOfScopeFiles,
      verificationResults,
      revalidation,
      requireRevalidation: revalidationRequired,
    });
    const retryLimitReached = !dryRun
      && !patchPath
      && attemptNumber >= maxAttempts
      && maxAttempts > 1
      && (
        outcome === "still-open"
        || outcome === "partially-resolved"
        || verificationResults.some((result) => !result.passed)
      );
    if (retryLimitReached) {
      attemptDiagnostics.push({
        level: "error",
        code: "fix_max_attempts_exhausted",
        message: `Candidate was not resolved after ${maxAttempts} fix attempts.`,
      });
      outcome = "needs_human";
    }
    lastRevalidation = revalidation;
    if (outcome === "needs_human" && status !== "failed" && !dryRun) {
      status = "failed";
    }

    const now = new Date().toISOString();
    const previousAttemptIds = attempts.map((attempt) => attempt.id);
    const attempt: FixAttemptRecord = {
      schemaVersion,
      recordType: "fix_attempt",
      id: attemptId,
      findingId: resolved.findingId,
      candidateId: resolved.candidate.id,
      planId: planResult.plan.id,
      status,
      outcome,
      dryRun,
      attemptNumber,
      maxAttempts,
      previousAttemptIds,
      allowedWriteScope,
      outOfScopeFiles,
      beforeEvidenceIds: resolved.candidate.evidenceIds,
      afterRevalidationId: revalidation?.id,
      changedFiles,
      patchPreviewPath,
      verificationCommands,
      verificationResults,
      worker,
      diagnostics: attemptDiagnostics,
      createdAt: now,
      updatedAt: now,
    };
    const attemptPath = await writeFixAttempt(context.paths, attempt);
    await writeFixLifecycleEvents(context.paths, attempt, options.command, revalidation);
    attempts.push(attempt);
    attemptPaths.push(attemptPath);

    previousAttemptSummaries.push({
      id: attempt.id,
      status,
      outcome,
      changedFiles,
      revalidationOutcome: revalidation?.outcome,
      remainingEvidenceIds: revalidation?.evidenceIds ?? [],
      diagnostics: attemptDiagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
      verificationFailures: verificationResults.filter((result) => !result.passed).map((result) => ({
        command: result.command,
        outputPath: result.outputPath,
      })),
    });

    const retry = shouldRetryFixAttempt({
      dryRun,
      hasPatchPath: Boolean(patchPath),
      attemptNumber,
      maxAttempts,
      changedFiles,
      outOfScopeFiles,
      verificationResults,
      outcome,
      revalidationRequired,
    });
    if (!retry) {
      break;
    }

    const latestCandidates = await readLatestCandidates(context.paths);
    currentEvidence = await readLatestEvidence(context.paths);
    currentFeatures = await readLatestFeatures(context.paths);
    currentCandidate = latestCandidates.find((candidate) => candidate.findingId === resolved.findingId) ?? currentCandidate;
    remainingEvidence = evidenceForIds(
      currentEvidence,
      revalidation?.evidenceIds.length ? revalidation.evidenceIds : currentCandidate.evidenceIds,
    );
  }

  const attempt = attempts.at(-1);
  const attemptPath = attemptPaths.at(-1);
  if (!attempt || !attemptPath) {
    return {
      ok: false,
      exitCode: 1,
      code: "fix_attempt_missing",
      message: "Fix workflow did not record an attempt.",
    };
  }
  const patchPreviewPath = attempt.patchPreviewPath;
  const changedFiles = attempt.changedFiles;
  const outOfScopeFiles = attempt.outOfScopeFiles ?? [];
  const verificationResults = attempt.verificationResults;
  const revalidation = lastRevalidation;
  const outcome = attempt.outcome;
  diagnostics.push(...attempt.diagnostics);

  let prSummaryPath: string | undefined;
  let pr: FixAttemptRecord["pr"];
  let finalStatus = attempt.status;
  const externalSideEffects: string[] = [];
  const localSummaryAllowed = outcome === "resolved";
  const prProofPassed = outcome === "resolved";
  if (options.requirePrProof && !prProofPassed) {
    diagnostics.push({
      level: "error",
      code: "pr_blocked",
      message: "PR workflow requires in-scope changes, passing verification, and revalidation outcome resolved.",
    });
  }
  if (!dryRun && localSummaryAllowed && branch) {
    prSummaryPath = await writePrReadySummary(context.paths, {
      attemptId: attempt.id,
      candidate: resolved.candidate,
      branch,
      changedFiles,
      verificationResults,
      revalidation,
      outcome,
      planId: planResult.plan.id,
    });
    pr = {
      branch,
      base: flagString(context.parsed.flags, "base"),
      summaryPath: prSummaryPath,
      externalSideEffects,
    };
    if (options.openPr) {
      const prResult = await commitPushAndOpenPr(context, {
        branch,
        base: pr.base,
        title: flagString(context.parsed.flags, "title") ?? `${resolved.candidate.id}: ${resolved.candidate.title}`,
        bodyPath: prSummaryPath,
        commitMessage: flagString(context.parsed.flags, "commit-message") ?? `fix: address ${resolved.candidate.id}`,
        changedFiles,
      });
      if (!prResult.ok) {
        diagnostics.push({ level: "error", code: "pr_create_failed", message: prResult.error });
        finalStatus = "failed";
      } else {
        pr = {
          ...pr,
          commitSha: prResult.commitSha,
          url: prResult.url,
          externalSideEffects: ["git commit", "git push", "gh pr create"],
        };
        externalSideEffects.push(...pr.externalSideEffects);
      }
    }
  }
  attempt.status = finalStatus;
  attempt.pr = pr;
  attempt.diagnostics = diagnostics;
  attempt.updatedAt = new Date().toISOString();
  await writeFixAttempt(context.paths, attempt);

  const blockedPr = options.requirePrProof && !prProofPassed;
  return {
    ok: true,
    exitCode: finalStatus === "failed" || blockedPr ? 3 : 0,
    data: {
      attempt,
      attemptPath,
      attempts,
      attemptPaths,
      planPath: planResult.path,
      ...(patchPreviewPath ? { patchPreviewPath } : {}),
      ...(prSummaryPath ? { prSummaryPath } : {}),
      changedFiles,
      outOfScopeFiles,
      allowedWriteScope,
      ...(revalidation ? { revalidation } : {}),
      ...(pr ? { pr } : {}),
      externalSideEffects,
      next: nextFixWorkflowStep({ dryRun, outcome, options, pr }),
    },
  };
}

async function resolveFixTarget(paths: StatePaths, target: string): Promise<{
  findingId: string;
  candidate: CandidateRecord;
} | undefined> {
  const candidates = await readLatestCandidates(paths);
  return resolveFixTargetFromCandidates(candidates, target);
}

function resolveFixTargetFromCandidates(candidates: CandidateRecord[], target: string): {
  findingId: string;
  candidate: CandidateRecord;
} | undefined {
  const candidate = candidates.find((item) => item.id === target || item.findingId === target);
  if (!candidate) {
    return undefined;
  }
  return { findingId: candidate.findingId ?? candidate.id, candidate };
}

async function ensureFixPlan(
  paths: StatePaths,
  runId: string,
  candidate: CandidateRecord,
  evidence: EvidenceRecord[],
  features: FeatureRecord[],
): Promise<{ plan: { id: string; content: string }; path: string }> {
  const existing = await latestPlanForTarget(paths, candidate.id, runId);
  if (existing?.content) {
    return { plan: existing, path: existing.path };
  }
  const plan = buildCandidatePlan(
    runId,
    candidate,
    evidenceForIds(evidence, candidate.evidenceIds),
    featuresForCandidate(candidate, features),
  );
  const planPath = await writePlan(paths, plan);
  return { plan, path: planPath };
}

function allowedWriteScopeForCandidate(
  candidate: CandidateRecord,
  features: FeatureRecord[],
  context: CommandContext,
): string[] {
  const scope = new Set<string>();
  for (const file of candidate.files) {
    scope.add(normalizeRelativePath(file.path));
  }
  for (const feature of featuresForCandidate(candidate, features)) {
    for (const file of [...feature.ownedFiles, ...feature.testFiles]) {
      scope.add(normalizeRelativePath(file.path));
    }
  }
  const extra = splitList(flagString(context.parsed.flags, "allow-files"));
  for (const item of extra) {
    scope.add(normalizeRelativePath(item));
  }
  return [...scope].sort();
}

async function runCodexPatchWorker(options: {
  root: string;
  command: string;
  model?: string | undefined;
  idleTimeoutMs: number;
  hardTimeoutMs: number;
  attemptId: string;
  attemptNumber: number;
  maxAttempts: number;
  previousAttempts: FixWorkerPreviousAttempt[];
  candidate: CandidateRecord;
  planContent: string;
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
  allowedWriteScope: string[];
  verificationCommands: string[];
  outputDir: string;
}): Promise<{
  exitCode: number | null;
  timedOut: boolean;
  timeoutReason?: "idle" | "hard" | undefined;
  worker: NonNullable<FixAttemptRecord["worker"]>;
  diagnostics: Diagnostic[];
}> {
  const outputPath = path.join(options.outputDir, `${options.attemptId}-worker.txt`);
  const prompt = buildFixWorkerPrompt(options);
  const args = [
    "exec",
    "-C",
    options.root,
    "-s",
    "workspace-write",
    "--skip-git-repo-check",
  ];
  if (options.model) {
    args.push("-m", options.model);
  }
  args.push("-");
  const result = await runProcess(options.command, args, prompt, {
    idleTimeoutMs: options.idleTimeoutMs,
    hardTimeoutMs: options.hardTimeoutMs,
    cwd: options.root,
    progressRoot: options.root,
  });
  await writeFile(outputPath, `${result.stdout}${result.stderr ? `\nSTDERR:\n${result.stderr}` : ""}`, "utf8");
  return {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    ...(result.timeoutReason ? { timeoutReason: result.timeoutReason } : {}),
    worker: {
      provider: "codex",
      command: options.command,
      exitCode: result.exitCode,
      outputPath,
      ...(result.timedOut ? { timedOut: true } : {}),
      ...(result.timeoutReason ? { timeoutReason: result.timeoutReason } : {}),
    },
    diagnostics: result.exitCode === 0
      ? []
      : [{
        level: result.timedOut ? "warning" : "error",
        code: result.timedOut
          ? result.timeoutReason === "hard"
            ? "fix_worker_hard_timeout"
            : "fix_worker_idle_timeout"
          : result.providerUnavailable
            ? "fix_worker_unavailable"
            : "fix_worker_failed",
        message: result.stderr || result.stdout || "Patch worker failed.",
      }],
  };
}

async function runProcess(
  command: string,
  args: string[],
  stdin: string,
  options: {
    idleTimeoutMs: number;
    hardTimeoutMs: number;
    cwd?: string | undefined;
    progressRoot?: string | undefined;
  },
): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  timeoutReason?: "idle" | "hard" | undefined;
  providerUnavailable: boolean;
}> {
  const idleTimeoutMs = Math.max(1, options.idleTimeoutMs);
  const hardTimeoutMs = Math.max(idleTimeoutMs, options.hardTimeoutMs);
  let stdout = "";
  let stderr = "";
  let progressSnapshot = await collectProcessProgressSnapshot(options.progressRoot, stdout, stderr);

  return new Promise((resolve) => {
    let timedOut = false;
    let timeoutReason: "idle" | "hard" | undefined;
    let providerUnavailable = false;
    let settled = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let sawRepoProgress = false;
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
      cwd: options.cwd,
    });
    const output = collectProcessOutput(child);

    const clearTimers = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      if (hardTimer) {
        clearTimeout(hardTimer);
      }
      if (killTimer) {
        clearTimeout(killTimer);
      }
    };

    const terminate = (reason: "idle" | "hard") => {
      if (settled || timedOut) {
        return;
      }
      timedOut = true;
      timeoutReason = reason;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 5000);
    };

    const scheduleIdleCheck = () => {
      idleTimer = setTimeout(() => {
        void (async () => {
          ({ stdout, stderr } = output.current());
          const current = await collectProcessProgressSnapshot(options.progressRoot, stdout, stderr);
          const progressKind = processProgressKind(progressSnapshot, current, sawRepoProgress);
          if (progressKind !== "none") {
            if (progressKind === "repo") {
              sawRepoProgress = true;
            }
            progressSnapshot = current;
            scheduleIdleCheck();
            return;
          }
          terminate("idle");
        })();
      }, idleTimeoutMs);
    };

    hardTimer = setTimeout(() => terminate("hard"), hardTimeoutMs);
    scheduleIdleCheck();

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      ({ stdout, stderr } = output.current());
      providerUnavailable = typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
      resolve({ exitCode: 1, stdout, stderr: error.message, timedOut, timeoutReason, providerUnavailable });
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      ({ stdout, stderr } = output.current());
      resolve({ exitCode, stdout, stderr, timedOut, timeoutReason, providerUnavailable });
    });
    child.stdin.end(stdin);
  });
}

async function collectProcessProgressSnapshot(
  root: string | undefined,
  stdout: string,
  stderr: string,
): Promise<{ outputLength: number; dirtySignature: string }> {
  if (!root) {
    return { outputLength: stdout.length + stderr.length, dirtySignature: "" };
  }
  return {
    outputLength: stdout.length + stderr.length,
    dirtySignature: await dirtyContentSignature(root, await dirtyFileEntries(root)),
  };
}

function processProgressKind(
  left: { outputLength: number; dirtySignature: string },
  right: { outputLength: number; dirtySignature: string },
  sawRepoProgress: boolean,
): "repo" | "startup-output" | "none" {
  if (left.dirtySignature !== right.dirtySignature) {
    return "repo";
  }
  if (!sawRepoProgress && left.outputLength !== right.outputLength) {
    return "startup-output";
  }
  return "none";
}

function buildFixWorkerPrompt(options: {
  attemptNumber: number;
  maxAttempts: number;
  previousAttempts: FixWorkerPreviousAttempt[];
  candidate: CandidateRecord;
  planContent: string;
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
  allowedWriteScope: string[];
  verificationCommands: string[];
}): string {
  return [
    "You are applying one bounded Deepclean fix in a local repository.",
    `Attempt: ${options.attemptNumber} of ${options.maxAttempts}.`,
    "",
    "Rules:",
    "- Fix only the selected candidate.",
    "- Keep the patch minimal.",
    "- Edit only files in Allowed write scope.",
    "- Do not commit, push, open PRs, publish, or run external actions.",
    "- Add or update focused tests only when they are in scope.",
    "- After making the minimal patch, stop. Deepclean owns final verification and revalidation.",
    "- Stop if the plan is too broad or unsafe.",
    "- If this is a follow-up attempt, focus on remaining evidence and do not revisit already-good changes.",
    "",
    "Candidate JSON:",
    JSON.stringify(options.candidate, null, 2),
    "",
    "Allowed write scope:",
    options.allowedWriteScope.map((file) => `- ${file}`).join("\n") || "- n/a",
    "",
    "Verification commands the final patch must satisfy:",
    options.verificationCommands.map((command) => `- ${command}`).join("\n") || "- n/a",
    "",
    "Feature context:",
    JSON.stringify(options.features.map((feature) => ({
      featureId: feature.featureId,
      title: feature.title,
      ownedFiles: feature.ownedFiles,
      testFiles: feature.testFiles,
      verification: feature.verification,
    })), null, 2),
    "",
    "Evidence:",
    JSON.stringify(options.evidence.map((record) => ({
      id: record.id,
      kind: record.kind,
      title: record.title,
      summary: record.summary,
      files: record.files,
    })), null, 2),
    "",
    "Previous attempts:",
    options.previousAttempts.length > 0
      ? JSON.stringify(options.previousAttempts, null, 2)
      : "None.",
    "",
    "Fix plan:",
    options.planContent,
  ].join("\n");
}

function shouldRetryFixAttempt(options: {
  dryRun: boolean;
  hasPatchPath: boolean;
  attemptNumber: number;
  maxAttempts: number;
  changedFiles: string[];
  outOfScopeFiles: string[];
  verificationResults: FixAttemptRecord["verificationResults"];
  outcome?: FixAttemptRecord["outcome"] | undefined;
  revalidationRequired: boolean;
}): boolean {
  if (options.dryRun || options.hasPatchPath || options.attemptNumber >= options.maxAttempts) {
    return false;
  }
  if (options.changedFiles.length === 0 || options.outOfScopeFiles.length > 0) {
    return false;
  }
  if (options.verificationResults.some((result) => !result.passed)) {
    return true;
  }
  if (!options.revalidationRequired) {
    return false;
  }
  return options.outcome === "still-open" || options.outcome === "partially-resolved";
}

async function scopedDiffSignature(root: string, allowedWriteScope: string[]): Promise<string> {
  const allowedDirty = (await dirtyFileEntries(root))
    .filter((entry) => isPathAllowed(entry.file, allowedWriteScope));
  if (allowedDirty.length === 0) {
    return "";
  }
  return dirtyContentSignature(root, allowedDirty);
}

async function revalidateFixTarget(
  context: CommandContext,
  findingId: string,
): Promise<{ revalidation: RevalidationRecord; diagnostics: Diagnostic[] }> {
  const beforeFindings = await readFindings(context.paths);
  const finding = beforeFindings.find((item) => item.id === findingId);
  const scan = await executeScan(context, { synthesize: false });
  const revalidation = await classifyRevalidation({
    root: context.paths.root,
    finding,
    currentCandidates: scan.data.candidates,
    runId: scan.runId,
    createdAt: new Date().toISOString(),
  });
  await writeRevalidation(context.paths, revalidation);
  return { revalidation, diagnostics: scan.diagnostics };
}

function classifyFixOutcome(options: {
  dryRun: boolean;
  status: FixAttemptRecord["status"];
  outOfScopeFiles: string[];
  verificationResults: FixAttemptRecord["verificationResults"];
  revalidation?: RevalidationRecord | undefined;
  requireRevalidation: boolean;
}): FixAttemptRecord["outcome"] {
  if (options.dryRun) {
    return undefined;
  }
  if (options.outOfScopeFiles.length > 0 || options.status === "failed") {
    return "needs_human";
  }
  if (options.verificationResults.some((result) => !result.passed)) {
    return "needs_human";
  }
  if (options.requireRevalidation && !options.revalidation) {
    return "needs_human";
  }
  switch (options.revalidation?.outcome) {
    case "fixed":
      return "resolved";
    case "changed":
      return "partially-resolved";
    case "unchanged":
      return "still-open";
    case "superseded":
      return "superseded";
    case "stale":
      return "resolved";
    case "inconclusive":
      return "needs_human";
    case undefined:
      return options.status === "passed" ? "partially-resolved" : "needs_human";
  }
}

async function writePrReadySummary(
  paths: StatePaths,
  options: {
    attemptId: string;
    candidate: CandidateRecord;
    branch: string;
    changedFiles: string[];
    verificationResults: FixAttemptRecord["verificationResults"];
    revalidation?: RevalidationRecord | undefined;
    outcome: NonNullable<FixAttemptRecord["outcome"]>;
    planId: string;
  },
): Promise<string> {
  const lines = [
    `# Deepclean PR Summary: ${options.candidate.id}`,
    "",
    `Branch: ${options.branch}`,
    `Candidate: ${options.candidate.id}${options.candidate.findingId ? ` / ${options.candidate.findingId}` : ""}`,
    `Title: ${options.candidate.title}`,
    `Outcome: ${options.outcome}`,
    `Plan: ${options.planId}`,
    "",
    "## Changed Files",
    ...options.changedFiles.map((file) => `- ${file}`),
    "",
    "## Expected Behavior",
    options.candidate.suggestedDirection,
    "",
    "## Verification",
    ...options.verificationResults.map((result) => `- ${result.passed ? "PASS" : "FAIL"} ${result.command}${typeof result.exitCode === "number" ? ` (exit ${result.exitCode})` : ""}`),
    "",
    "## Deepclean Revalidation",
    options.revalidation ? `- ${options.revalidation.id}: ${options.revalidation.outcome}` : "- not run",
    "",
    "## Why This Is Safe",
    options.candidate.fixReadiness?.minimumFixScope ?? "Patch is bounded to the selected Deepclean candidate and its allowed write scope.",
    "",
    "## Remaining Risk",
    options.outcome === "partially-resolved"
      ? "Candidate improved but Deepclean still sees follow-up work. Review remaining evidence before merging broad follow-ups."
      : "No additional risk was reported by the candidate-first workflow.",
  ];
  const summaryPath = path.join(paths.fixesDir, `${options.attemptId}-pr-summary.md`);
  await writeFile(summaryPath, `${lines.join("\n")}\n`, "utf8");
  return summaryPath;
}

async function commitPushAndOpenPr(
  context: CommandContext,
  options: {
    branch: string;
    base?: string | undefined;
    title: string;
    bodyPath: string;
    commitMessage: string;
    changedFiles: string[];
  },
): Promise<{ ok: true; commitSha: string; url: string } | { ok: false; error: string }> {
  const root = context.paths.root;
  const add = await gitExec(root, ["add", "--", ...options.changedFiles]);
  if (!add.ok) {
    return add;
  }
  const commit = await gitExec(root, ["commit", "-m", options.commitMessage]);
  if (!commit.ok) {
    return commit;
  }
  const commitShaResult = await gitExec(root, ["rev-parse", "HEAD"]);
  if (!commitShaResult.ok) {
    return commitShaResult;
  }
  const push = await gitExec(root, ["push", "-u", "origin", options.branch]);
  if (!push.ok) {
    return push;
  }
  const args = ["pr", "create", "--title", options.title, "--body-file", options.bodyPath, "--head", options.branch];
  if (options.base) {
    args.push("--base", options.base);
  }
  const pr = await execFileAsync("gh", args, { cwd: root, timeout: 120_000 })
    .then((result) => ({ ok: true as const, url: result.stdout.trim() }))
    .catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }));
  if (!pr.ok) {
    return pr;
  }
  return { ok: true, commitSha: commitShaResult.stdout.trim(), url: pr.url };
}

async function gitExec(root: string, args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  try {
    const result = await execFileAsync("git", args, { cwd: root, timeout: 120_000 });
    return { ok: true, stdout: result.stdout };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkoutWorkBranch(root: string, branch: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, timeout: 5000 })
    .then((result) => result.stdout.trim())
    .catch(() => undefined);
  if (current === branch) {
    return { ok: true };
  }
  const existing = await execFileAsync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: root, timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  const args = existing ? ["switch", branch] : ["switch", "-c", branch];
  const result = await gitExec(root, args);
  return result.ok ? { ok: true } : result;
}

async function changedFilesSince(root: string, beforeDirty: string[]): Promise<string[]> {
  const before = new Set(beforeDirty);
  const after = (await dirtyFileEntries(root)).map((entry) => entry.file);
  return after.filter((file) => !before.has(file));
}

function isPathAllowed(file: string, allowedWriteScope: string[]): boolean {
  const normalized = normalizeRelativePath(file);
  return allowedWriteScope.some((allowed) => pathMatchesAllowed(normalized, allowed));
}

function pathMatchesAllowed(file: string, allowed: string): boolean {
  if (allowed.endsWith("/**")) {
    return file.startsWith(allowed.slice(0, -2));
  }
  if (allowed.includes("*")) {
    const escaped = allowed
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(file);
  }
  return file === allowed;
}

function normalizeRelativePath(value: string): string {
  const portablePath = value.split(path.sep).join("/");
  return portablePath.replace(/^\.?\//, "");
}

function splitList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

async function writeFixLifecycleEvents(
  paths: StatePaths,
  attempt: FixAttemptRecord,
  command: "fix" | "work",
  revalidation?: RevalidationRecord | undefined,
): Promise<void> {
  const now = attempt.updatedAt;
  await writeLifecycleEvents(paths, [
    {
      schemaVersion,
      recordType: "lifecycle_event",
      id: timestampId("event"),
      targetType: "fix_attempt",
      targetId: attempt.id,
      findingId: attempt.findingId,
      kind: "fix-attempted",
      command,
      createdAt: now,
      data: {
        candidateId: attempt.candidateId,
        dryRun: attempt.dryRun,
        status: attempt.status,
        outcome: attempt.outcome,
        changedFiles: attempt.changedFiles,
      },
    },
    ...(attempt.verificationResults.length > 0
      ? [{
        schemaVersion,
        recordType: "lifecycle_event" as const,
        id: timestampId("event"),
        targetType: "fix_attempt" as const,
        targetId: attempt.id,
        findingId: attempt.findingId,
        kind: attempt.verificationResults.every((result) => result.passed) ? "verification-passed" as const : "verification-failed" as const,
        command,
        createdAt: now,
        data: { verificationResults: attempt.verificationResults },
      }]
      : []),
    ...(revalidation
      ? [{
        schemaVersion,
        recordType: "lifecycle_event" as const,
        id: timestampId("event"),
        targetType: "fix_attempt" as const,
        targetId: attempt.id,
        findingId: attempt.findingId,
        kind: "revalidated" as const,
        command,
        createdAt: now,
        data: { revalidationId: revalidation.id, outcome: revalidation.outcome },
      }]
      : []),
  ]);
}

function nextFixWorkflowStep(options: {
  dryRun: boolean;
  outcome?: FixAttemptRecord["outcome"] | undefined;
  options: { openPr: boolean; requirePrProof: boolean };
  pr?: FixAttemptRecord["pr"] | undefined;
}): string {
  if (options.dryRun) {
    return "Review the preview, then rerun with --apply and an explicit --verification command.";
  }
  if (options.pr?.url) {
    return "PR opened. Review CI and merge when ready.";
  }
  if (options.outcome === "resolved" || options.outcome === "partially-resolved") {
    return options.options.openPr
      ? "Local proof passed, but PR creation did not complete. Inspect diagnostics."
      : "Local proof passed. Use --pr to push and open a PR.";
  }
  return "Inspect the fix attempt artifact; Deepclean did not prove this candidate is PR-ready.";
}

function fixReadinessBlocker(candidate: CandidateRecord): { code: string; message: string } | undefined {
  if (candidate.confidence === "low") {
    return { code: "fix_low_confidence", message: "Low-confidence findings must be confirmed before fix execution." };
  }
  const lifecycleState = candidate.lifecycleState ?? "open";
  if (["stale", "fixed", "superseded", "inconclusive", "suppressed"].includes(lifecycleState)) {
    return { code: "fix_not_current", message: `Finding lifecycle state is ${lifecycleState}; revalidate or choose another finding.` };
  }
  if (candidate.risk === "design-needed") {
    return { code: "fix_ambiguous", message: "Design-needed findings are too ambiguous for guarded fix execution." };
  }
  return undefined;
}

async function latestPlanForTarget(paths: StatePaths, candidateId: string, runId: string): Promise<{
  id: string;
  runId: string;
  targetId: string;
  createdAt: string;
  content: string;
  path: string;
} | undefined> {
  const files = await filesWithExtension(paths.plansDir, "json");
  const plans: Array<{ id: string; runId: string; targetId: string; createdAt: string; content: string; path: string }> = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as { id?: unknown; runId?: unknown; targetId?: unknown; createdAt?: unknown; content?: unknown };
      if (typeof parsed.id === "string" && typeof parsed.runId === "string" && typeof parsed.targetId === "string") {
        plans.push({
          id: parsed.id,
          runId: parsed.runId,
          targetId: parsed.targetId,
          createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
          content: typeof parsed.content === "string" ? parsed.content : "",
          path: file,
        });
      }
    } catch {
      // Ignore malformed historical plan records here; schema validation handles them elsewhere.
    }
  }
  return plans
    .filter((plan) => plan.targetId === candidateId && plan.runId === runId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
}

async function latestRevalidationForFinding(
  paths: StatePaths,
  findingId: string,
): Promise<{ outcome: string; createdAt: string } | undefined> {
  const files = await filesWithExtension(paths.revalidationsDir, "json");
  const records: Array<{ targetId: string; outcome: string; createdAt: string }> = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as { targetId?: unknown; outcome?: unknown; createdAt?: unknown };
      if (parsed.targetId === findingId && typeof parsed.outcome === "string") {
        records.push({
          targetId: findingId,
          outcome: parsed.outcome,
          createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
        });
      }
    } catch {
      // Ignore malformed historical revalidation records.
    }
  }
  return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
}

function changedFilesFromPatch(patchContent: string): string[] {
  const files = new Set<string>();
  for (const line of patchContent.split(/\r?\n/)) {
    const match = line.match(/^\+\+\+ b\/(.+)$/);
    if (match?.[1] && match[1] !== "/dev/null") {
      files.add(match[1]);
    }
  }
  return [...files].sort();
}

async function dirtyFileEntries(root: string): Promise<DirtyFileEntry[]> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd: root, timeout: 5000 });
    return stdout.split(/\r?\n/)
      .map((line) => ({
        status: line.slice(0, 2),
        file: line.slice(3).trim(),
      }))
      .filter((entry) => entry.file.length > 0)
      .map((entry) => ({
        ...entry,
        file: normalizeRelativePath(entry.file.split(" -> ").at(-1) ?? entry.file),
      }))
      .sort((a, b) => a.file.localeCompare(b.file));
  } catch {
    return [];
  }
}

async function dirtyContentSignature(root: string, entries: DirtyFileEntry[]): Promise<string> {
  const normalized = entries
    .map((entry) => ({ ...entry, file: normalizeRelativePath(entry.file) }))
    .sort((a, b) => a.file.localeCompare(b.file));
  const trackedFiles = normalized
    .filter((entry) => entry.status !== "??")
    .map((entry) => entry.file);
  const unstagedDiff = trackedFiles.length > 0
    ? await execFileAsync("git", ["diff", "--", ...trackedFiles], { cwd: root, timeout: 30_000 })
      .then((result) => result.stdout)
      .catch(() => "")
    : "";
  const stagedDiff = trackedFiles.length > 0
    ? await execFileAsync("git", ["diff", "--cached", "--", ...trackedFiles], { cwd: root, timeout: 30_000 })
      .then((result) => result.stdout)
      .catch(() => "")
    : "";
  const untracked = await Promise.all(normalized
    .filter((entry) => entry.status === "??")
    .map(async (entry) => {
      try {
        const content = await readFile(path.join(root, entry.file));
        return `${entry.file}:untracked:${content.toString("base64")}`;
      } catch {
        return `${entry.file}:missing`;
      }
    }));
  return [unstagedDiff, stagedDiff, ...untracked.sort()].join("\n");
}

function verificationCommandsForFix(
  context: CommandContext,
  config: DeepcleanConfig,
  candidate: CandidateRecord,
): string[] {
  const override = flagString(context.parsed.flags, "verification")
    ?? flagString(context.parsed.flags, "verification-command");
  if (override) {
    return [override];
  }
  if (config.fixExecution.verificationCommands.length > 0) {
    return config.fixExecution.verificationCommands;
  }
  return candidate.verification;
}

async function runFixVerification(
  paths: StatePaths,
  attemptId: string,
  commandsToRun: string[],
): Promise<FixAttemptRecord["verificationResults"]> {
  const results: FixAttemptRecord["verificationResults"] = [];
  for (const [index, command] of commandsToRun.entries()) {
    const outputPath = path.join(paths.fixesDir, `${attemptId}-verification-${String(index + 1).padStart(2, "0")}.txt`);
    const result = await execFileAsync("sh", ["-lc", command], { cwd: paths.root, timeout: 120_000 })
      .then((output) => ({ exitCode: 0, output: `${output.stdout}${output.stderr}` }))
      .catch((error) => ({
        exitCode: typeof error === "object" && error && "code" in error && typeof error.code === "number" ? error.code : 1,
        output: error instanceof Error ? error.message : String(error),
      }));
    await writeFile(outputPath, result.output, "utf8");
    results.push({
      command,
      exitCode: result.exitCode,
      passed: result.exitCode === 0,
      outputPath,
    });
  }
  return results;
}

async function candidateForHistoryLookup(
  paths: StatePaths,
  id: string,
  runId?: string | undefined,
): Promise<CandidateRecord | undefined> {
  if (runId) {
    return (await readCandidates(paths, runId)).find((candidate) => candidate.id === id);
  }
  return (await readLatestCandidates(paths)).find((candidate) => candidate.id === id);
}

async function resolveRevalidationTargets(
  paths: StatePaths,
  target: string,
  findings: Awaited<ReturnType<typeof readFindings>>,
): Promise<Awaited<ReturnType<typeof readFindings>>> {
  if (target === "all") {
    return findings;
  }
  if (target.startsWith("candidate-")) {
    const candidate = await candidateForHistoryLookup(paths, target, undefined);
    return candidate?.findingId
      ? findings.filter((finding) => finding.id === candidate.findingId)
      : [];
  }
  return findings.filter((finding) => finding.id === target);
}

async function withWriteLock(context: CommandContext, fn: () => Promise<number>): Promise<number> {
  const lockOptions = {
    command: context.parsed.command ?? "unknown",
    wait: flagBoolean(context.parsed.flags, "wait-lock"),
    timeoutMs: numberFlag(context, "lock-timeout-ms") ?? 0,
    staleAfterMs: numberFlag(context, "stale-lock-ms"),
  };
  return withStateWriteLock(context.paths, lockOptions, fn);
}

function requireCandidateId(context: CommandContext): string {
  const id = context.parsed.positional[0];
  if (!id) {
    throw new Error("Candidate ID is required");
  }
  return id;
}

function lockStatusPayload(lock: Awaited<ReturnType<typeof readLockStatuses>>[number]): Record<string, unknown> {
  return {
    id: lock.record?.id,
    owner: lock.record?.owner,
    pid: lock.record?.pid,
    command: lock.record?.command,
    statePath: lock.record?.statePath,
    createdAt: lock.record?.createdAt,
    stale: lock.stale,
    reason: lock.reason,
    recoveryCommand: lock.recoveryCommand,
  };
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

function featuresForCandidates(candidates: CandidateRecord[], features: FeatureRecord[]): FeatureRecord[] {
  const wanted = new Set(candidates.flatMap((candidate) => candidate.affectedFeatureIds));
  return features.filter((feature) => wanted.has(feature.featureId));
}

function validationForCandidate(
  candidate: CandidateRecord,
  attempt: SynthesisAttemptRecord | undefined,
): SynthesisAttemptRecord["validations"][number] | undefined {
  const validationId = candidate.provenance.validationId;
  if (!attempt || !validationId) {
    return undefined;
  }
  return attempt.validations.find((validation) => validation.id === validationId);
}

function formatFileRef(file: CandidateRecord["files"][number]): string {
  if (file.startLine !== undefined && file.endLine !== undefined) {
    return `${file.path}:${file.startLine}-${file.endLine}`;
  }
  if (file.startLine !== undefined) {
    return `${file.path}:${file.startLine}`;
  }
  return file.path;
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
    ["features", paths.featuresDir],
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
    ["synthesis", paths.synthesisDir],
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

async function resolveScanScope(context: CommandContext, files: SourceFile[]): Promise<ScanScope> {
  const since = flagString(context.parsed.flags, "since");
  const mergeBaseRef = flagString(context.parsed.flags, "merge-base");
  const includeDirty = flagBoolean(context.parsed.flags, "include-dirty");
  const paths = csvFlag(context, "paths");
  const categories = csvFlag(context, "categories");
  const reviewers = csvFlag(context, "reviewers");
  const dirtyPaths = includeDirty ? await gitChangedPaths(context.paths.root, ["diff", "--name-only"]) : [];
  const untrackedPaths = includeDirty ? await gitChangedPaths(context.paths.root, ["ls-files", "--others", "--exclude-standard"]) : [];
  const committedChangedPaths = mergeBaseRef
    ? await gitMergeBaseChangedPaths(context.paths.root, mergeBaseRef)
    : since
      ? await gitChangedPaths(context.paths.root, ["diff", "--name-only", `${since}...HEAD`])
      : [];
  const changedPaths = uniqueNormalized([
    ...committedChangedPaths,
    ...dirtyPaths,
    ...untrackedPaths,
  ]).filter((filePath) => files.some((file) => file.path === filePath));
  return {
    incremental: Boolean(since || mergeBaseRef || includeDirty || paths.length > 0),
    ...(since ? { since } : {}),
    ...(mergeBaseRef ? { mergeBase: mergeBaseRef } : {}),
    includeDirty,
    paths,
    changedPaths,
    categories,
    reviewers,
    onlyExisting: flagBoolean(context.parsed.flags, "only-existing"),
    newOnly: flagBoolean(context.parsed.flags, "new-only"),
    dirtyPaths: uniqueNormalized([...dirtyPaths, ...untrackedPaths]),
  };
}

function fileInScope(file: SourceFile, scope: ScanScope): boolean {
  const pathMatched = pathInScope(file.path, scope);
  if (!pathMatched) {
    return false;
  }
  if (scope.changedPaths.length === 0) {
    return true;
  }
  return scope.changedPaths.includes(file.path);
}

function pathInScope(filePath: string, scope: ScanScope): boolean {
  if (scope.paths.length === 0) {
    return true;
  }
  return scope.paths.some((prefix) => {
    const normalizedPrefix = prefix.replace(/\/$/, "");
    return filePath === prefix || filePath.startsWith(`${normalizedPrefix}/`);
  });
}

function featureInScope(feature: FeatureRecord, scope: ScanScope): boolean {
  if (!scope.incremental) {
    return true;
  }
  const featurePaths = uniqueNormalized([
    ...feature.entrypoints.map((file) => file.path),
    ...feature.ownedFiles.map((file) => file.path),
    ...feature.contextFiles.map((file) => file.path),
    ...feature.testFiles.map((file) => file.path),
    ...feature.fileRoles.map((role) => role.path),
  ]);
  return featurePaths.some((filePath) => {
    if (!pathInScope(filePath, scope)) {
      return false;
    }
    return scope.changedPaths.length === 0 || scope.changedPaths.includes(filePath);
  });
}

function filterCandidatesByScanScope(candidates: CandidateRecord[], scope: ScanScope): CandidateRecord[] {
  return candidates.filter((candidate) => {
    if (scope.categories.length > 0 && !scope.categories.includes(candidate.category)) {
      return false;
    }
    if (scope.onlyExisting && candidate.baselineStatus !== "existing") {
      return false;
    }
    if (scope.newOnly && candidate.baselineStatus !== "new") {
      return false;
    }
    return true;
  });
}

function markDirtyTreeEvidence(evidence: EvidenceRecord[], scope: ScanScope): EvidenceRecord[] {
  if (scope.dirtyPaths.length === 0) {
    return evidence;
  }
  const dirty = new Set(scope.dirtyPaths);
  return evidence.map((record) => {
    const dirtyTree = record.files.some((file) => dirty.has(file.path));
    return dirtyTree
      ? {
        ...record,
        data: {
          ...record.data,
          dirtyTree: true,
          freshness: "dirty",
        },
      }
      : record;
  });
}

interface QueryFilter {
  status?: string;
  priority?: string;
  category?: string;
  risk?: string;
  source?: string;
  feature?: string;
  theme?: string;
  path?: string;
  lifecycleState?: string;
  revalidationState?: string;
  baselineStatus?: string;
}

function queryFilterFromFlags(context: CommandContext): QueryFilter {
  const filter: QueryFilter = {};
  const entries: Array<[keyof QueryFilter, string]> = [
    ["status", "status"],
    ["priority", "priority"],
    ["category", "category"],
    ["risk", "risk"],
    ["source", "source"],
    ["feature", "feature"],
    ["theme", "theme"],
    ["path", "path"],
    ["lifecycleState", "lifecycle-state"],
    ["revalidationState", "revalidation-state"],
    ["baselineStatus", "baseline-status"],
  ];
  for (const [property, flag] of entries) {
    const value = flagString(context.parsed.flags, flag);
    if (value) {
      filter[property] = value;
    }
  }
  return filter;
}

function filterCandidatesForQuery(
  candidates: CandidateRecord[],
  clusters: ClusterRecord[],
  filter: QueryFilter,
): CandidateRecord[] {
  const themeCandidateIds = filter.theme
    ? new Set(clusters.find((cluster) => cluster.id === filter.theme)?.candidateIds ?? [])
    : undefined;
  return candidates.filter((candidate) => {
    if (filter.status && candidate.status !== filter.status) {
      return false;
    }
    if (filter.priority && candidate.priority !== filter.priority.toUpperCase()) {
      return false;
    }
    if (filter.category && candidate.category !== filter.category) {
      return false;
    }
    if (filter.risk && candidate.risk !== filter.risk) {
      return false;
    }
    if (filter.source && candidate.provenance.source !== filter.source) {
      return false;
    }
    if (filter.feature && !candidate.affectedFeatureIds.includes(filter.feature)) {
      return false;
    }
    if (themeCandidateIds && !themeCandidateIds.has(candidate.id)) {
      return false;
    }
    if (filter.path && !candidate.files.some((file) => file.path === filter.path || file.path.startsWith(`${filter.path}/`))) {
      return false;
    }
    if (filter.lifecycleState && (candidate.lifecycleState ?? "open") !== filter.lifecycleState) {
      return false;
    }
    if (filter.revalidationState && (candidate.lifecycleState ?? "open") !== filter.revalidationState) {
      return false;
    }
    if (filter.baselineStatus && (candidate.baselineStatus ?? "unknown") !== filter.baselineStatus) {
      return false;
    }
    return true;
  });
}

function candidateQueueItem(candidate: CandidateRecord): Record<string, unknown> {
  return {
    findingId: candidate.findingId ?? candidate.id,
    candidateId: candidate.id,
    title: candidate.title,
    priority: candidate.priority,
    category: candidate.category,
    risk: candidate.risk,
    status: candidate.status,
    lifecycleState: candidate.lifecycleState ?? "open",
    baselineStatus: candidate.baselineStatus ?? "unknown",
    problem: candidate.whyItMatters,
    evidenceIds: candidate.evidenceIds,
    files: candidate.files,
    constraints: [
      "Keep changes scoped to this finding.",
      "Preserve behavior unless verification proves current behavior is wrong.",
    ],
    verification: candidate.verification,
  };
}

function handoffFreshnessWarnings(candidate: CandidateRecord): string[] {
  const warnings: string[] = [];
  const lifecycleState = candidate.lifecycleState ?? "open";
  if (["stale", "fixed", "superseded", "inconclusive"].includes(lifecycleState)) {
    warnings.push(`Finding lifecycle state is ${lifecycleState}; revalidate before assigning implementation work.`);
  }
  if (candidate.confidence === "low") {
    warnings.push("Finding confidence is low; confirm evidence before implementation.");
  }
  return warnings;
}

function ciPolicyFromFlags(context: CommandContext): Record<string, unknown> {
  const policy: Record<string, unknown> = {};
  for (const key of [
    "max-p0",
    "max-p1",
    "max-p2",
    "max-p3",
    "max-new-p0",
    "max-new-p1",
    "max-new-p2",
    "max-new-p3",
    "max-stale",
  ]) {
    const value = flagString(context.parsed.flags, key);
    if (value !== undefined && value !== "") {
      policy[key] = Number(value);
    }
  }
  const minConfidence = flagString(context.parsed.flags, "min-confidence");
  if (minConfidence) {
    policy["min-confidence"] = minConfidence;
  }
  const failCategory = csvFlag(context, "fail-category");
  if (failCategory.length > 0) {
    policy["fail-category"] = failCategory;
  }
  return policy;
}

async function buildRetentionManifest(context: CommandContext): Promise<RetentionManifestRecord> {
  const keepRuns = numberFlag(context, "keep-runs") ?? 5;
  const keepDays = numberFlag(context, "keep-days");
  const dryRun = flagBoolean(context.parsed.flags, "dry-run");
  const now = new Date();
  const runRecords = await readRunRetentionRecords(context.paths);
  const sortedRuns = [...runRecords].sort((a, b) => a.id.localeCompare(b.id));
  const retainedRunIds = new Set<string>();
  for (const run of sortedRuns.slice(Math.max(0, sortedRuns.length - keepRuns))) {
    retainedRunIds.add(run.id);
  }
  const latest = sortedRuns.at(-1);
  if (latest) {
    retainedRunIds.add(latest.id);
  }
  if (keepDays !== undefined) {
    const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
    for (const run of sortedRuns) {
      if (Date.parse(run.createdAt) >= cutoff) {
        retainedRunIds.add(run.id);
      }
    }
  }

  const retainedPaths = new Set<string>();
  const deletePaths = new Set<string>();
  const blockedPaths: Array<{ path: string; reason: string }> = [{
    path: relativeStatePath(context.paths, context.paths.configPath),
    reason: "config is never pruned",
  }];
  const activeLocks = (await readLockStatuses(context.paths)).filter((lock) => !lock.stale);
  for (const lock of activeLocks) {
    blockedPaths.push({
      path: relativeStatePath(context.paths, lock.filePath),
      reason: "active locks are never pruned",
    });
  }

  for (const [dir, extension] of [
    [context.paths.runsDir, "json"],
    [context.paths.featuresDir, "json"],
    [context.paths.evidenceDir, "json"],
    [context.paths.candidatesDir, "json"],
    [context.paths.clustersDir, "json"],
    [context.paths.observationsDir, "json"],
    [context.paths.synthesisDir, "json"],
  ] as const) {
    const files = await filesWithExtension(dir, extension);
    for (const file of files) {
      const runId = path.basename(file, `.${extension}`);
      const relativePath = relativeStatePath(context.paths, file);
      if (retainedRunIds.has(runId)) {
        retainedPaths.add(relativePath);
      } else {
        deletePaths.add(relativePath);
      }
    }
  }

  const retainedCandidateIds = await candidateIdsForRuns(context.paths, retainedRunIds);
  await classifyRunLinkedArtifacts(context.paths, context.paths.reportsDir, retainedRunIds, retainedPaths, deletePaths, ["json", "md"]);
  await classifyRunLinkedArtifacts(context.paths, context.paths.plansDir, retainedRunIds, retainedPaths, deletePaths, ["json"]);
  await classifyHandoffArtifacts(context.paths, retainedCandidateIds, retainedPaths, deletePaths);

  return {
    schemaVersion,
    recordType: "retention_manifest",
    id: timestampId("retention"),
    dryRun,
    keepRuns,
    ...(keepDays !== undefined ? { keepDays } : {}),
    deletePaths: [...deletePaths].sort(),
    retainedPaths: [...retainedPaths].sort(),
    blockedPaths,
    privacyNotes: [
      "Prune never deletes .deepclean/config.json.",
      "Active locks and latest retained run artifacts are preserved.",
      "Source-safe sharing should use deepclean scrub or export --source-safe before attaching generated state outside the local machine.",
    ],
    createdAt: now.toISOString(),
  };
}

async function readRunRetentionRecords(paths: StatePaths): Promise<Array<{ id: string; createdAt: string }>> {
  const files = await filesWithExtension(paths.runsDir, "json");
  const records: Array<{ id: string; createdAt: string }> = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(await readFile(file, "utf8")) as { id?: unknown; completedAt?: unknown; startedAt?: unknown };
      const id = typeof raw.id === "string" ? raw.id : path.basename(file, ".json");
      const createdAt = typeof raw.completedAt === "string"
        ? raw.completedAt
        : typeof raw.startedAt === "string"
          ? raw.startedAt
          : "1970-01-01T00:00:00.000Z";
      records.push({ id, createdAt });
    } catch {
      records.push({ id: path.basename(file, ".json"), createdAt: "1970-01-01T00:00:00.000Z" });
    }
  }
  return records;
}

async function candidateIdsForRuns(paths: StatePaths, retainedRunIds: Set<string>): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const runId of retainedRunIds) {
    for (const candidate of await readCandidates(paths, runId).catch(() => [])) {
      ids.add(candidate.id);
    }
  }
  return ids;
}

async function classifyRunLinkedArtifacts(
  paths: StatePaths,
  dir: string,
  retainedRunIds: Set<string>,
  retainedPaths: Set<string>,
  deletePaths: Set<string>,
  extensions: string[],
): Promise<void> {
  const jsonFiles = await filesWithExtension(dir, "json");
  for (const jsonFile of jsonFiles) {
    let runId: string | undefined;
    try {
      const raw = JSON.parse(await readFile(jsonFile, "utf8")) as { runId?: unknown };
      runId = typeof raw.runId === "string" ? raw.runId : undefined;
    } catch {
      runId = undefined;
    }
    const id = path.basename(jsonFile, ".json");
    for (const extension of extensions) {
      const artifact = path.join(dir, `${id}.${extension}`);
      if (!(await pathExists(artifact))) {
        continue;
      }
      const relativePath = relativeStatePath(paths, artifact);
      if (runId && retainedRunIds.has(runId)) {
        retainedPaths.add(relativePath);
      } else {
        deletePaths.add(relativePath);
      }
    }
  }
}

async function classifyHandoffArtifacts(
  paths: StatePaths,
  retainedCandidateIds: Set<string>,
  retainedPaths: Set<string>,
  deletePaths: Set<string>,
): Promise<void> {
  const jsonFiles = await filesWithExtension(paths.handoffsDir, "json");
  for (const file of jsonFiles) {
    let candidateId: string | undefined;
    try {
      const raw = JSON.parse(await readFile(file, "utf8")) as { candidateId?: unknown };
      candidateId = typeof raw.candidateId === "string" ? raw.candidateId : undefined;
    } catch {
      candidateId = undefined;
    }
    const relativePath = relativeStatePath(paths, file);
    if (candidateId && retainedCandidateIds.has(candidateId)) {
      retainedPaths.add(relativePath);
    } else {
      deletePaths.add(relativePath);
    }
  }
}

async function filesWithExtension(dir: string, extension: string): Promise<string[]> {
  try {
    return (await readdir(dir))
      .filter((file) => file.endsWith(`.${extension}`))
      .map((file) => path.join(dir, file))
      .sort();
  } catch {
    return [];
  }
}

function relativeStatePath(paths: StatePaths, filePath: string): string {
  const relativePath = path.relative(paths.root, filePath);
  return relativePath.split(path.sep).join("/");
}

function sourceSafeFile(
  root: string,
  file: { path: string; startLine?: number | undefined; endLine?: number | undefined },
): { path: string; startLine?: number; endLine?: number } {
  const normalized = path.isAbsolute(file.path)
    ? path.relative(root, file.path)
    : file.path;
  return {
    path: normalized.split(path.sep).join("/"),
    ...(file.startLine ? { startLine: file.startLine } : {}),
    ...(file.endLine ? { endLine: file.endLine } : {}),
  };
}

function evaluateCiPolicy(candidates: CandidateRecord[], policy: Record<string, unknown>): {
  blockingFindingIds: string[];
  reasons: Array<{ findingId: string; reason: string }>;
} {
  const blockers = new Map<string, string>();
  const byPriority = countBy(candidates, (candidate) => candidate.priority.toLowerCase());
  for (const priority of ["p0", "p1", "p2", "p3"]) {
    const max = numberPolicy(policy, `max-${priority}`);
    if (max !== undefined && (byPriority[priority] ?? 0) > max) {
      for (const candidate of candidates.filter((item) => item.priority.toLowerCase() === priority).slice(max)) {
        blockers.set(candidate.findingId ?? candidate.id, `max-${priority}`);
      }
    }
    const maxNew = numberPolicy(policy, `max-new-${priority}`);
    if (maxNew !== undefined) {
      const newCandidates = candidates.filter((item) => (
        item.priority.toLowerCase() === priority
        && item.baselineStatus === "new"
      ));
      if (newCandidates.length > maxNew) {
        for (const candidate of newCandidates.slice(maxNew)) {
          blockers.set(candidate.findingId ?? candidate.id, `max-new-${priority}`);
        }
      }
    }
  }
  const maxStale = numberPolicy(policy, "max-stale");
  if (maxStale !== undefined) {
    const stale = candidates.filter((candidate) => candidate.lifecycleState === "stale" || candidate.status === "stale");
    if (stale.length > maxStale) {
      for (const candidate of stale.slice(maxStale)) {
        blockers.set(candidate.findingId ?? candidate.id, "max-stale");
      }
    }
  }
  const categories = Array.isArray(policy["fail-category"]) ? policy["fail-category"] : [];
  for (const candidate of candidates) {
    if (categories.includes(candidate.category)) {
      blockers.set(candidate.findingId ?? candidate.id, `fail-category:${candidate.category}`);
    }
  }
  const minConfidence = typeof policy["min-confidence"] === "string" ? policy["min-confidence"] : undefined;
  if (minConfidence) {
    const order = ["low", "medium", "high"];
    const minimum = order.indexOf(minConfidence);
    if (minimum >= 0) {
      for (const candidate of candidates) {
        if (order.indexOf(candidate.confidence) < minimum) {
          blockers.set(candidate.findingId ?? candidate.id, `min-confidence:${minConfidence}`);
        }
      }
    }
  }
  return {
    blockingFindingIds: [...blockers.keys()].sort(),
    reasons: [...blockers.entries()].map(([findingId, reason]) => ({ findingId, reason })),
  };
}

async function writeCiArtifacts(
  context: CommandContext,
  scan: ScanExecutionResult["data"],
  gate: { blockingFindingIds: string[]; reasons: Array<{ findingId: string; reason: string }> },
): Promise<{ json?: string; markdown?: string; sarif?: string }> {
  const artifactPaths: { json?: string; markdown?: string; sarif?: string } = {};
  const output = flagString(context.parsed.flags, "output");
  if (output) {
    const markdownPath = path.resolve(context.paths.root, output);
    await mkdir(path.dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, renderCiMarkdown(scan, gate), "utf8");
    artifactPaths.markdown = markdownPath;
  }
  const sarif = flagString(context.parsed.flags, "sarif");
  if (sarif) {
    const sarifPath = path.resolve(context.paths.root, sarif);
    await mkdir(path.dirname(sarifPath), { recursive: true });
    await writeFile(sarifPath, JSON.stringify(renderCiSarif(scan.candidates), null, 2) + "\n", "utf8");
    artifactPaths.sarif = sarifPath;
  }
  return artifactPaths;
}

function renderCiMarkdown(
  scan: ScanExecutionResult["data"],
  gate: { blockingFindingIds: string[]; reasons: Array<{ findingId: string; reason: string }> },
): string {
  return [
    "# Deepclean CI",
    "",
    `Run: ${scan.runId}`,
    `Candidates: ${scan.candidateCount}`,
    `Blocking: ${gate.blockingFindingIds.length}`,
    "",
    "## Blocking Findings",
    "",
    ...(
      gate.reasons.length > 0
        ? gate.reasons.map((reason) => `- ${reason.findingId}: ${reason.reason}`)
        : ["None"]
    ),
    "",
  ].join("\n");
}

function renderCiSarif(candidates: CandidateRecord[]): unknown {
  return {
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "Deepclean" } },
      results: candidates.map((candidate) => ({
        ruleId: `deepclean/${candidate.category}`,
        level: candidate.priority === "P0" || candidate.priority === "P1" ? "warning" : "note",
        message: { text: `${candidate.id}: ${candidate.title}` },
        locations: candidate.files.slice(0, 1).map((file) => ({
          physicalLocation: {
            artifactLocation: { uri: file.path },
            region: { startLine: file.startLine ?? 1, endLine: file.endLine ?? file.startLine ?? 1 },
          },
        })),
        properties: {
          findingId: candidate.findingId,
          priority: candidate.priority,
          confidence: candidate.confidence,
          baselineStatus: candidate.baselineStatus,
        },
      })),
    }],
  };
}

function numberPolicy(policy: Record<string, unknown>, key: string): number | undefined {
  const value = policy[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function gitMergeBaseChangedPaths(root: string, ref: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", ["merge-base", ref, "HEAD"], { cwd: root, timeout: 5000 });
    const mergeBase = stdout.trim();
    return mergeBase ? gitChangedPaths(root, ["diff", "--name-only", `${mergeBase}...HEAD`]) : [];
  } catch {
    return [];
  }
}

async function gitChangedPaths(root: string, args: string[]): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: root, timeout: 5000 });
    return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function csvFlag(context: CommandContext, key: string): string[] {
  const value = flagString(context.parsed.flags, key);
  if (!value) {
    return [];
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function providerRuntimeControls(context: CommandContext, config: DeepcleanConfig): ProviderRuntimeControls {
  const provider = flagString(context.parsed.flags, "provider");
  if (provider && provider !== "codex") {
    throw new Error(`Unsupported provider: ${provider}. Only codex is currently supported.`);
  }
  const timeoutSeconds = numberFlag(context, "timeout");
  const timeoutMs = numberFlag(context, "timeout-ms") ?? (
    timeoutSeconds !== undefined ? timeoutSeconds * 1000 : config.reviewSynthesis.timeoutMs
  );
  const privacyMode = privacyModeFromFlag(flagString(context.parsed.flags, "privacy-mode"))
    ?? config.reviewSynthesis.privacyMode;
  const offline = flagBoolean(context.parsed.flags, "offline")
    || flagBoolean(context.parsed.flags, "local-only")
    || flagBoolean(context.parsed.flags, "evidence-only")
    || config.reviewSynthesis.offline
    || privacyMode === "local-only";
  const excerptBudget = numberFlag(context, "excerpt-budget") ?? config.reviewSynthesis.excerptBudget;
  const allowSourceInModel = !offline && (
    flagBoolean(context.parsed.flags, "allow-source-in-model")
    || config.privacy.allowSourceInModel
    || privacyMode === "source-ok"
  ) && excerptBudget > 0;
  const runtime: ProviderRuntimeControls = {
    provider: "codex",
    command: config.reviewSynthesis.command,
    timeoutMs,
    retries: numberFlag(context, "retries") ?? config.reviewSynthesis.retries,
    rpm: numberFlag(context, "rpm") ?? config.reviewSynthesis.rpm,
    concurrency: numberFlag(context, "concurrency") ?? config.reviewSynthesis.concurrency,
    tokenBudget: numberFlag(context, "token-budget") ?? config.reviewSynthesis.tokenBudget,
    excerptBudget,
    offline,
    privacyMode,
    allowSourceInModel,
  };
  const model = flagString(context.parsed.flags, "model") ?? config.reviewSynthesis.model;
  if (model) {
    runtime.model = model;
  }
  const effort = flagString(context.parsed.flags, "effort") ?? config.reviewSynthesis.effort;
  if (effort) {
    runtime.effort = effort;
  }
  return runtime;
}

function synthesisDisabledByPolicy(context: CommandContext, config: DeepcleanConfig): boolean {
  const privacyMode = privacyModeFromFlag(flagString(context.parsed.flags, "privacy-mode"))
    ?? config.reviewSynthesis.privacyMode;
  return flagBoolean(context.parsed.flags, "offline")
    || flagBoolean(context.parsed.flags, "local-only")
    || flagBoolean(context.parsed.flags, "evidence-only")
    || config.reviewSynthesis.offline
    || privacyMode === "local-only";
}

const requiredSynthesisFailureCodes = new Set([
  "codex_provider_unavailable",
  "codex_synthesis_timeout",
  "codex_synthesis_failed",
  "codex_synthesis_error",
]);

function requiredSynthesisFailure(scan: ScanExecutionResult): Diagnostic | undefined {
  if (!scan.data.synthesis.requested) {
    return {
      level: "error",
      code: "ci_synthesis_required",
      message: "CI policy requires synthesis, but the scan did not run provider synthesis.",
      adapter: "codex-synthesis",
    };
  }

  const diagnostic = scan.diagnostics.find((item) => (
    item.adapter === "codex-synthesis"
    && requiredSynthesisFailureCodes.has(item.code)
  ));
  if (!diagnostic) {
    return undefined;
  }

  return {
    ...diagnostic,
    level: "error",
    message: `CI policy requires synthesis, but provider synthesis failed: ${diagnostic.message}`,
  };
}

function sameSynthesisFailure(diagnostic: Diagnostic, failure: Diagnostic): boolean {
  return diagnostic.adapter === failure.adapter
    && diagnostic.code === failure.code
    && requiredSynthesisFailureCodes.has(diagnostic.code);
}

function providerRuntimeSummary(runtime: ProviderRuntimeControls): Record<string, unknown> {
  return {
    provider: runtime.provider,
    model: runtime.model,
    effort: runtime.effort,
    timeoutMs: runtime.timeoutMs,
    retries: runtime.retries,
    rpm: runtime.rpm,
    concurrency: runtime.concurrency,
    tokenBudget: runtime.tokenBudget,
    excerptBudget: runtime.excerptBudget,
    offline: runtime.offline,
    privacyMode: runtime.privacyMode,
    allowSourceInModel: runtime.allowSourceInModel,
  };
}

function privacyModeFromFlag(value: string | undefined): ProviderRuntimeControls["privacyMode"] | undefined {
  if (value === "local-only" || value === "metadata" || value === "source-ok") {
    return value;
  }
  return undefined;
}

function numberFlag(context: CommandContext, key: string): number | undefined {
  const value = flagString(context.parsed.flags, key);
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function uniqueNormalized(values: string[]): string[] {
  return [...new Set(values.map((value) => value.split(path.sep).join("/")))].sort();
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
    ["features", paths.featuresDir],
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
    ["synthesis", paths.synthesisDir],
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

function revalidationOutcomeToLifecycleState(
  outcome: "unchanged" | "changed" | "fixed" | "stale" | "superseded" | "inconclusive",
): "open" | "fixed" | "stale" | "superseded" | "inconclusive" {
  switch (outcome) {
    case "fixed":
      return "fixed";
    case "stale":
      return "stale";
    case "superseded":
      return "superseded";
    case "inconclusive":
      return "inconclusive";
    case "changed":
    case "unchanged":
      return "open";
  }
}

function revalidationOutcomeToStatus(
  outcome: "unchanged" | "changed" | "fixed" | "stale" | "superseded" | "inconclusive",
  fallback: CandidateRecord["status"],
): CandidateRecord["status"] {
  switch (outcome) {
    case "fixed":
      return "fixed";
    case "stale":
      return "stale";
    case "superseded":
      return "superseded";
    case "inconclusive":
    case "changed":
    case "unchanged":
      return fallback === "fixed" || fallback === "stale" || fallback === "superseded" ? "open" : fallback;
  }
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
