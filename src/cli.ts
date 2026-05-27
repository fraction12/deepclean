#!/usr/bin/env node

import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parseArgs, flagBoolean, flagString, type ParsedArgs } from "./args.js";
import { candidatesFromEvidence, rankCandidates, reassignCandidateIds } from "./candidates.js";
import { buildClusters, unclusteredCandidateIds } from "./clusters.js";
import { discoverSourceFiles, type SourceFile } from "./discovery.js";
import { runEvidenceAdapters } from "./evidence.js";
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
  readLifecycleEvents,
  resolveStatePaths,
  updateLatestCandidates,
  writeCandidates,
  writeCandidateObservations,
  writeCiRun,
  writeClusters,
  writeEvidence,
  writeFindings,
  writeHandoff,
  writeLifecycleEvents,
  writePlan,
  writeReport,
  writeRetentionManifest,
  writeRevalidation,
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
  type RetentionManifestRecord,
  type RevalidationRecord,
} from "./types.js";
import { timestampId } from "./ids.js";
import { synthesizeWithCodex } from "./synthesis.js";
import { inferVerificationProfile } from "./verification.js";

const execFileAsync = promisify(execFile);

const commands = [
  "init",
  "doctor",
  "status",
  "ci",
  "scan",
  "report",
  "next",
  "list",
  "findings",
  "show",
  "history",
  "revalidate",
  "unlock",
  "prune",
  "scrub",
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
    };
    candidates: CandidateRecord[];
    clusters: ClusterRecord[];
    scope: ScanScope;
  };
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

function printHelp(): void {
  console.log(`deepclean: local cleanup reports and agent-ready plans

Usage:
  deepclean <command> [args] [flags]

Commands:
  init                         Create or validate .deepclean state
  doctor                       Check environment, config, state, git, provider, and privacy readiness
  status                       Summarize current project-local Deepclean state
  ci                           Run non-interactive scan and policy gates for CI
  scan                         Collect local evidence and generate candidates
    --synthesize               Run local Codex synthesis over evidence
    --allow-source-in-model    Include source samples in Codex prompt
    --model <model>            Override Codex model for synthesis
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
    staleAfterMs: staleLockMsFromFlags(context),
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
    staleAfterMs: staleLockMsFromFlags(context),
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
    staleAfterMs: staleLockMsFromFlags(context),
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
  const [candidates, clusters, evidence] = await Promise.all([
    readLatestCandidates(context.paths),
    readLatestClusters(context.paths),
    readLatestEvidence(context.paths),
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
    console.log(`Source-safe export: ${output.counts.candidates} candidates, ${output.counts.evidence} evidence references`);
    if (outputPath) {
      console.log(`Export written to ${outputPath}`);
    }
  }
  return 0;
}

async function ciCommand(context: CommandContext): Promise<number> {
  const requireSynthesis = flagBoolean(context.parsed.flags, "require-synthesis");
  if (requireSynthesis && !flagBoolean(context.parsed.flags, "synthesize")) {
    const diagnostic: Diagnostic = {
      level: "error",
      code: "ci_synthesis_required",
      message: "CI policy requires synthesis; rerun with --synthesize and a configured provider.",
    };
    emit(context.json, fail("ci", "ci_synthesis_required", diagnostic.message, [diagnostic]));
    return 2;
  }

  const scan = await executeScan(context, { synthesize: flagBoolean(context.parsed.flags, "synthesize") });
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
  const startedAt = new Date().toISOString();
  const runId = timestampId("run");
  const config = await ensureState(context.paths);
  const verificationProfile = await inferVerificationProfile(context.paths.root);
  const discoveredFiles = await discoverSourceFiles(context.paths.root, config.exclude);
  const scope = await resolveScanScope(context, discoveredFiles);
  const files = discoveredFiles.filter((file) => fileInScope(file, scope));
  const adapterResult = await runEvidenceAdapters(config.enabledAdapters, {
    root: context.paths.root,
    runId,
    createdAt: startedAt,
    files,
    config,
  });
  const evidence = markDirtyTreeEvidence(adapterResult.evidence, scope);
  const completedAt = new Date().toISOString();
  const localCandidates = candidatesFromEvidence(
    runId,
    evidence,
    completedAt,
    config.candidateCaps,
    verificationProfile,
  );
  const synthesisRequested = options.synthesize ?? (
    flagBoolean(context.parsed.flags, "synthesize")
    || config.reviewSynthesis.enabled
  );
  const synthesisResult = synthesisRequested
    ? await synthesizeWithCodex({
      root: context.paths.root,
      runId,
      createdAt: completedAt,
      evidence,
      config,
      existingCandidates: localCandidates,
      includeSource: flagBoolean(context.parsed.flags, "allow-source-in-model")
        || config.privacy.allowSourceInModel,
      model: flagString(context.parsed.flags, "model"),
      verificationProfile,
    })
    : { candidates: [], diagnostics: [] };
  const diagnostics = [...adapterResult.diagnostics, ...synthesisResult.diagnostics];
  const rankedCandidates = reassignCandidateIds(rankCandidates([
    ...localCandidates,
    ...synthesisResult.candidates,
  ]));
  const identity = attachStableIdentity({
    runId,
    candidates: rankedCandidates,
    evidence,
    existingFindings: await readFindings(context.paths),
    observedAt: completedAt,
  });
  const candidates = filterCandidatesByScanScope(identity.candidates, scope);
  const clusters = buildClusters(runId, candidates, evidence, completedAt, config.clusters);

  await writeEvidence(context.paths, runId, evidence);
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
    evidenceCount: evidence.length,
    candidateCount: candidates.length,
    clusterCount: clusters.length,
    synthesis: {
      requested: synthesisRequested,
      provider: synthesisRequested ? "codex" : undefined,
      candidateCount: synthesisResult.candidates.length,
    },
    scope,
    diagnostics,
  });

  const data = {
    runId,
    root: context.paths.root,
    sourceFileCount: files.length,
    evidenceCount: evidence.length,
    candidateCount: candidates.length,
    clusterCount: clusters.length,
    synthesis: {
      requested: synthesisRequested,
      candidateCount: synthesisResult.candidates.length,
    },
    candidates,
    clusters,
    scope,
  };

  return { runId, diagnostics, data };
}

async function reportCommand(context: CommandContext): Promise<number> {
  const { candidates, evidence, runId } = await latestState(context.paths);
  const config = await ensureState(context.paths);
  const latestClusters = await readLatestClusters(context.paths);
  const filter = queryFilterFromFlags(context);
  const filtered = filterCandidatesForQuery(candidates, latestClusters, filter);
  const ranked = rankCandidates(filtered);
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
    filters: filter,
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
  const [candidates, clusters] = await Promise.all([
    readLatestCandidates(context.paths),
    readLatestClusters(context.paths),
  ]);
  const filtered = filterCandidatesForQuery(candidates, clusters, queryFilterFromFlags(context));
  const ranked = rankCandidates(filtered);
  const candidate = ranked.find((item) => item.status === "open");
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

async function listCommand(context: CommandContext): Promise<number> {
  const [candidates, clusters] = await Promise.all([
    readLatestCandidates(context.paths),
    readLatestClusters(context.paths),
  ]);
  const filter = queryFilterFromFlags(context);
  const filtered = rankCandidates(filterCandidatesForQuery(candidates, clusters, filter));
  const format = flagString(context.parsed.flags, "format");
  const queue = format === "codex" ? filtered.map(candidateQueueItem) : undefined;
  emit(context.json, ok("list", {
    filters: filter,
    count: filtered.length,
    candidates: filtered,
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
  const { candidates, evidence } = await latestState(context.paths);
  const candidate = candidates.find((item) => item.id === id);
  if (!candidate) {
    emit(context.json, fail("handoff", "candidate_not_found", `Candidate not found: ${id}`));
    return 1;
  }
  const supportingEvidence = evidenceForIds(evidence, candidate.evidenceIds);
  const handoff = buildHandoff(candidate, supportingEvidence, format);
  const handoffPath = await writeHandoff(context.paths, handoff);
  const warnings = handoffFreshnessWarnings(candidate);

  emit(context.json, ok("handoff", { handoff, path: handoffPath, warnings }));
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
  return withStateWriteLock(context.paths, {
    command: context.parsed.command ?? "unknown",
    wait: flagBoolean(context.parsed.flags, "wait-lock"),
    timeoutMs: numberFlag(context, "lock-timeout-ms") ?? 0,
    staleAfterMs: staleLockMsFromFlags(context),
  }, fn);
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
  const pathMatched = scope.paths.length === 0
    || scope.paths.some((prefix) => file.path === prefix || file.path.startsWith(`${prefix.replace(/\/$/, "")}/`));
  if (!pathMatched) {
    return false;
  }
  if (scope.changedPaths.length === 0) {
    return true;
  }
  return scope.changedPaths.includes(file.path);
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
    [context.paths.evidenceDir, "json"],
    [context.paths.candidatesDir, "json"],
    [context.paths.clustersDir, "json"],
    [context.paths.observationsDir, "json"],
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
  return path.relative(paths.root, filePath).split(path.sep).join("/");
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

function staleLockMsFromFlags(context: CommandContext): number | undefined {
  return numberFlag(context, "stale-lock-ms");
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
