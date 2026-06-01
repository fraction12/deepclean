#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parseArgs, flagBoolean, flagString, flagStrings, type ParsedArgs } from "./args.js";
import { buildAnalyzerSetupPlan } from "./analyzer-setup.js";
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
import {
  applyFixAttemptExecutionGuards,
  classifyFixOutcome,
  enforceFixAttemptRetryLimit,
  fixReadinessBlocker,
  hasRevalidationProgress,
  shouldRetryFixAttempt,
} from "./fix-workflow-policy.js";
import { attachStableIdentity } from "./identity.js";
import { asRecord, fail, ok } from "./json.js";
import { buildJsonContractCatalog } from "./json-contracts.js";
import {
  LockContentionError,
  lockRecoveryCommand,
  readLockStatuses,
  recoverStaleLocks,
  withStateWriteLock,
} from "./locks.js";
import { buildCandidatePlan, buildClusterPlan, buildOpportunityPlan } from "./plans.js";
import { buildPrOpportunities } from "./opportunities.js";
import { classifyRevalidation, verificationRunIdsForFinding } from "./revalidation.js";
import {
  buildHandoff,
  buildOpportunityHandoff,
  buildReportRecord,
  renderMarkdownReport,
  renderMarkdownReportWithClusters,
} from "./reporting.js";
import { buildProgressSummary, renderProgressSummary } from "./progress.js";
import {
  adHocQualityProfile,
  builtInQualityProfile,
  evaluateQualityProfile,
  type BuiltInQualityProfileId,
  type ReviewPrQualityInput,
} from "./quality-gates.js";
import { buildReviewPrContext, type ReviewPrTarget } from "./review-pr.js";
import {
  ensureState,
  latestRunId,
  readAllPrOpportunities,
  readConfig,
  readCandidateObservations,
  readCandidates,
  readClusters,
  readEvidence,
  readFeatures,
  readFindings,
  readFixAttempts,
  readHandoffs,
  readLatestPrOpportunities,
  readLatestCandidates,
  readLatestClusters,
  readLatestEvidence,
  readLatestFeatures,
  readLatestSynthesisAttempt,
  readLifecycleEvents,
  readPlans,
  readReports,
  readRevalidations,
  readRuns,
  resolveStatePaths,
  updateLatestCandidates,
  writeCandidates,
  writeCandidateObservations,
  writeCampaignSummary,
  writeCiRun,
  writeClusters,
  writeEvidence,
  writeFeatures,
  writeFindings,
  writeFixAttempt,
  writeHandoff,
  writeIdentityMatches,
  writeLifecycleEvents,
  writePlan,
  writePrOpportunities,
  writeQualityGateResult,
  writeQualityProfile,
  writeAnalyzerSetupPlan,
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
  type CampaignSummaryRecord,
  type ClusterRecord,
  type DeepcleanConfig,
  type Diagnostic,
  type EvidenceRecord,
  type FeatureRecord,
  type FindingRecord,
  type FixAttemptRecord,
  type HandoffRecord,
  type LifecycleEventRecord,
  type PlanRecord,
  type PrOpportunityRecord,
  type QualityGateResultRecord,
  type ReportRecord,
  type RetentionManifestRecord,
  type RevalidationRecord,
  type RunRecord,
  type SynthesisAttemptRecord,
} from "./types.js";
import { timestampId } from "./ids.js";
import { collectProcessOutput } from "./process-output.js";
import { synthesizeWithChunkedCodex } from "./synthesis.js";
import { inferVerificationProfile } from "./verification.js";

const execFileAsync = promisify(execFile);

const commands = [
  "init",
  "doctor",
  "status",
  "ci",
  "map",
  "scan",
  "review-pr",
  "report",
  "next",
  "campaign",
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
  "schemas",
  "setup",
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

interface PackageUpdateStatus {
  packageName: string;
  channel: string;
  currentVersion: string;
  latestVersion?: string | undefined;
  stale: boolean;
  checked: boolean;
  skippedReason?: string | undefined;
  error?: string | undefined;
  updateCommand: string;
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

interface RevalidationPreparation {
  target: string;
  resolvedTarget: Awaited<ReturnType<typeof resolveRevalidationTargets>>;
  scan: ScanExecutionResult;
  afterFindings: FindingRecord[];
  records: RevalidationRecord[];
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
    --no-update-check          Skip npm release-channel freshness check
    --update-channel <tag>     npm dist-tag to check for updates; default latest
  status                       Read-only lifecycle summary for current Deepclean state
    --progress-events <n>      Recent lifecycle/fix artifacts used for progress summary; default 200
                               --json includes latest artifacts, active/blocked work,
                               stale artifacts, recent progress, and next action
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
  review-pr                    Emit source-safe PR context for review agents
    --base <ref>               Base ref for PR diff, default origin/main
    --head <ref>               Head ref for PR diff, default HEAD
    --target <id>              Candidate, finding, or opportunity ID to judge the PR against
    --output <file>            Also write the JSON context to a file
  report                       Write and print a ranked report
  next                         Show the highest-priority open candidate
  campaign                     Summarize current cleanup campaign opportunities
  list                         List findings with shared filters
  findings                     Alias for list
  show <candidate-or-theme>    Show one candidate or cleanup theme with evidence
    --run <run-id>             Resolve historical candidate observations by run
  explain <candidate-or-finding>
                               Explain evidence, validation, and fix-readiness for a finding
  history <finding-or-candidate-id>
                               Show lifecycle history for a finding
    --run <run-id>             Resolve historical candidate ID from a specific run
  revalidate <finding-id|candidate-id|all>
                               Freshly recheck whether findings still hold
  unlock --stale               Remove stale project-local writer locks
  prune                       Remove stale Deepclean artifacts with retention safety
    --dry-run                  Persist a manifest without deleting files
    --keep-runs <n>            Keep latest n runs, defaults to 5
    --keep-days <n>            Also keep runs newer than n days
  scrub                        Emit source-safe generated-state export
  fix <finding-or-candidate>   Preview or apply a guarded local patch
    --mode guarded             Stable GA autofix lane; other modes are refused
    --patch <file>             Patch file to preview/apply
    --dry-run                  Persist preview without changing source
    --apply                    Apply the patch locally
    --allow-dirty              Allow dirty files inside target scope
    --branch <name>            Create or switch to a local branch before applying
    --verification <c>         Required verification command for --apply
    --verification-command <c> Alias for --verification
    --allow-files <glob>       Explicitly allow additional changed files
    --pr                       With --branch, prepare/push/open a PR after proof passes
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
  schemas                      Emit stable machine-consumer JSON contracts
  setup analyzers              Dry-run analyzer setup recommendations

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
  --version                    Show version

Examples:
  deepclean doctor
  deepclean scan
  deepclean status
  deepclean report
  deepclean review-pr --base origin/main --head HEAD --json --state-dir .octocheck/deepclean
  deepclean next --json
  deepclean campaign --json
  deepclean show <candidate-id>
  deepclean plan <candidate-id>
  deepclean handoff <candidate-id> --format codex
  deepclean revalidate <candidate-id>
  deepclean fix <candidate-id> --mode guarded --patch ./fix.patch --dry-run --json`);
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
      case "review-pr":
        return await withWriteLock(context, () => reviewPrCommand(context));
      case "report":
        return await withWriteLock(context, () => reportCommand(context));
      case "next":
        return await withWriteLock(context, () => nextCommand(context));
      case "campaign":
        return await campaignCommand(context);
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
      case "schemas":
        return schemasCommand(context);
      case "setup":
        return await withWriteLock(context, () => setupCommand(context));
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

function packageUpdateDiagnostics(packageUpdate: PackageUpdateStatus): Diagnostic[] {
  if (packageUpdate.stale && packageUpdate.latestVersion) {
    return [{
      level: "warning",
      code: "package_update_available",
      message: `Deepclean ${packageUpdate.latestVersion} is available on npm ${packageUpdate.channel}. Update with \`${packageUpdate.updateCommand}\`.`,
    }];
  }
  if (packageUpdate.skippedReason) {
    return [{
      level: "info",
      code: "package_update_check_skipped",
      message: `Package update check skipped: ${packageUpdate.skippedReason}.`,
    }];
  }
  if (packageUpdate.error) {
    return [{
      level: "warning",
      code: "package_update_check_failed",
      message: `Package update check failed: ${packageUpdate.error}`,
    }];
  }
  return [];
}

async function doctorCommand(context: CommandContext): Promise<number> {
  const diagnostics: Diagnostic[] = [];
  const currentPackageVersion = await packageVersion();
  const packageUpdate = await packageUpdateStatus(context, currentPackageVersion);
  diagnostics.push(...packageUpdateDiagnostics(packageUpdate));
  const initialized = await pathExists(context.paths.stateDir);
  const missingDirs = initialized ? await missingStateDirectories(context.paths) : [];
  const integrity = initialized ? await stateIntegrity(context.paths) : { valid: true, diagnostics: [] };
  diagnostics.push(...integrity.diagnostics);
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
    packageVersion: currentPackageVersion,
    packageUpdate,
    config: {
      path: context.paths.configPath,
      valid: configResult.valid,
      error: configResult.error,
    },
    state: {
      valid: initialized && missingDirs.length === 0 && integrity.valid,
      missingDirs,
      integrity,
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
    if (packageUpdate.stale && packageUpdate.latestVersion) {
      console.log(`update: ${packageUpdate.latestVersion} available (${packageUpdate.updateCommand})`);
    } else if (packageUpdate.checked) {
      console.log(`update: current on ${packageUpdate.channel}`);
    } else if (packageUpdate.skippedReason) {
      console.log(`update: skipped (${packageUpdate.skippedReason})`);
    } else {
      console.log("update: unavailable");
    }
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
  const {
    diagnostics,
    initialized,
    integrity,
    latest,
    candidates,
    clusters,
    evidence,
    features,
    records,
  } = await readStatusInputs(context.paths);
  const {
    git,
    artifactCounts,
    locks,
    progress,
    statusCounts,
    lifecycleCounts,
    latestRun,
    latestReport,
    staleArtifacts,
    blockers,
    activeItems,
    recentProgress,
    latestArtifacts,
    nextAction,
  } = await buildStatusDerivedState(context, {
    diagnostics,
    initialized,
    latest,
    candidates,
    records,
  });
  if (!initialized) {
    diagnostics.push({
      level: "info",
      code: "no_state",
      message: "Deepclean state has not been initialized.",
    });
  } else if (!latest) {
    diagnostics.push({
      level: "warning",
      code: "no_runs",
      message: "No Deepclean scan run exists yet.",
    });
  }
  if (latest && !records.reports.some((report) => report.runId === latest)) {
    diagnostics.push({
      level: "warning",
      code: "missing_latest_artifacts",
      message: `No report artifact exists for latest run ${latest}.`,
    });
  }
  if (locks.some((lock) => lock.stale)) {
    diagnostics.push({
      level: "warning",
      code: "stale_lock",
      message: "A stale Deepclean writer lock is present.",
    });
  }
  if (staleArtifacts.length > 0 || candidates.some((candidate) => candidate.lifecycleState === "stale" || candidate.status === "stale")) {
    diagnostics.push({
      level: "warning",
      code: "stale_state",
      message: "One or more findings or generated artifacts need revalidation or regeneration.",
    });
  }
  const data = buildStatusData(context.paths, {
    initialized,
    integrity,
    latest,
    candidates,
    clusters,
    evidence,
    features,
    records,
  }, {
    git,
    artifactCounts,
    locks,
    progress,
    statusCounts,
    lifecycleCounts,
    latestRun,
    latestReport,
    staleArtifacts,
    blockers,
    activeItems,
    recentProgress,
    latestArtifacts,
    nextAction,
  });

  emit(context.json, ok("status", data, diagnostics));
  if (!context.json && !context.quiet) {
    renderStatusText(context, data, {
      initialized,
      latest,
      git,
      latestReport,
      activeItems,
      blockers,
      staleArtifacts,
      recentProgress,
      nextAction,
      progress,
    });
    printDiagnostics(diagnostics);
  }
  return 0;
}

interface StatusRecordInputs {
  runs: RunRecord[];
  reports: ReportRecord[];
  plans: PlanRecord[];
  handoffs: HandoffRecord[];
  lifecycleEvents: LifecycleEventRecord[];
  revalidations: RevalidationRecord[];
  fixAttempts: FixAttemptRecord[];
}

interface StatusInputs {
  diagnostics: Diagnostic[];
  initialized: boolean;
  integrity: StatusIntegrity;
  latest: string | undefined;
  candidates: CandidateRecord[];
  clusters: ClusterRecord[];
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
  records: StatusRecordInputs;
}

type StatusIntegrity = StateIntegritySummary | { valid: boolean; diagnostics: Diagnostic[] };

interface StatusDerivedState {
  git: Awaited<ReturnType<typeof gitDoctor>>;
  artifactCounts: Awaited<ReturnType<typeof stateArtifactCounts>>;
  locks: Awaited<ReturnType<typeof readLockStatuses>>;
  progress: Awaited<ReturnType<typeof buildProgressSummary>> | undefined;
  statusCounts: Record<string, number>;
  lifecycleCounts: Record<string, number>;
  latestRun: RunRecord | undefined;
  latestReport: ReportRecord | undefined;
  staleArtifacts: StatusStaleArtifact[];
  blockers: StatusBlockedItem[];
  activeItems: StatusCandidateItem[];
  recentProgress: StatusProgressEvent[];
  latestArtifacts: ReturnType<typeof buildLatestArtifactIndex>;
  nextAction: ReturnType<typeof chooseStatusNextAction>;
}

interface StatusCandidateItem {
  id: string;
  findingId?: string;
  title: string;
  priority: CandidateRecord["priority"];
  status: CandidateRecord["status"];
  lifecycleState?: CandidateRecord["lifecycleState"];
  featureIds: string[];
  nextCommand: string;
}

interface StatusBlockedItem extends StatusCandidateItem {
  reason: string;
  latestAttemptId?: string;
  attempts?: number;
}

interface StatusStaleArtifact {
  type: "report" | "plan" | "handoff" | "fix-attempt";
  id: string;
  path: string;
  targetId?: string;
  findingId?: string;
  createdAt: string;
  reason: string;
  recommendation: string;
}

interface StatusProgressEvent {
  type: "run" | "report" | "plan" | "handoff" | "split" | "lifecycle" | "revalidation" | "fix-attempt";
  id: string;
  kind: string;
  timestamp: string;
  path?: string;
  targetId?: string;
  findingId?: string;
  candidateId?: string;
  outcome?: string;
}

function renderStatusText(
  context: CommandContext,
  data: ReturnType<typeof buildStatusData>,
  state: Pick<StatusInputs, "initialized" | "latest"> & Pick<
    StatusDerivedState,
    "git" | "latestReport" | "activeItems" | "blockers" | "staleArtifacts" | "recentProgress" | "nextAction" | "progress"
  >,
): void {
  const {
    initialized,
    latest,
    git,
    latestReport,
    activeItems,
    blockers,
    staleArtifacts,
    recentProgress,
    nextAction,
    progress,
  } = state;

  console.log(`root: ${data.root}`);
  console.log(`state: ${initialized ? "initialized" : "not initialized"}`);
  console.log(`latest run: ${latest ?? "none"}`);
  console.log(`latest report: ${latestReport ? path.relative(context.paths.root, reportJsonPath(context.paths, latestReport)) : "none"}`);
  console.log(`queue: ${data.queue.active} active / ${data.queue.blocked} blocked / ${data.queue.open} open / ${data.queue.total} total`);
  console.log(`git: ${git.available ? git.dirty ? "dirty" : "clean" : "unavailable"}`);
  console.log(`locks: ${data.locks.active} active / ${data.locks.stale} stale`);
  if (activeItems.length > 0) {
    console.log("active:");
    for (const item of activeItems.slice(0, 5)) {
      console.log(`  ${item.id} ${item.priority} ${item.title}`);
    }
  }
  if (blockers.length > 0) {
    console.log("blocked:");
    for (const item of blockers.slice(0, 5)) {
      console.log(`  ${item.id}: ${item.reason}`);
    }
  }
  if (staleArtifacts.length > 0) {
    console.log("stale artifacts:");
    for (const item of staleArtifacts.slice(0, 5)) {
      console.log(`  ${item.type} ${item.id}: ${item.reason}`);
    }
  }
  if (recentProgress.length > 0) {
    console.log("recent progress:");
    for (const item of recentProgress.slice(0, 5)) {
      console.log(`  ${item.timestamp} ${item.kind} ${item.id}`);
    }
  }
  console.log(`next: ${nextAction.command}`);
  if (progress) {
    for (const line of renderProgressSummary(progress)) {
      console.log(line);
    }
  }
}

function buildStatusData(
  paths: StatePaths,
  inputs: Pick<StatusInputs, "initialized" | "integrity" | "latest" | "candidates" | "clusters" | "evidence" | "features" | "records">,
  derived: StatusDerivedState,
) {
  const { initialized, integrity, latest, candidates, clusters, evidence, features, records } = inputs;
  const {
    git,
    artifactCounts,
    locks,
    progress,
    statusCounts,
    lifecycleCounts,
    latestRun,
    latestReport,
    staleArtifacts,
    blockers,
    activeItems,
    recentProgress,
    latestArtifacts,
    nextAction,
  } = derived;

  return {
    root: paths.root,
    stateDir: paths.stateDir,
    initialized,
    latestRunId: latest,
    latestRun: latestRun ? runStatusPayload(paths, latestRun) : undefined,
    latestReport: latestReport ? reportStatusPayload(paths, latestReport) : undefined,
    git: {
      branch: git.branch,
      dirty: git.dirty,
      available: git.available,
    },
    queue: {
      total: candidates.length,
      open: candidates.filter((candidate) => candidate.status === "open").length,
      active: activeItems.length,
      blocked: blockers.length,
      stale: candidates.filter((candidate) => candidate.lifecycleState === "stale" || candidate.status === "stale").length,
      fixed: candidates.filter((candidate) => candidate.lifecycleState === "fixed" || candidate.lifecycleState === "resolved" || candidate.status === "fixed").length,
      suppressed: candidates.filter((candidate) => candidate.lifecycleState === "suppressed" || candidate.status === "ignored" || candidate.status === "false-positive").length,
      byStatus: statusCounts,
      byLifecycleState: lifecycleCounts,
      themes: clusters.length,
      evidence: evidence.length,
      features: features.length,
    },
    activeItems,
    blockedItems: blockers,
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
    pendingRevalidation: candidates.filter((candidate) => candidate.lifecycleState === "stale" || candidate.status === "stale").length,
    proof: buildProofSummary(candidates, records.revalidations, records.fixAttempts),
    artifacts: artifactCounts,
    stateIntegrity: integrity,
    latestArtifacts,
    staleArtifacts,
    recentProgress,
    nextAction,
    progress,
  };
}

function emptyStatusRecordInputs(): StatusRecordInputs {
  return {
    runs: [],
    reports: [],
    plans: [],
    handoffs: [],
    lifecycleEvents: [],
    revalidations: [],
    fixAttempts: [],
  };
}

async function readStatusInputs(paths: StatePaths): Promise<StatusInputs> {
  const diagnostics: Diagnostic[] = [];
  const initialized = await pathExists(paths.stateDir);
  const integrity = initialized ? await stateIntegrity(paths) : { valid: true, diagnostics: [] };
  diagnostics.push(...integrity.diagnostics);
  const latest = initialized ? await latestRunId(paths) : undefined;
  const candidates = latest ? await safeReadState("latest candidates", readLatestCandidates(paths), diagnostics) : [];
  const clusters = latest ? await safeReadState("latest clusters", readLatestClusters(paths), diagnostics) : [];
  const evidence = latest ? await safeReadState("latest evidence", readLatestEvidence(paths), diagnostics) : [];
  const features = initialized ? await safeReadState("latest features", readLatestFeatures(paths), diagnostics) : [];
  let records: StatusRecordInputs = emptyStatusRecordInputs();
  if (initialized) {
    try {
      const [runs, reports, plans, handoffs, lifecycleEvents, revalidations, fixAttempts] = await Promise.all([
        readRuns(paths),
        readReports(paths),
        readPlans(paths),
        readHandoffs(paths),
        readLifecycleEvents(paths),
        readRevalidations(paths),
        readFixAttempts(paths),
      ]);
      records = { runs, reports, plans, handoffs, lifecycleEvents, revalidations, fixAttempts };
    } catch (error) {
      diagnostics.push({
        level: "error",
        code: "invalid_state",
        message: `Deepclean status could not parse one or more state records: ${errorMessage(error)}`,
      });
    }
  }

  return {
    diagnostics,
    initialized,
    integrity,
    latest,
    candidates,
    clusters,
    evidence,
    features,
    records,
  };
}

async function buildStatusDerivedState(
  context: CommandContext,
  inputs: Pick<StatusInputs, "diagnostics" | "initialized" | "latest" | "candidates" | "records">,
): Promise<StatusDerivedState> {
  const { diagnostics, initialized, latest, candidates, records } = inputs;
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
  const progressEventLimit = numberFlag(context, "progress-events");
  const progress = initialized
    ? await buildProgressSummary(context.paths, progressEventLimit === undefined ? {} : { eventLimit: progressEventLimit })
    : undefined;
  const statusCounts = countBy(candidates, (candidate) => candidate.status);
  const lifecycleCounts = countBy(candidates, (candidate) => candidate.lifecycleState ?? "unknown");
  const latestRun = records.runs.find((run) => run.id === latest) ?? records.runs.at(-1);
  const latestReport = latest
    ? records.reports.filter((report) => report.runId === latest).at(-1) ?? records.reports.at(-1)
    : records.reports.at(-1);
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const candidateByFindingId = new Map(candidates.flatMap((candidate) => (
    candidate.findingId ? [[candidate.findingId, candidate] as const] : []
  )));
  const latestRevalidationByFinding = latestRevalidationsByFinding(records.revalidations);
  const staleArtifacts = buildStaleArtifacts({
    paths: context.paths,
    latestRunId: latest,
    latestReport,
    candidates,
    candidateById,
    candidateByFindingId,
    latestRevalidationByFinding,
    reports: records.reports,
    plans: records.plans,
    handoffs: records.handoffs,
    fixAttempts: records.fixAttempts,
  });
  const blockers = buildBlockedItems({
    candidates,
    fixAttempts: records.fixAttempts,
  });
  const activeItems = buildActiveStatusItems(candidates, new Set(blockers.map((item) => item.id))).slice(0, 10);
  const recentProgress = buildRecentProgressEvents(context.paths, records, candidates, progressEventLimit ?? 20);
  const latestArtifacts = buildLatestArtifactIndex(context.paths, {
    latestRun,
    latestReport,
    candidates,
    plans: records.plans,
    handoffs: records.handoffs,
    revalidations: records.revalidations,
    fixAttempts: records.fixAttempts,
    lifecycleEvents: records.lifecycleEvents,
  });
  const nextAction = chooseStatusNextAction({
    initialized,
    latestRunId: latest,
    locks,
    staleArtifacts,
    activeItems,
    blockers,
    pendingRevalidation: candidates.filter((candidate) => candidate.lifecycleState === "stale" || candidate.status === "stale").length,
    latestReport,
  });

  return {
    git,
    artifactCounts,
    locks,
    progress,
    statusCounts,
    lifecycleCounts,
    latestRun,
    latestReport,
    staleArtifacts,
    blockers,
    activeItems,
    recentProgress,
    latestArtifacts,
    nextAction,
  };
}

function runStatusPayload(paths: StatePaths, run: RunRecord): {
  id: string;
  path: string;
  completedAt: string;
  candidateCount: number;
  evidenceCount: number;
  featureCount?: number;
  clusterCount?: number;
} {
  return {
    id: run.id,
    path: path.join(paths.runsDir, `${run.id}.json`),
    completedAt: run.completedAt,
    candidateCount: run.candidateCount,
    evidenceCount: run.evidenceCount,
    ...(run.featureCount === undefined ? {} : { featureCount: run.featureCount }),
    ...(run.clusterCount === undefined ? {} : { clusterCount: run.clusterCount }),
  };
}

function reportStatusPayload(paths: StatePaths, report: ReportRecord): {
  id: string;
  runId: string;
  createdAt: string;
  path: string;
  jsonPath: string;
  markdownPath: string;
} {
  const jsonPath = reportJsonPath(paths, report);
  return {
    id: report.id,
    runId: report.runId,
    createdAt: report.createdAt,
    path: jsonPath,
    jsonPath,
    markdownPath: path.join(paths.reportsDir, `${report.id}.md`),
  };
}

function latestRevalidationsByFinding(records: RevalidationRecord[]): Map<string, RevalidationRecord> {
  const byFinding = new Map<string, RevalidationRecord>();
  for (const record of records) {
    if (record.targetType === "finding" && record.targetId) {
      byFinding.set(record.targetId, record);
    }
  }
  return byFinding;
}

function buildActiveStatusItems(candidates: CandidateRecord[], blockedIds: Set<string>): StatusCandidateItem[] {
  return rankCandidates(candidates)
    .filter((candidate) => defaultQueueCandidate(candidate) && !blockedIds.has(candidate.id))
    .map((candidate) => statusCandidatePayload(candidate));
}

function buildBlockedItems(options: {
  candidates: CandidateRecord[];
  fixAttempts: FixAttemptRecord[];
}): StatusBlockedItem[] {
  const blocked = new Map<string, StatusBlockedItem>();
  for (const candidate of options.candidates) {
    const reason = candidateBlockerReason(candidate);
    if (reason) {
      blocked.set(candidate.id, { ...statusCandidatePayload(candidate), reason });
    }
  }

  const attemptsByTarget = new Map<string, FixAttemptRecord[]>();
  for (const attempt of options.fixAttempts) {
    const key = attempt.candidateId ?? attempt.findingId;
    attemptsByTarget.set(key, [...(attemptsByTarget.get(key) ?? []), attempt]);
  }
  for (const [targetId, attempts] of attemptsByTarget) {
    const latest = attempts.at(-1);
    if (!latest) {
      continue;
    }
    const unresolved = latest.outcome === "still-open" || latest.outcome === "partially-resolved" || latest.outcome === "needs_human";
    const failedVerification = latest.verificationResults.some((result) => !result.passed);
    const exhausted = Boolean(latest.maxAttempts && latest.attemptNumber && latest.attemptNumber >= latest.maxAttempts);
    if (!unresolved && !failedVerification) {
      continue;
    }
    const candidate = options.candidates.find((item) => item.id === latest.candidateId || item.findingId === latest.findingId);
    if (!candidate) {
      continue;
    }
    const reason = failedVerification
      ? "latest fix attempt failed verification"
      : exhausted
        ? "fix attempts exhausted without resolution"
        : "latest fix attempt did not resolve the finding";
    blocked.set(candidate.id, {
      ...statusCandidatePayload(candidate),
      reason,
      latestAttemptId: latest.id,
      attempts: attempts.length,
    });
  }

  return [...blocked.values()].sort((a, b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id));
}

function candidateBlockerReason(candidate: CandidateRecord): string | undefined {
  const lifecycleState = candidate.lifecycleState;
  if (candidate.status === "stale" || lifecycleState === "stale") {
    return "revalidation required before handoff or fix work";
  }
  if (lifecycleState === "design-needed") {
    return "design needed before an agent-ready handoff";
  }
  if (lifecycleState === "needs-human" || lifecycleState === "inconclusive") {
    return "human decision needed before work can continue";
  }
  return undefined;
}

function defaultQueueCandidate(candidate: CandidateRecord): boolean {
  if (candidate.status !== "open") {
    return false;
  }
  const inactive = new Set([
    "design-needed",
    "fixed",
    "inconclusive",
    "needs-human",
    "resolved",
    "split",
    "stale",
    "superseded",
    "suppressed",
  ]);
  return !inactive.has(candidate.lifecycleState ?? "ready");
}

function statusCandidatePayload(candidate: CandidateRecord): StatusCandidateItem {
  return {
    id: candidate.id,
    ...(candidate.findingId ? { findingId: candidate.findingId } : {}),
    title: candidate.title,
    priority: candidate.priority,
    status: candidate.status,
    ...(candidate.lifecycleState ? { lifecycleState: candidate.lifecycleState } : {}),
    featureIds: candidate.affectedFeatureIds,
    nextCommand: `deepclean plan ${candidate.id}`,
  };
}

function buildStaleArtifacts(options: {
  paths: StatePaths;
  latestRunId?: string | undefined;
  latestReport?: ReportRecord | undefined;
  candidates: CandidateRecord[];
  candidateById: Map<string, CandidateRecord>;
  candidateByFindingId: Map<string, CandidateRecord>;
  latestRevalidationByFinding: Map<string, RevalidationRecord>;
  reports: ReportRecord[];
  plans: PlanRecord[];
  handoffs: HandoffRecord[];
  fixAttempts: FixAttemptRecord[];
}): StatusStaleArtifact[] {
  const artifacts: StatusStaleArtifact[] = [];
  if (options.latestReport && options.latestRunId && options.latestReport.runId !== options.latestRunId) {
    artifacts.push({
      type: "report",
      id: options.latestReport.id,
      path: reportJsonPath(options.paths, options.latestReport),
      targetId: options.latestReport.runId,
      createdAt: options.latestReport.createdAt,
      reason: `latest report was generated for ${options.latestReport.runId}, not latest run ${options.latestRunId}`,
      recommendation: "Run deepclean report.",
    });
  }
  if (options.latestRunId && !options.reports.some((report) => report.runId === options.latestRunId)) {
    artifacts.push({
      type: "report",
      id: "missing",
      path: options.paths.reportsDir,
      targetId: options.latestRunId,
      createdAt: new Date(0).toISOString(),
      reason: `no report exists for latest run ${options.latestRunId}`,
      recommendation: "Run deepclean report.",
    });
  }

  for (const plan of options.plans) {
    const candidate = plan.targetType === "candidate" ? options.candidateById.get(plan.targetId) : undefined;
    const reason = planStaleReason(plan, candidate, options.latestRunId, options.latestRevalidationByFinding);
    if (reason) {
      artifacts.push({
        type: "plan",
        id: plan.id,
        path: path.join(options.paths.plansDir, `${plan.id}.json`),
        targetId: plan.targetId,
        ...(candidate?.findingId ? { findingId: candidate.findingId } : {}),
        createdAt: plan.createdAt,
        reason,
        recommendation: candidate ? `Run deepclean plan ${candidate.id}.` : "Regenerate the plan from the current status queue.",
      });
    }
  }

  for (const handoff of options.handoffs) {
    const candidate = handoff.candidateId ? options.candidateById.get(handoff.candidateId) : undefined;
    const reason = handoffStaleReason(handoff, candidate, options.latestRevalidationByFinding);
    if (reason) {
      artifacts.push({
        type: "handoff",
        id: handoff.id,
        path: path.join(options.paths.handoffsDir, `${handoff.id}.json`),
        targetId: handoff.targetId ?? handoff.candidateId ?? handoff.id,
        ...(candidate?.findingId ? { findingId: candidate.findingId } : {}),
        createdAt: handoff.createdAt,
        reason,
        recommendation: candidate ? `Run deepclean handoff ${candidate.id}.` : "Regenerate a handoff from a current candidate.",
      });
    }
  }

  for (const attempt of options.fixAttempts) {
    const candidate = attempt.candidateId ? options.candidateById.get(attempt.candidateId) : options.candidateByFindingId.get(attempt.findingId);
    const latestRevalidation = options.latestRevalidationByFinding.get(attempt.findingId);
    if (latestRevalidation && latestRevalidation.createdAt > attempt.createdAt) {
      artifacts.push({
        type: "fix-attempt",
        id: attempt.id,
        path: path.join(options.paths.fixesDir, `${attempt.id}.json`),
        targetId: attempt.candidateId ?? attempt.findingId,
        findingId: attempt.findingId,
        createdAt: attempt.createdAt,
        reason: `fix attempt predates latest revalidation ${latestRevalidation.id}`,
        recommendation: candidate ? `Inspect deepclean show ${candidate.id} before retrying.` : "Inspect the latest finding state before retrying.",
      });
    }
  }

  return artifacts.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

function planStaleReason(
  plan: PlanRecord,
  candidate: CandidateRecord | undefined,
  latestRunId: string | undefined,
  latestRevalidationByFinding: Map<string, RevalidationRecord>,
): string | undefined {
  if (latestRunId && plan.runId !== latestRunId) {
    return `plan was generated for ${plan.runId}, not latest run ${latestRunId}`;
  }
  if (plan.targetType === "cluster") {
    return undefined;
  }
  if (!candidate) {
    return "target candidate is no longer present in the latest run";
  }
  const blocker = candidateBlockerReason(candidate);
  if (blocker) {
    return `target candidate is not ready: ${blocker}`;
  }
  const latestRevalidation = candidate.findingId ? latestRevalidationByFinding.get(candidate.findingId) : undefined;
  if (latestRevalidation && latestRevalidation.createdAt > plan.createdAt) {
    return `plan predates latest revalidation ${latestRevalidation.id}`;
  }
  return undefined;
}

function handoffStaleReason(
  handoff: HandoffRecord,
  candidate: CandidateRecord | undefined,
  latestRevalidationByFinding: Map<string, RevalidationRecord>,
): string | undefined {
  if (!candidate) {
    return "target candidate is no longer present in the latest run";
  }
  const blocker = candidateBlockerReason(candidate);
  if (blocker) {
    return `target candidate is not ready: ${blocker}`;
  }
  const latestRevalidation = candidate.findingId ? latestRevalidationByFinding.get(candidate.findingId) : undefined;
  if (latestRevalidation && latestRevalidation.createdAt > handoff.createdAt) {
    return `handoff predates latest revalidation ${latestRevalidation.id}`;
  }
  return undefined;
}

function buildRecentProgressEvents(
  paths: StatePaths,
  records: StatusRecordInputs,
  candidates: CandidateRecord[],
  limit: number,
): StatusProgressEvent[] {
  const events: StatusProgressEvent[] = [];
  for (const run of records.runs) {
    events.push({
      type: "run",
      id: run.id,
      kind: "scan",
      timestamp: run.completedAt,
      path: path.join(paths.runsDir, `${run.id}.json`),
    });
  }
  for (const report of records.reports) {
    events.push({
      type: "report",
      id: report.id,
      kind: "report",
      timestamp: report.createdAt,
      path: reportJsonPath(paths, report),
      targetId: report.runId,
    });
  }
  for (const plan of records.plans) {
    events.push({
      type: "plan",
      id: plan.id,
      kind: `plan:${plan.targetType}`,
      timestamp: plan.createdAt,
      path: path.join(paths.plansDir, `${plan.id}.json`),
      targetId: plan.targetId,
    });
  }
  for (const handoff of records.handoffs) {
    events.push({
      type: "handoff",
      id: handoff.id,
      kind: "handoff",
      timestamp: handoff.createdAt,
      path: path.join(paths.handoffsDir, `${handoff.id}.json`),
      targetId: handoff.targetId ?? handoff.candidateId ?? handoff.id,
      ...(handoff.candidateId ? { candidateId: handoff.candidateId } : {}),
    });
  }
  for (const candidate of candidates) {
    if (!candidate.decomposition) {
      continue;
    }
    events.push({
      type: "split",
      id: candidate.id,
      kind: "decomposition",
      timestamp: candidate.decomposition.createdAt,
      targetId: candidate.decomposition.parentCandidateId ?? candidate.id,
      ...(candidate.findingId ? { findingId: candidate.findingId } : {}),
      candidateId: candidate.id,
    });
  }
  for (const event of records.lifecycleEvents) {
    const data = asRecord(event.data);
    events.push({
      type: "lifecycle",
      id: event.id,
      kind: event.kind,
      timestamp: event.createdAt,
      targetId: event.targetId,
      ...(event.findingId ? { findingId: event.findingId } : {}),
      ...(typeof data["candidateId"] === "string" ? { candidateId: data["candidateId"] } : {}),
      ...(typeof data["outcome"] === "string" ? { outcome: data["outcome"] } : {}),
    });
  }
  for (const revalidation of records.revalidations) {
    events.push({
      type: "revalidation",
      id: revalidation.id,
      kind: `revalidation:${revalidation.outcome}`,
      timestamp: revalidation.createdAt,
      path: path.join(paths.revalidationsDir, `${revalidation.id}.json`),
      ...(revalidation.targetId ? { targetId: revalidation.targetId, findingId: revalidation.targetId } : {}),
      outcome: revalidation.outcome,
    });
  }
  for (const attempt of records.fixAttempts) {
    events.push({
      type: "fix-attempt",
      id: attempt.id,
      kind: `fix:${attempt.outcome ?? attempt.status}`,
      timestamp: attempt.updatedAt,
      path: path.join(paths.fixesDir, `${attempt.id}.json`),
      targetId: attempt.candidateId ?? attempt.findingId,
      findingId: attempt.findingId,
      ...(attempt.candidateId ? { candidateId: attempt.candidateId } : {}),
      ...(attempt.outcome ? { outcome: attempt.outcome } : {}),
    });
  }
  return events
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, limit));
}

function buildLatestArtifactIndex(
  paths: StatePaths,
  options: {
    latestRun?: RunRecord | undefined;
    latestReport?: ReportRecord | undefined;
    candidates: CandidateRecord[];
    plans: PlanRecord[];
    handoffs: HandoffRecord[];
    revalidations: RevalidationRecord[];
    fixAttempts: FixAttemptRecord[];
    lifecycleEvents: LifecycleEventRecord[];
  },
): Record<string, unknown> {
  const latestSplit = options.lifecycleEvents
    .filter((event) => event.kind === "superseded" && asRecord(event.data)["parentCandidateId"])
    .at(-1);
  const latestDecomposition = options.candidates
    .filter((candidate) => candidate.decomposition)
    .sort((a, b) => (a.decomposition?.createdAt ?? "").localeCompare(b.decomposition?.createdAt ?? "") || a.id.localeCompare(b.id))
    .at(-1);
  return {
    latestRun: options.latestRun ? runStatusPayload(paths, options.latestRun) : undefined,
    latestReport: options.latestReport ? reportStatusPayload(paths, options.latestReport) : undefined,
    latestPlan: latestRecordArtifact(paths.plansDir, options.plans.at(-1)),
    latestHandoff: latestRecordArtifact(paths.handoffsDir, options.handoffs.at(-1)),
    latestRevalidation: latestRecordArtifact(paths.revalidationsDir, options.revalidations.at(-1)),
    latestFixAttempt: latestRecordArtifact(paths.fixesDir, options.fixAttempts.at(-1)),
    latestSplit: latestSplit
      ? {
        id: latestSplit.id,
        targetId: latestSplit.targetId,
        findingId: latestSplit.findingId,
        createdAt: latestSplit.createdAt,
        parentCandidateId: asRecord(latestSplit.data)["parentCandidateId"],
        childCandidateIds: asRecord(latestSplit.data)["childCandidateIds"],
      }
      : latestDecomposition?.decomposition
        ? {
          id: latestDecomposition.id,
          targetId: latestDecomposition.decomposition.parentCandidateId ?? latestDecomposition.id,
          findingId: latestDecomposition.findingId,
          createdAt: latestDecomposition.decomposition.createdAt,
          parentCandidateId: latestDecomposition.decomposition.parentCandidateId,
          childCandidateIds: latestDecomposition.decomposition.childCandidateIds,
        }
        : undefined,
  };
}

function latestRecordArtifact<T extends { id: string; createdAt: string }>(
  dir: string,
  record: T | undefined,
): { id: string; path: string; createdAt: string } | undefined {
  if (!record) {
    return undefined;
  }
  return {
    id: record.id,
    path: path.join(dir, `${record.id}.json`),
    createdAt: record.createdAt,
  };
}

interface CandidateProofStatus {
  findingId?: string;
  candidateId: string;
  proofState: "resolved" | "unresolved" | "stale" | "inconclusive" | "needs-human" | "unproven";
  resolved: boolean;
  latestRevalidation?: {
    id: string;
    outcome: RevalidationRecord["outcome"];
    confidence: RevalidationRecord["confidence"];
    rationale: string;
    nextAction: string;
    createdAt: string;
    evidenceIds: string[];
    verificationRunIds: string[];
    replacementFindingId?: string;
  };
  latestVerificationResult?: {
    attemptId: string;
    status: FixAttemptRecord["status"];
    outcome?: FixAttemptRecord["outcome"];
    passed: boolean;
    commandCount: number;
    createdAt: string;
  };
  nextAction: string;
}

function buildProofSummary(
  candidates: CandidateRecord[],
  revalidations: RevalidationRecord[],
  fixAttempts: FixAttemptRecord[],
): Record<string, unknown> {
  const proofStatuses = candidates.map((candidate) => proofStatusForCandidate(candidate, revalidations, fixAttempts));
  const byOutcome = countBy(
    revalidations.filter((record) => record.targetType === "finding"),
    (record) => record.outcome,
  );
  return {
    latestRevalidationCount: revalidations.length,
    byOutcome,
    resolved: proofStatuses.filter((status) => status.proofState === "resolved").length,
    unresolved: proofStatuses.filter((status) => status.proofState === "unresolved").length,
    stale: proofStatuses.filter((status) => status.proofState === "stale").length,
    inconclusive: proofStatuses.filter((status) => status.proofState === "inconclusive").length,
    needsHuman: proofStatuses.filter((status) => status.proofState === "needs-human").length,
    unproven: proofStatuses.filter((status) => status.proofState === "unproven").length,
  };
}

function proofStatusForCandidate(
  candidate: CandidateRecord,
  revalidations: RevalidationRecord[],
  fixAttempts: FixAttemptRecord[],
): CandidateProofStatus {
  const latestRevalidation = candidate.findingId ? latestRevalidationForProof(candidate.findingId, revalidations) : undefined;
  const latestVerificationResult = candidate.findingId ? latestVerificationForProof(candidate.findingId, fixAttempts) : undefined;
  const proofState = latestRevalidation
    ? proofStateForOutcome(latestRevalidation.outcome)
    : "unproven";
  const replacementFindingId = latestRevalidation?.replacementFindingId ?? latestRevalidation?.supersededByFindingId;
  return {
    ...(candidate.findingId ? { findingId: candidate.findingId } : {}),
    candidateId: candidate.id,
    proofState,
    resolved: proofState === "resolved",
    ...(latestRevalidation ? {
      latestRevalidation: {
        id: latestRevalidation.id,
        outcome: latestRevalidation.outcome,
        confidence: latestRevalidation.confidence,
        rationale: latestRevalidation.rationale,
        nextAction: latestRevalidation.nextAction,
        createdAt: latestRevalidation.createdAt,
        evidenceIds: latestRevalidation.evidenceIds,
        verificationRunIds: latestRevalidation.verificationRunIds,
        ...(replacementFindingId ? { replacementFindingId } : {}),
      },
    } : {}),
    ...(latestVerificationResult ? { latestVerificationResult } : {}),
    nextAction: latestRevalidation?.nextAction
      ?? (latestVerificationResult?.passed
        ? "Verification passed, but resolution is unproven until revalidation runs."
        : `Run deepclean revalidate ${candidate.findingId ?? candidate.id}`),
  };
}

function latestRevalidationForProof(
  findingId: string,
  revalidations: RevalidationRecord[],
): RevalidationRecord | undefined {
  return revalidations
    .filter((record) => record.targetType === "finding" && record.targetId === findingId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .at(-1);
}

function latestVerificationForProof(
  findingId: string,
  fixAttempts: FixAttemptRecord[],
): CandidateProofStatus["latestVerificationResult"] | undefined {
  const latest = fixAttempts
    .filter((attempt) => attempt.findingId === findingId && attempt.verificationResults.length > 0)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id))
    .at(-1);
  if (!latest) {
    return undefined;
  }
  return {
    attemptId: latest.id,
    status: latest.status,
    ...(latest.outcome ? { outcome: latest.outcome } : {}),
    passed: latest.verificationResults.every((result) => result.passed),
    commandCount: latest.verificationResults.length,
    createdAt: latest.updatedAt,
  };
}

function proofStateForOutcome(outcome: RevalidationRecord["outcome"]): CandidateProofStatus["proofState"] {
  switch (outcome) {
    case "resolved":
      return "resolved";
    case "partially-resolved":
    case "still-open":
    case "superseded":
      return "unresolved";
    case "stale":
      return "stale";
    case "inconclusive":
      return "inconclusive";
    case "needs-human":
      return "needs-human";
  }
}

function chooseStatusNextAction(options: {
  initialized: boolean;
  latestRunId?: string | undefined;
  locks: Awaited<ReturnType<typeof readLockStatuses>>;
  staleArtifacts: StatusStaleArtifact[];
  activeItems: StatusCandidateItem[];
  blockers: StatusBlockedItem[];
  pendingRevalidation: number;
  latestReport?: ReportRecord | undefined;
}): { command: string; reason: string; targetId?: string } {
  if (!options.initialized) {
    return { command: "deepclean init", reason: "state is not initialized" };
  }
  if (options.locks.some((lock) => lock.stale)) {
    return { command: "deepclean unlock --stale", reason: "stale writer lock blocks future writes" };
  }
  if (!options.latestRunId) {
    return { command: "deepclean scan", reason: "no scan run exists yet" };
  }
  if (options.pendingRevalidation > 0) {
    return { command: "deepclean revalidate all", reason: "stale findings must be refreshed before handoff or fix work" };
  }
  const missingLatestReport = !options.latestReport || options.latestReport.runId !== options.latestRunId;
  if (missingLatestReport) {
    return { command: "deepclean report", reason: "latest run does not have a fresh report artifact" };
  }
  const active = options.activeItems[0];
  if (active) {
    return { command: active.nextCommand, reason: "highest-ranked candidate is ready for a focused plan", targetId: active.id };
  }
  const stale = options.staleArtifacts[0];
  if (stale) {
    return {
      command: stale.recommendation.replace(/\.$/, ""),
      reason: stale.reason,
      ...(stale.targetId ? { targetId: stale.targetId } : {}),
    };
  }
  const blocker = options.blockers[0];
  if (blocker) {
    return { command: `deepclean show ${blocker.id}`, reason: blocker.reason, targetId: blocker.id };
  }
  return { command: "deepclean scan", reason: "no active work is queued; refresh evidence when ready" };
}

function reportJsonPath(paths: StatePaths, report: ReportRecord): string {
  return path.join(paths.reportsDir, `${report.id}.json`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function safeReadState<T>(
  label: string,
  promise: Promise<T>,
  diagnostics: Diagnostic[],
  fallback: T extends unknown[] ? T : never = [] as T extends unknown[] ? T : never,
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    diagnostics.push({
      level: "error",
      code: "partial_state_record",
      message: `Could not read ${label}; treating it as unavailable until state is repaired: ${errorMessage(error)}`,
      adapter: "state",
    });
    return fallback as T;
  }
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
  const [candidates, clusters, evidence, features, opportunities] = await Promise.all([
    readLatestCandidates(context.paths),
    readLatestClusters(context.paths),
    readLatestEvidence(context.paths),
    readLatestFeatures(context.paths),
    readLatestPrOpportunities(context.paths),
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
      opportunities: opportunities.length,
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
    opportunities: opportunities.map((opportunity) => sourceSafeOpportunity(opportunity)),
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
  const modeResult = requireGuardedFixMode(context, "fix");
  if (!modeResult.ok) return modeResult.exitCode;
  const prRequested = flagBoolean(context.parsed.flags, "pr");
  const result = await runCandidateFixWorkflow(context, target, {
    command: "fix",
    requirePrProof: prRequested,
    createBranch: prRequested || Boolean(flagString(context.parsed.flags, "branch")),
    openPr: prRequested,
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
  const modeResult = requireGuardedFixMode(context, "work");
  if (!modeResult.ok) return modeResult.exitCode;
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

function requireGuardedFixMode(context: CommandContext, command: "fix" | "work"): { ok: true } | { ok: false; exitCode: number } {
  const mode = flagString(context.parsed.flags, "mode");
  if (!mode) {
    emit(context.json, fail(command, "fix_mode_required", "GA autofix requires explicit `--mode guarded`."));
    return { ok: false, exitCode: 2 };
  }
  if (mode !== "guarded") {
    emit(context.json, fail(command, "unsupported_fix_mode", "Only `--mode guarded` is supported for the GA autofix lane."));
    return { ok: false, exitCode: 2 };
  }
  return { ok: true };
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
  await writeIdentityMatches(context.paths, identity.identityMatches);
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
  }, identity.diagnostics));
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
  const profile = qualityProfileFromCi(context, policy, createdAt);
  const reviewPr = await reviewPrQualityInputFromCi(context);
  const qualityGateResult = evaluateQualityProfile({
    profile,
    runId: scan.runId,
    baselineRef: scan.data.scope.since ?? scan.data.scope.mergeBase,
    headRef: "HEAD",
    candidates: scan.data.candidates,
    legacyGate: gate,
    reviewPr,
    createdAt,
  });
  const artifactPaths = await writeCiArtifacts(context, scan.data, gate, qualityGateResult);
  qualityGateResult.artifactPaths = artifactPaths;
  const qualityFailed = profile.id !== "ad-hoc" && qualityGateResult.status === "failed";
  const legacyFailed = gate.blockingFindingIds.length > 0;
  const ciRun = {
    schemaVersion,
    recordType: "ci_run" as const,
    id: timestampId("ci"),
    runId: scan.runId,
    baselineRef: scan.data.scope.since ?? scan.data.scope.mergeBase,
    status: legacyFailed || qualityFailed ? "policy-failed" as const : "passed" as const,
    policy,
    blockingFindingIds: gate.blockingFindingIds,
    artifactPaths,
    diagnostics: scan.diagnostics,
    createdAt,
  };
  await writeQualityProfile(context.paths, profile);
  await writeQualityGateResult(context.paths, qualityGateResult);
  await writeCiRun(context.paths, ciRun);

  emit(context.json, ok("ci", {
    ciRun,
    policy,
    qualityProfile: profile,
    qualityGateResult,
    ...(reviewPr ? { reviewPr } : {}),
    result: gate,
    scan: scan.data,
  }, scan.diagnostics));
  if (!context.json && !context.quiet) {
    console.log(`CI ${ciRun.status}: ${gate.blockingFindingIds.length} blocking finding${gate.blockingFindingIds.length === 1 ? "" : "s"}`);
  }
  return legacyFailed || qualityFailed ? 3 : 0;
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

async function reviewPrCommand(context: CommandContext): Promise<number> {
  const base = flagString(context.parsed.flags, "base") ?? "origin/main";
  const head = flagString(context.parsed.flags, "head") ?? "HEAD";
  const diff = await reviewPrChangedPaths(context.paths.root, base, head);
  if (!diff.ok) {
    emit(context.json, fail("review-pr", "review_pr_diff_unresolved", diff.message, [{
      level: "error",
      code: "review_pr_diff_unresolved",
      message: diff.message,
    }]));
    return 2;
  }
  const scanContext = withReviewPrScope(context, base, head);
  const scan = await executeScan(scanContext, { synthesize: false });
  const outputFlag = flagString(context.parsed.flags, "output");
  const outputPathResult = resolveReviewPrOutputPath(context, outputFlag);
  if (!outputPathResult.ok) {
    emit(context.json, fail("review-pr", outputPathResult.code, outputPathResult.message));
    return 2;
  }
  const outputPath = outputPathResult.path;
  const targetResult = await resolveReviewPrTarget(context, flagString(context.parsed.flags, "target"));
  if (!targetResult.ok) {
    emit(context.json, fail("review-pr", targetResult.code, targetResult.message));
    return 1;
  }
  const data = buildReviewPrContext({
    id: timestampId("review-pr"),
    runId: scan.runId,
    root: context.paths.root,
    stateDir: context.paths.stateDir,
    base,
    head,
    changedFiles: diff.paths,
    candidates: scan.data.candidates,
    evidence: await readEvidence(context.paths, scan.runId),
    features: await readFeatures(context.paths, scan.runId),
    ...(targetResult.target ? { target: targetResult.target } : {}),
    createdAt: new Date().toISOString(),
    ...(outputPath ? { outputPath } : {}),
  });
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
  emit(context.json, ok("review-pr", data, scan.diagnostics));
  if (!context.json && !context.quiet) {
    console.log(`Review context ${data.id}: ${data.changedFiles.length} changed file${data.changedFiles.length === 1 ? "" : "s"}, ${data.relatedCandidates.length} related finding${data.relatedCandidates.length === 1 ? "" : "s"}, risk ${data.riskSummary.level}`);
    for (const reason of data.riskSummary.reasons) {
      console.log(`  ${reason}`);
    }
    if (data.outputPath) {
      console.log(`output: ${data.outputPath}`);
    }
  }
  return 0;
}

function resolveReviewPrOutputPath(
  context: CommandContext,
  outputFlag: string | undefined,
): { ok: true; path?: string } | { ok: false; code: string; message: string } {
  if (!outputFlag) {
    return { ok: true };
  }
  const resolved = path.resolve(context.paths.root, outputFlag);
  const stateDir = path.resolve(context.paths.stateDir);
  if (!pathIsWithin(resolved, stateDir)) {
    return {
      ok: false,
      code: "review_pr_output_outside_state_dir",
      message: "`review-pr --output` must write under the configured state directory.",
    };
  }
  return { ok: true, path: resolved };
}

async function resolveReviewPrTarget(
  context: CommandContext,
  targetId: string | undefined,
): Promise<{ ok: true; target?: ReviewPrTarget } | { ok: false; code: string; message: string }> {
  if (!targetId) {
    return { ok: true };
  }
  const opportunity = await resolvePrOpportunityById(context.paths, targetId);
  if (opportunity) {
    return { ok: true, target: { id: targetId, type: "opportunity", opportunity } };
  }
  const candidates = await readLatestCandidates(context.paths);
  const candidate = resolveCandidateFromRunState(candidates, targetId)
    ?? await candidateForHistoryLookup(context.paths, targetId, undefined);
  if (candidate) {
    return {
      ok: true,
      target: {
        id: targetId,
        type: candidate.findingId === targetId ? "finding" : "candidate",
        candidate,
      },
    };
  }
  return {
    ok: false,
    code: "review_pr_target_not_found",
    message: `Review target not found: ${targetId}`,
  };
}

async function resolvePrOpportunityById(
  paths: StatePaths,
  opportunityId: string,
): Promise<PrOpportunityRecord | undefined> {
  const latest = await readLatestPrOpportunities(paths);
  return latest.find((item) => item.id === opportunityId)
    ?? [...await readAllPrOpportunities(paths)].reverse().find((item) => item.id === opportunityId);
}

async function setupCommand(context: CommandContext): Promise<number> {
  const subcommand = context.parsed.positional[0];
  if (subcommand !== "analyzers") {
    emit(context.json, fail("setup", "unknown_setup_target", "Expected `deepclean setup analyzers`."));
    return 2;
  }
  await ensureState(context.paths);
  const plan = await buildAnalyzerSetupPlan({
    id: timestampId("analyzers"),
    root: context.paths.root,
  });
  const path = await writeAnalyzerSetupPlan(context.paths, plan);
  emit(context.json, ok("setup", { plan, path, planPath: path }, plan.diagnostics));
  if (!context.json && !context.quiet) {
    console.log(`Analyzer setup plan: ${plan.recommendations.length} recommendation${plan.recommendations.length === 1 ? "" : "s"}`);
    for (const recommendation of plan.recommendations) {
      console.log(`- ${recommendation.analyzerId}: ${recommendation.command ?? "manual setup"}`);
    }
    console.log(`Plan written to ${path}`);
  }
  return 0;
}

function pathIsWithin(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function schemasCommand(context: CommandContext): Promise<number> {
  const data = buildJsonContractCatalog(await packageVersion());
  emit(context.json, ok("schemas", data));
  if (!context.json && !context.quiet) {
    console.log(`Deepclean JSON contracts ${data.schemaVersion} (${data.stability})`);
    for (const contract of data.contracts) {
      console.log(`- ${contract.command}: ${contract.status}`);
    }
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
    ? await synthesizeWithChunkedCodex({
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
  diagnostics.push(...identity.diagnostics);

  await writeFeatures(context.paths, runId, features);
  await writeEvidence(context.paths, runId, evidence);
  if (synthesisResult.attempt) {
    await writeSynthesisAttempt(context.paths, remapSynthesisAttemptCandidateIds(synthesisResult.attempt, candidates));
  }
  await writeCandidates(context.paths, runId, candidates);
  await writeFindings(context.paths, identity.findings);
  await writeCandidateObservations(context.paths, runId, identity.observations);
  await writeLifecycleEvents(context.paths, identity.lifecycleEvents);
  await writeIdentityMatches(context.paths, identity.identityMatches);
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
  const [latestClusters, findings, revalidations, fixAttempts] = await Promise.all([
    readLatestClusters(context.paths),
    readFindings(context.paths),
    readRevalidations(context.paths),
    readFixAttempts(context.paths),
  ]);
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
  const opportunities = buildPrOpportunities({
    runId,
    candidates: ranked,
    clusters,
    evidence,
    features,
    findings,
    revalidations,
    fixAttempts,
  });
  const opportunitiesPath = await writePrOpportunities(context.paths, runId, opportunities);
  const campaignSummary = buildCampaignSummaryRecord({ runId, opportunities, fixAttempts });
  const report = buildReportRecord(runId, ranked, clusters, features);
  const markdown = clusters.length > 0
    ? renderMarkdownReportWithClusters(ranked, clusters, features, opportunities)
    : renderMarkdownReport(ranked, features, opportunities);
  const paths = await writeReport(context.paths, report, markdown);

  emit(context.json, ok("report", {
    report,
    opportunities,
    opportunitiesPath,
    campaignSummary,
    paths,
    reportPath: paths.markdownPath,
    markdownPath: paths.markdownPath,
    jsonPath: paths.jsonPath,
    candidates: ranked,
    clusters,
    proofStatuses: ranked.map((candidate) => proofStatusForCandidate(candidate, revalidations, fixAttempts)),
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
  const [state, findings, revalidations, fixAttempts] = await Promise.all([
    latestState(context.paths),
    readFindings(context.paths),
    readRevalidations(context.paths),
    readFixAttempts(context.paths),
  ]);
  const { candidates, clusters, evidence, features, runId } = state;
  const filter = queryFilterFromFlags(context);
  const selectedFeature = filter.feature ? features.find((feature) => feature.featureId === filter.feature) : undefined;
  if (filter.feature && !selectedFeature) {
    emit(context.json, fail("next", "feature_not_found", `Feature not found: ${filter.feature}`));
    return 1;
  }
  const filtered = filterCandidatesForQuery(candidates, clusters, filter);
  const opportunities = buildPrOpportunities({
    runId,
    candidates: filtered,
    clusters,
    evidence,
    features,
    findings,
    revalidations,
    fixAttempts,
  });
  const opportunitiesPath = await writePrOpportunities(context.paths, runId, opportunities);
  const opportunity = opportunities.find((item) => item.status === "recommended")
    ?? opportunities.find((item) => item.classification === "stop-campaign")
    ?? null;
  const legacyCandidate = rankCandidates(filtered).find((item) => item.status === "open") ?? null;
  const candidate = opportunity?.targetCandidateIds[0]
    ? candidates.find((item) => item.id === opportunity.targetCandidateIds[0]) ?? null
    : legacyCandidate;
  emit(context.json, ok("next", {
    opportunity,
    opportunities,
    opportunitiesPath,
    candidate: candidate ?? null,
    proofStatus: candidate ? proofStatusForCandidate(candidate, revalidations, fixAttempts) : null,
    selectedFeature,
  }));
  if (!context.json && !context.quiet) {
    if (opportunity?.classification === "stop-campaign") {
      console.log(opportunity.rationale);
    } else if (candidate) {
      console.log(`Next PR opportunity: ${opportunity?.id ?? "n/a"} ${opportunity?.title ?? candidate.title}`);
      printCandidate(candidate);
    } else {
      console.log("No open candidates.");
    }
  }
  return 0;
}

async function campaignCommand(context: CommandContext): Promise<number> {
  const [state, persisted, findings, revalidations, fixAttempts] = await Promise.all([
    latestState(context.paths),
    readLatestPrOpportunities(context.paths),
    readFindings(context.paths),
    readRevalidations(context.paths),
    readFixAttempts(context.paths),
  ]);
  const opportunities = persisted.length > 0
    ? persisted
    : buildPrOpportunities({
      runId: state.runId,
      candidates: state.candidates,
      clusters: state.clusters,
      evidence: state.evidence,
      features: state.features,
      findings,
      revalidations,
      fixAttempts,
    });
  const opportunitiesPath = await writePrOpportunities(context.paths, state.runId, opportunities);
  const summary = buildCampaignSummaryRecord({
    runId: state.runId,
    opportunities,
    fixAttempts,
  });
  const summaryPath = await writeCampaignSummary(context.paths, summary);

  emit(context.json, ok("campaign", {
    summary,
    summaryPath,
    opportunities,
    opportunitiesPath,
    recommendedOpportunity: opportunities.find((item) => item.id === summary.recommendedOpportunityId) ?? null,
  }));
  if (!context.json && !context.quiet) {
    if (summary.recommendedOpportunityId) {
      const recommended = opportunities.find((item) => item.id === summary.recommendedOpportunityId);
      console.log(`Recommended: ${recommended?.id ?? summary.recommendedOpportunityId} ${recommended?.title ?? ""}`.trim());
    } else {
      console.log(summary.stopCampaignRationale ?? "No campaign recommendation available.");
    }
    for (const [classification, count] of Object.entries(summary.counts.byClassification).sort()) {
      console.log(`${classification}: ${count}`);
    }
  }
  return 0;
}

function buildCampaignSummaryRecord(options: {
  runId: string;
  opportunities: PrOpportunityRecord[];
  fixAttempts: FixAttemptRecord[];
}): CampaignSummaryRecord {
  const createdAt = new Date().toISOString();
  const recommended = options.opportunities.find((item) => item.status === "recommended");
  const stop = options.opportunities.find((item) => item.classification === "stop-campaign");
  return {
    schemaVersion,
    recordType: "campaign_summary",
    id: timestampId("campaign"),
    runId: options.runId,
    currentRunId: options.runId,
    opportunityRunId: options.runId,
    ...(recommended ? { recommendedOpportunityId: recommended.id } : {}),
    ...(!recommended && stop ? { stopCampaignRationale: stop.rationale } : {}),
    counts: {
      byClassification: countBy(options.opportunities, (item) => item.classification),
      byStatus: countBy(options.opportunities, (item) => item.status),
    },
    completedOpportunityIds: options.opportunities
      .filter((item) => item.status === "completed")
      .map((item) => item.id),
    supersededOpportunityIds: options.opportunities
      .filter((item) => item.status === "superseded")
      .map((item) => item.id),
    knownFixAttemptIds: options.fixAttempts.map((attempt) => attempt.id),
    knownPrUrls: options.fixAttempts.flatMap((attempt) => attempt.pr?.url ? [attempt.pr.url] : []),
    improvements: options.opportunities
      .filter((item) => item.status === "completed")
      .map((item) => item.expectedPayoff),
    remainingDebt: Object.entries(countBy(
      options.opportunities.filter((item) => item.classification !== "safe-narrow-pr" && item.classification !== "stop-campaign"),
      (item) => item.classification,
    )).map(([classification, count]) => ({
      classification: classification as CampaignSummaryRecord["remainingDebt"][number]["classification"],
      count,
      summary: `${count} ${classification} opportunit${count === 1 ? "y" : "ies"} remain.`,
    })),
    diagnostics: [],
    createdAt,
  };
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
  const requestedRunId = flagString(context.parsed.flags, "run");
  const migrationDiagnostics = await ensureLifecycleStateMigration(context.paths, requestedRunId);
  let state: Awaited<ReturnType<typeof stateForRun>>;
  try {
    state = requestedRunId
      ? await stateForRun(context.paths, requestedRunId)
      : await latestState(context.paths);
  } catch {
    emit(context.json, fail("show", "run_not_found", `Run not found: ${requestedRunId ?? "latest"}`));
    return 1;
  }
  const { candidates, clusters, runId } = state;
  const config = await ensureState(context.paths);
  const availableClusters = clusters.length > 0 ? clusters : buildClusters(runId, candidates, state.evidence, new Date().toISOString(), config.clusters);
  const cluster = availableClusters.find((item) => item.id === id);
  if (cluster) {
    const clusterCandidates = candidates.filter((item) => cluster.candidateIds.includes(item.id));
    const supportingEvidence = evidenceForIds(state.evidence, cluster.evidenceIds);
    const affectedFeatures = featuresForCandidates(clusterCandidates, state.features);
    emit(context.json, ok("show", { cluster, candidates: clusterCandidates, evidence: supportingEvidence, features: affectedFeatures }, migrationDiagnostics));
    if (!context.json && !context.quiet) {
      printCluster(cluster);
      for (const candidate of clusterCandidates) {
        console.log(`  candidate ${candidate.id}: ${candidate.title}`);
      }
    }
    return 0;
  }
  const candidate = resolveCandidateFromRunState(candidates, id)
    ?? await candidateForHistoryLookup(context.paths, id, requestedRunId);
  if (!candidate) {
    emit(context.json, fail("show", "candidate_not_found", `Candidate or finding not found: ${id}`));
    return 1;
  }
  const [finding, observation, lifecycleEvents, revalidations, fixAttempts] = await Promise.all([
    candidate.findingId ? findingForId(context.paths, candidate.findingId) : Promise.resolve(undefined),
    readCandidateObservations(context.paths, candidate.runId)
      .then((observations) => observations.find((item) => item.candidateId === candidate.id)),
    readLifecycleEvents(context.paths),
    readRevalidations(context.paths),
    readFixAttempts(context.paths),
  ]);
  const runScopedState = candidate.runId === state.runId
    ? state
    : await stateForRun(context.paths, candidate.runId).catch(() => state);
  const supportingEvidence = evidenceForIds(runScopedState.evidence, candidate.evidenceIds);
  const affectedFeatures = featuresForCandidate(candidate, runScopedState.features);
  const links = {
    parentFindingId: finding?.parentFindingId,
    childFindingIds: finding?.childFindingIds ?? [],
    supersededByFindingId: finding?.supersededByFindingId,
    supersedesFindingIds: finding?.supersedesFindingIds ?? [],
    replacementFromHistory: lifecycleEvents
      .find((event) => event.kind === "superseded" && event.targetId === finding?.id)
      ?.data?.["supersededByFindingId"],
  };
  emit(context.json, ok("show", {
    runId: candidate.runId,
    candidate,
    finding,
    observation,
    links,
    latestRevalidation: candidate.findingId ? latestRevalidationForProof(candidate.findingId, revalidations) : undefined,
    latestVerificationResult: candidate.findingId ? latestVerificationForProof(candidate.findingId, fixAttempts) : undefined,
    proofStatus: proofStatusForCandidate(candidate, revalidations, fixAttempts),
    evidence: supportingEvidence,
    features: affectedFeatures,
  }, migrationDiagnostics));
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
  const migrationDiagnostics = await ensureLifecycleStateMigration(context.paths, runId);
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
  emit(context.json, ok("history", { finding, candidate, events: history }, migrationDiagnostics));
  if (!context.json && !context.quiet) {
    console.log(`${finding.id}: ${finding.title}`);
    for (const event of history) {
      console.log(`${event.createdAt} ${event.kind}${event.toState ? ` -> ${event.toState}` : ""}`);
    }
  }
  return 0;
}

async function revalidateCommand(context: CommandContext): Promise<number> {
  const preparation = await prepareRevalidation(context);
  if (!preparation) {
    return 1;
  }
  const { target, resolvedTarget, scan, afterFindings, records } = preparation;

  for (const record of records) {
    await writeRevalidation(context.paths, record);
  }
  const updatedFindings = afterFindings.map((finding) => {
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
  await updateLatestCandidates(context.paths, scan.data.candidates.map((candidate) => {
    const findingId = candidate.findingId;
    const record = findingId ? records.find((item) => item.targetId === findingId) : undefined;
    if (!record) {
      return candidate;
    }
    return {
      ...candidate,
      lifecycleState: revalidationOutcomeToLifecycleState(record.outcome),
      status: revalidationOutcomeToStatus(record.outcome, candidate.status),
      updatedAt: record.createdAt,
    };
  }));
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
        fromState: record.priorLifecycleState,
        toState: revalidationOutcomeToLifecycleState(record.outcome),
        command: "revalidate",
        createdAt: record.createdAt,
        data: {
          revalidationId: record.id,
          outcome: record.outcome,
          confidence: record.confidence,
          nextAction: record.nextAction,
          replacementFindingId: record.replacementFindingId ?? record.supersededByFindingId,
        },
      }]
      : []
  )));

  emit(context.json, ok("revalidate", {
    target,
    resolvedTarget: {
      type: resolvedTarget.type,
      findingIds: resolvedTarget.findings.map((finding) => finding.id),
      ...(resolvedTarget.clusterId ? { clusterId: resolvedTarget.clusterId } : {}),
      ...(resolvedTarget.forceNeedsHuman ? { forceNeedsHuman: resolvedTarget.forceNeedsHuman } : {}),
    },
    runId: scan.runId,
    revalidations: records,
    candidates: scan.data.candidates,
  }, [...resolvedTarget.diagnostics, ...scan.diagnostics]));
  if (!context.json && !context.quiet) {
    for (const record of records) {
      console.log(`${record.targetId ?? "all"}: ${record.outcome}`);
    }
  }
  return 0;
}

async function prepareRevalidation(context: CommandContext): Promise<RevalidationPreparation | undefined> {
  const target = requireCandidateId(context);
  await ensureLifecycleStateMigration(context.paths);
  const beforeFindings = await readFindings(context.paths);
  const resolvedTarget = await resolveRevalidationTargets(context.paths, target, beforeFindings);
  if (resolvedTarget.findings.length === 0 && target !== "all" && !resolvedTarget.forceNeedsHuman) {
    emit(context.json, fail("revalidate", "finding_not_found", `Finding or theme not found: ${target}`));
    return undefined;
  }

  const dirtyBefore = await dirtyFileEntries(context.paths.root);
  const revalidationContext = scopedRevalidationContext(context, resolvedTarget.findings);
  const scan = await executeScan(revalidationContext, { synthesize: false });
  const now = new Date().toISOString();
  const [fixAttempts, afterFindings] = await Promise.all([
    readFixAttempts(context.paths),
    readFindings(context.paths),
  ]);
  const records: RevalidationRecord[] = [];
  for (const finding of resolvedTarget.findings) {
    records.push(await classifyRevalidation({
      root: context.paths.root,
      finding,
      currentCandidates: scan.data.candidates,
      runId: scan.runId,
      createdAt: now,
      currentEvidence: scan.data.candidates.length > 0 ? await readEvidence(context.paths, scan.runId).catch(() => []) : [],
      verificationRunIds: verificationRunIdsForFinding(finding.id, fixAttempts),
      changedFiles: scan.data.scope.changedPaths,
      dirtyState: { dirty: dirtyBefore.length > 0, files: dirtyBefore.map((entry) => entry.file) },
      forceNeedsHuman: resolvedTarget.forceNeedsHuman,
    }));
  }
  if (target === "all" && resolvedTarget.findings.length === 0) {
    records.push(await classifyRevalidation({
      root: context.paths.root,
      finding: undefined,
      currentCandidates: scan.data.candidates,
      runId: scan.runId,
      createdAt: now,
      changedFiles: scan.data.scope.changedPaths,
      dirtyState: { dirty: dirtyBefore.length > 0, files: dirtyBefore.map((entry) => entry.file) },
    }));
  }

  return { target, resolvedTarget, scan, afterFindings, records };
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
  const [{ candidates, evidence, features, clusters, runId }, opportunity] = await Promise.all([
    latestState(context.paths),
    resolvePrOpportunityById(context.paths, id),
  ]);
  const config = await ensureState(context.paths);
  const availableClusters = clusters.length > 0 ? clusters : buildClusters(runId, candidates, evidence, new Date().toISOString(), config.clusters);
  if (clusters.length === 0 && availableClusters.length > 0) {
    await writeClusters(context.paths, runId, availableClusters);
  }

  if (opportunity) {
    const plan = buildOpportunityPlan(opportunity);
    const planPath = await writePlan(context.paths, plan);
    emit(context.json, ok("plan", { plan, path: planPath, planPath, opportunity }));
    if (!context.json && !context.quiet) {
      console.log(plan.content);
      console.log("");
      console.log(`Plan written to ${path.relative(context.paths.root, planPath)}`);
    }
    return 0;
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
    emit(context.json, fail("plan", "target_not_found", `Candidate, theme, or opportunity not found: ${id}`));
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
  const [{ candidates, evidence, features }, revalidations, fixAttempts, opportunity] = await Promise.all([
    latestState(context.paths),
    readRevalidations(context.paths),
    readFixAttempts(context.paths),
    resolvePrOpportunityById(context.paths, id),
  ]);
  if (opportunity) {
    const handoff = buildOpportunityHandoff(opportunity, format);
    const handoffPath = await writeHandoff(context.paths, handoff);
    emit(context.json, ok("handoff", { handoff, path: handoffPath, opportunity, warnings: [], proofStatus: null }));
    if (!context.json && !context.quiet) {
      console.log(handoff.content);
      console.log("");
      console.log(`Handoff written to ${path.relative(context.paths.root, handoffPath)}`);
    }
    return 0;
  }
  const candidate = candidates.find((item) => item.id === id);
  if (!candidate) {
    emit(context.json, fail("handoff", "target_not_found", `Candidate or opportunity not found: ${id}`));
    return 1;
  }
  const supportingEvidence = evidenceForIds(evidence, candidate.evidenceIds);
  const affectedFeatures = featuresForCandidate(candidate, features);
  const handoff = buildHandoff(candidate, supportingEvidence, format, affectedFeatures);
  const handoffPath = await writeHandoff(context.paths, handoff);
  const proofStatus = proofStatusForCandidate(candidate, revalidations, fixAttempts);
  const warnings = handoffFreshnessWarnings(candidate, proofStatus.latestRevalidation);

  emit(context.json, ok("handoff", { handoff, path: handoffPath, warnings, proofStatus, features: affectedFeatures }));
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
  await ensureLifecycleStateMigration(paths);
  const runId = await latestRunId(paths);
  if (!runId) {
    throw new Error("No scan run found. Run `deepclean scan` first.");
  }
  return stateForRun(paths, runId);
}

async function stateForRun(paths: StatePaths, runId: string): Promise<{
  runId: string;
  candidates: CandidateRecord[];
  clusters: ClusterRecord[];
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
}> {
  const [candidates, clusters, evidence, features] = await Promise.all([
    readCandidates(paths, runId),
    readClusters(paths, runId),
    readEvidence(paths, runId),
    readFeatures(paths, runId).catch(() => []),
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
  const opportunity = await resolvePrOpportunityById(context.paths, target);
  if (opportunity) {
    if (opportunity.classification !== "safe-narrow-pr") {
      return {
        ok: false,
        exitCode: 2,
        code: "opportunity_not_fixable",
        message: `Opportunity ${opportunity.id} is classified as ${opportunity.classification}; guarded fix execution only accepts safe-narrow-pr opportunities.`,
        diagnostics: opportunity.refusalReason ? [{
          level: "warning",
          code: "opportunity_refusal_reason",
          message: opportunity.refusalReason,
        }] : [],
      };
    }
    if (opportunity.targetCandidateIds.length !== 1) {
      return {
        ok: false,
        exitCode: 2,
        code: "opportunity_not_narrow",
        message: `Opportunity ${opportunity.id} must target exactly one candidate before guarded fix execution.`,
      };
    }
    const candidateId = opportunity.targetCandidateIds[0];
    const resolvedOpportunityCandidate = candidateId ? resolveFixTargetFromCandidates(state.candidates, candidateId) : undefined;
    if (!resolvedOpportunityCandidate) {
      return {
        ok: false,
        exitCode: 1,
        code: "opportunity_candidate_not_found",
        message: `Opportunity ${opportunity.id} targets a candidate that is not in the latest scan: ${candidateId ?? "n/a"}`,
      };
    }
    if (isSplittableParentCandidate(resolvedOpportunityCandidate.candidate, state.evidence)) {
      return {
        ok: false,
        exitCode: 2,
        code: "fix_target_needs_split",
        message: `Opportunity ${opportunity.id} resolves to a candidate that is still too broad. Run \`deepclean split ${resolvedOpportunityCandidate.candidate.id}\` and target one child candidate.`,
      };
    }
    return { ok: true, config, state, resolved: resolvedOpportunityCandidate };
  }

  if (target.startsWith("opportunity-")) {
    return {
      ok: false,
      exitCode: 1,
      code: "opportunity_not_found",
      message: `Opportunity not found in the latest campaign state: ${target}`,
    };
  }

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

type FixWorkflowScopeContext = {
  ok: true;
  planResult: Awaited<ReturnType<typeof ensureFixPlan>>;
  allowedWriteScope: string[];
  dirtyBefore: string[];
  patchPath?: string;
  statePrefix: string;
};

async function prepareFixWorkflowScope(
  context: CommandContext,
  options: FixWorkflowOptions,
  state: FixWorkflowTargetContext["state"],
  resolved: FixWorkflowTargetContext["resolved"],
  dryRun: boolean,
): Promise<FixWorkflowScopeContext | Extract<FixWorkflowResult, { ok: false }>> {
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
    await writeFixRefusalLifecycleEvent(context.paths, {
      findingId: resolved.findingId,
      candidateId: resolved.candidate.id,
      command: options.command,
      code: "dirty_tree",
      message: `Dirty files outside target scope: ${dirtyOutsideTarget.join(", ")}`,
    });
    return {
      ok: false,
      exitCode: 2,
      code: "dirty_tree",
      message: `Dirty files outside target scope: ${dirtyOutsideTarget.join(", ")}`,
    };
  }

  return {
    ok: true,
    planResult,
    allowedWriteScope,
    dirtyBefore,
    statePrefix,
    ...(patchPath ? { patchPath } : {}),
  };
}

type CandidateFixWorkflowPreflight = {
  ok: true;
  config: DeepcleanConfig;
  state: FixWorkflowTargetContext["state"];
  resolved: FixWorkflowTargetContext["resolved"];
  dryRun: boolean;
  verificationCommands: string[];
  scopeContext: FixWorkflowScopeContext;
  branch?: string;
};

async function prepareCandidateFixWorkflow(
  context: CommandContext,
  target: string,
  options: FixWorkflowOptions,
): Promise<CandidateFixWorkflowPreflight | Extract<FixWorkflowResult, { ok: false }>> {
  const targetContext = await resolveFixWorkflowTarget(context, target);
  if (!targetContext.ok) {
    return targetContext;
  }
  const { config, state, resolved } = targetContext;

  const blocked = fixReadinessBlocker(resolved.candidate);
  if (blocked) {
    await writeFixRefusalLifecycleEvent(context.paths, {
      findingId: resolved.findingId,
      candidateId: resolved.candidate.id,
      command: options.command,
      code: blocked.code,
      message: blocked.message,
    });
    return { ok: false, exitCode: 2, ...blocked };
  }

  const dryRun = flagBoolean(context.parsed.flags, "dry-run") || !flagBoolean(context.parsed.flags, "apply");
  const verificationCommands = verificationCommandsForFix(context, config, resolved.candidate);
  const verificationBlocker = fixWorkflowVerificationBlocker(options, dryRun, verificationCommands);
  if (verificationBlocker) {
    await writeFixRefusalLifecycleEvent(context.paths, {
      findingId: resolved.findingId,
      candidateId: resolved.candidate.id,
      command: options.command,
      code: verificationBlocker.code,
      message: verificationBlocker.message,
    });
    return verificationBlocker;
  }

  const scopeContext = await prepareFixWorkflowScope(context, options, state, resolved, dryRun);
  if (!scopeContext.ok) {
    return scopeContext;
  }

  const branch = flagString(context.parsed.flags, "branch");
  if (options.createBranch) {
    if (!branch) {
      return {
        ok: false,
        exitCode: 2,
        code: "branch_required",
        message: "`deepclean fix --pr` and `deepclean work` require --branch so the patch has an isolated PR lane.",
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

  return {
    ok: true,
    config,
    state,
    resolved,
    dryRun,
    verificationCommands,
    scopeContext,
    ...(branch ? { branch } : {}),
  };
}

type CandidateFixAttemptExecution = {
  ok: true;
  attemptDiagnostics: Diagnostic[];
  patchPreviewPath?: string;
  worker?: FixAttemptRecord["worker"];
  status: FixAttemptRecord["status"];
  changedFiles: string[];
  diffBeforeAttempt: string;
};

async function executeCandidateFixAttempt(input: {
  context: CommandContext;
  config: DeepcleanConfig;
  dryRun: boolean;
  patchPath: string | undefined;
  attemptId: string;
  attemptNumber: number;
  maxAttempts: number;
  previousAttemptSummaries: FixWorkerPreviousAttempt[];
  currentCandidate: CandidateRecord;
  planContent: string;
  currentEvidence: EvidenceRecord[];
  currentFeatures: FeatureRecord[];
  remainingEvidence: EvidenceRecord[];
  allowedWriteScope: string[];
  verificationCommands: string[];
}): Promise<CandidateFixAttemptExecution | Extract<FixWorkflowResult, { ok: false }>> {
  const {
    context,
    config,
    dryRun,
    patchPath,
    attemptId,
    attemptNumber,
    maxAttempts,
    previousAttemptSummaries,
    currentCandidate,
    planContent,
    currentEvidence,
    currentFeatures,
    remainingEvidence,
    allowedWriteScope,
    verificationCommands,
  } = input;
  const attemptDiagnostics: Diagnostic[] = [];
  let patchPreviewPath: string | undefined;
  let worker: FixAttemptRecord["worker"];
  let status: FixAttemptRecord["status"] = dryRun ? "previewed" : "unverified";
  let changedFiles: string[] = [];
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
      planContent,
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

  return {
    ok: true,
    attemptDiagnostics,
    ...(patchPreviewPath ? { patchPreviewPath } : {}),
    ...(worker ? { worker } : {}),
    status,
    changedFiles,
    diffBeforeAttempt,
  };
}

async function recordCandidateFixAttempt(input: {
  context: CommandContext;
  command: FixWorkflowOptions["command"];
  attempts: FixAttemptRecord[];
  attemptId: string;
  resolved: FixWorkflowTargetContext["resolved"];
  planId: string;
  status: FixAttemptRecord["status"];
  outcome: FixAttemptRecord["outcome"];
  dryRun: boolean;
  attemptNumber: number;
  maxAttempts: number;
  dirtyBefore: string[];
  allowedWriteScope: string[];
  outOfScopeFiles: string[];
  revalidation: RevalidationRecord | undefined;
  changedFiles: string[];
  patchPreviewPath: string | undefined;
  verificationCommands: string[];
  verificationResults: FixAttemptRecord["verificationResults"];
  worker: FixAttemptRecord["worker"] | undefined;
  attemptDiagnostics: Diagnostic[];
}): Promise<{
  attempt: FixAttemptRecord;
  attemptPath: string;
  previousAttemptSummary: FixWorkerPreviousAttempt;
}> {
  const now = new Date().toISOString();
  const previousAttemptIds = input.attempts.map((attempt) => attempt.id);
  const dirtyAfter = !input.dryRun
    ? (await dirtyFileEntries(input.context.paths.root)).map((entry) => entry.file)
    : input.dirtyBefore;
  const activeBranch = flagString(input.context.parsed.flags, "branch") ?? await currentGitBranch(input.context.paths.root);
  const attempt: FixAttemptRecord = {
    schemaVersion,
    recordType: "fix_attempt",
    id: input.attemptId,
    findingId: input.resolved.findingId,
    candidateId: input.resolved.candidate.id,
    planId: input.planId,
    status: input.status,
    outcome: input.outcome,
    dryRun: input.dryRun,
    attemptNumber: input.attemptNumber,
    maxAttempts: input.maxAttempts,
    previousAttemptIds,
    branch: activeBranch,
    dirtyBefore: input.dirtyBefore,
    dirtyAfter,
    allowedWriteScope: input.allowedWriteScope,
    outOfScopeFiles: input.outOfScopeFiles,
    noExternalSideEffects: true,
    beforeEvidenceIds: input.resolved.candidate.evidenceIds,
    afterRevalidationId: input.revalidation?.id,
    changedFiles: input.changedFiles,
    patchPreviewPath: input.patchPreviewPath,
    verificationCommands: input.verificationCommands,
    verificationResults: input.verificationResults,
    worker: input.worker,
    diagnostics: input.attemptDiagnostics,
    createdAt: now,
    updatedAt: now,
  };
  const attemptPath = await writeFixAttempt(input.context.paths, attempt);
  await writeFixLifecycleEvents(input.context.paths, attempt, input.command, input.revalidation);
  return {
    attempt,
    attemptPath,
    previousAttemptSummary: {
      id: attempt.id,
      status: input.status,
      outcome: input.outcome,
      changedFiles: input.changedFiles,
      revalidationOutcome: input.revalidation?.outcome,
      remainingEvidenceIds: input.revalidation?.evidenceIds ?? [],
      diagnostics: input.attemptDiagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
      verificationFailures: input.verificationResults.filter((result) => !result.passed).map((result) => ({
        command: result.command,
        outputPath: result.outputPath,
      })),
    },
  };
}

async function recordCandidateFixAttemptAndDecideRetry(input: {
  context: CommandContext;
  command: FixWorkflowOptions["command"];
  attempts: FixAttemptRecord[];
  attemptPaths: string[];
  previousAttemptSummaries: FixWorkerPreviousAttempt[];
  attemptId: string;
  resolved: FixWorkflowTargetContext["resolved"];
  planId: string;
  status: FixAttemptRecord["status"];
  outcome: FixAttemptRecord["outcome"];
  dryRun: boolean;
  patchPath: string | undefined;
  attemptNumber: number;
  maxAttempts: number;
  dirtyBefore: string[];
  allowedWriteScope: string[];
  outOfScopeFiles: string[];
  revalidation: RevalidationRecord | undefined;
  revalidationRequired: boolean;
  changedFiles: string[];
  patchPreviewPath: string | undefined;
  verificationCommands: string[];
  verificationResults: FixAttemptRecord["verificationResults"];
  worker: FixAttemptRecord["worker"] | undefined;
  attemptDiagnostics: Diagnostic[];
}): Promise<boolean> {
  const recordedAttempt = await recordCandidateFixAttempt({
    context: input.context,
    command: input.command,
    attempts: input.attempts,
    attemptId: input.attemptId,
    resolved: input.resolved,
    planId: input.planId,
    status: input.status,
    outcome: input.outcome,
    dryRun: input.dryRun,
    attemptNumber: input.attemptNumber,
    maxAttempts: input.maxAttempts,
    dirtyBefore: input.dirtyBefore,
    allowedWriteScope: input.allowedWriteScope,
    outOfScopeFiles: input.outOfScopeFiles,
    revalidation: input.revalidation,
    changedFiles: input.changedFiles,
    patchPreviewPath: input.patchPreviewPath,
    verificationCommands: input.verificationCommands,
    verificationResults: input.verificationResults,
    worker: input.worker,
    attemptDiagnostics: input.attemptDiagnostics,
  });
  const { attempt, attemptPath, previousAttemptSummary } = recordedAttempt;
  input.attempts.push(attempt);
  input.attemptPaths.push(attemptPath);
  input.previousAttemptSummaries.push(previousAttemptSummary);

  return shouldRetryFixAttempt({
    dryRun: input.dryRun,
    hasPatchPath: Boolean(input.patchPath),
    attemptNumber: input.attemptNumber,
    maxAttempts: input.maxAttempts,
    changedFiles: input.changedFiles,
    outOfScopeFiles: input.outOfScopeFiles,
    verificationResults: input.verificationResults,
    outcome: input.outcome,
    revalidation: input.revalidation,
    revalidationRequired: input.revalidationRequired,
  });
}

async function finalizeCandidateFixPrReadiness(input: {
  context: CommandContext;
  options: FixWorkflowOptions;
  attempt: FixAttemptRecord;
  candidate: CandidateRecord;
  branch?: string | undefined;
  dryRun: boolean;
  changedFiles: string[];
  outOfScopeFiles: string[];
  verificationResults: FixAttemptRecord["verificationResults"];
  revalidation?: RevalidationRecord | undefined;
  outcome: FixAttemptRecord["outcome"];
  planId: string;
  diagnostics: Diagnostic[];
}): Promise<{
  prSummaryPath?: string;
  pr?: FixAttemptRecord["pr"];
  finalStatus: FixAttemptRecord["status"];
  externalSideEffects: string[];
  prProofPassed: boolean;
}> {
  let prSummaryPath: string | undefined;
  let pr: FixAttemptRecord["pr"];
  let finalStatus = input.attempt.status;
  const externalSideEffects: string[] = [];
  const campaignProgressAllowed = input.outcome === "partially-resolved"
    && hasRevalidationProgress(input.revalidation)
    && input.changedFiles.length > 0
    && input.outOfScopeFiles.length === 0
    && input.verificationResults.length > 0
    && input.verificationResults.every((result) => result.passed);
  let prReadyOutcome: "resolved" | "partially-resolved" | undefined;
  if (input.outcome === "resolved") {
    prReadyOutcome = input.outcome;
  } else if (campaignProgressAllowed) {
    prReadyOutcome = "partially-resolved";
  }
  const prProofPassed = Boolean(prReadyOutcome);
  if (input.options.requirePrProof && !prProofPassed) {
    input.diagnostics.push({
      level: "error",
      code: "pr_blocked",
      message: "PR workflow requires in-scope changes, passing verification, and resolved revalidation or measurable campaign progress.",
    });
  }
  if (!input.dryRun && prReadyOutcome && input.branch) {
    prSummaryPath = await writePrReadySummary(input.context.paths, {
      attemptId: input.attempt.id,
      candidate: input.candidate,
      branch: input.branch,
      changedFiles: input.changedFiles,
      verificationResults: input.verificationResults,
      revalidation: input.revalidation,
      outcome: prReadyOutcome,
      planId: input.planId,
    });
    pr = {
      branch: input.branch,
      base: flagString(input.context.parsed.flags, "base"),
      summaryPath: prSummaryPath,
      externalSideEffects,
    };
    if (input.options.openPr) {
      const prResult = await commitPushAndOpenPr(input.context, {
        branch: input.branch,
        base: pr.base,
        title: flagString(input.context.parsed.flags, "title") ?? `${input.candidate.id}: ${input.candidate.title}`,
        bodyPath: prSummaryPath,
        commitMessage: flagString(input.context.parsed.flags, "commit-message") ?? `fix: address ${input.candidate.id}`,
        changedFiles: input.changedFiles,
      });
      if (!prResult.ok) {
        input.diagnostics.push({ level: "error", code: "pr_create_failed", message: prResult.error });
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

  return {
    ...(prSummaryPath ? { prSummaryPath } : {}),
    ...(pr ? { pr } : {}),
    finalStatus,
    externalSideEffects,
    prProofPassed,
  };
}

async function completeCandidateFixWorkflow(input: {
  context: CommandContext;
  options: FixWorkflowOptions;
  attempt: FixAttemptRecord;
  attemptPath: string;
  attempts: FixAttemptRecord[];
  attemptPaths: string[];
  planResult: Awaited<ReturnType<typeof ensureFixPlan>>;
  patchPreviewPath?: string | undefined;
  candidate: CandidateRecord;
  branch?: string | undefined;
  dryRun: boolean;
  changedFiles: string[];
  outOfScopeFiles: string[];
  allowedWriteScope: string[];
  verificationResults: FixAttemptRecord["verificationResults"];
  revalidation?: RevalidationRecord | undefined;
  outcome: FixAttemptRecord["outcome"];
  diagnostics: Diagnostic[];
}): Promise<Extract<FixWorkflowResult, { ok: true }>> {
  const prReadiness = await finalizeCandidateFixPrReadiness({
    context: input.context,
    options: input.options,
    attempt: input.attempt,
    candidate: input.candidate,
    branch: input.branch,
    dryRun: input.dryRun,
    changedFiles: input.changedFiles,
    outOfScopeFiles: input.outOfScopeFiles,
    verificationResults: input.verificationResults,
    revalidation: input.revalidation,
    outcome: input.outcome,
    planId: input.planResult.plan.id,
    diagnostics: input.diagnostics,
  });
  const {
    prSummaryPath,
    pr,
    finalStatus,
    externalSideEffects,
    prProofPassed,
  } = prReadiness;
  input.attempt.status = finalStatus;
  input.attempt.pr = pr;
  input.attempt.diagnostics = input.diagnostics;
  input.attempt.updatedAt = new Date().toISOString();
  await writeFixAttempt(input.context.paths, input.attempt);

  const blockedPr = input.options.requirePrProof && !prProofPassed;
  return {
    ok: true,
    exitCode: finalStatus === "failed" || finalStatus === "scope-failed" || blockedPr ? 3 : 0,
    data: {
      attempt: input.attempt,
      attemptPath: input.attemptPath,
      attempts: input.attempts,
      attemptPaths: input.attemptPaths,
      planPath: input.planResult.path,
      ...(input.patchPreviewPath ? { patchPreviewPath: input.patchPreviewPath } : {}),
      ...(prSummaryPath ? { prSummaryPath } : {}),
      changedFiles: input.changedFiles,
      outOfScopeFiles: input.outOfScopeFiles,
      allowedWriteScope: input.allowedWriteScope,
      ...(input.revalidation ? { revalidation: input.revalidation } : {}),
      ...(pr ? { pr } : {}),
      externalSideEffects,
      next: nextFixWorkflowStep({
        dryRun: input.dryRun,
        outcome: input.outcome,
        options: input.options,
        pr,
      }),
    },
  };
}

async function finishCandidateFixWorkflow(input: {
  context: CommandContext;
  options: FixWorkflowOptions;
  attempts: FixAttemptRecord[];
  attemptPaths: string[];
  planResult: Awaited<ReturnType<typeof ensureFixPlan>>;
  candidate: CandidateRecord;
  branch?: string | undefined;
  dryRun: boolean;
  allowedWriteScope: string[];
  revalidation?: RevalidationRecord | undefined;
  diagnostics: Diagnostic[];
}): Promise<FixWorkflowResult> {
  const attempt = input.attempts.at(-1);
  const attemptPath = input.attemptPaths.at(-1);
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
  const outcome = attempt.outcome;
  input.diagnostics.push(...attempt.diagnostics);

  return completeCandidateFixWorkflow({
    context: input.context,
    options: input.options,
    attempt,
    attemptPath,
    attempts: input.attempts,
    attemptPaths: input.attemptPaths,
    planResult: input.planResult,
    candidate: input.candidate,
    branch: input.branch,
    dryRun: input.dryRun,
    changedFiles,
    outOfScopeFiles,
    allowedWriteScope: input.allowedWriteScope,
    verificationResults,
    revalidation: input.revalidation,
    outcome,
    diagnostics: input.diagnostics,
    patchPreviewPath,
  });
}

type CandidateFixRetryState = {
  candidate: CandidateRecord;
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
  remainingEvidence: EvidenceRecord[];
};

type CandidateFixAttemptRunResult = {
  ok: true;
  attempts: FixAttemptRecord[];
  attemptPaths: string[];
  lastRevalidation?: RevalidationRecord | undefined;
  diagnostics: Diagnostic[];
} | Extract<FixWorkflowResult, { ok: false }>;

type CandidateFixAttemptLoopState = {
  currentCandidate: CandidateRecord;
  currentEvidence: EvidenceRecord[];
  currentFeatures: FeatureRecord[];
  remainingEvidence: EvidenceRecord[];
};

type CandidateFixAttemptProof = {
  status: FixAttemptRecord["status"];
  outcome: FixAttemptRecord["outcome"];
  changedFiles: string[];
  outOfScopeFiles: string[];
  revalidation?: RevalidationRecord | undefined;
  verificationResults: FixAttemptRecord["verificationResults"];
};

type ProveCandidateFixAttemptInput = {
  context: CommandContext;
  preflight: CandidateFixWorkflowPreflight;
  state: CandidateFixAttemptLoopState;
  execution: CandidateFixAttemptExecution;
  attemptId: string;
  attemptNumber: number;
  maxAttempts: number;
  revalidationRequired: boolean;
};

type CandidateFixAttemptCycleResult = {
  ok: true;
  retry: boolean;
  revalidation?: RevalidationRecord | undefined;
  nextState?: CandidateFixAttemptLoopState | undefined;
} | Extract<FixWorkflowResult, { ok: false }>;

type RecordCandidateFixAttemptCycleInput = {
  context: CommandContext;
  options: FixWorkflowOptions;
  preflight: CandidateFixWorkflowPreflight;
  state: CandidateFixAttemptLoopState;
  execution: CandidateFixAttemptExecution;
  proof: CandidateFixAttemptProof;
  attemptId: string;
  attemptNumber: number;
  maxAttempts: number;
  revalidationRequired: boolean;
  attempts: FixAttemptRecord[];
  attemptPaths: string[];
  previousAttemptSummaries: FixWorkerPreviousAttempt[];
};

type RunCandidateFixAttemptCycleInput = Omit<RecordCandidateFixAttemptCycleInput, "execution" | "proof" | "attemptId"> & {
  workflowId: string;
};

async function refreshCandidateFixRetryState(
  paths: StatePaths,
  findingId: string,
  currentCandidate: CandidateRecord,
  revalidation: RevalidationRecord | undefined,
): Promise<CandidateFixRetryState> {
  const latestCandidates = await readLatestCandidates(paths);
  const evidence = await readLatestEvidence(paths);
  const features = await readLatestFeatures(paths);
  const candidate = latestCandidates.find((item) => item.findingId === findingId) ?? currentCandidate;
  const evidenceIds = revalidation?.evidenceIds.length ? revalidation.evidenceIds : candidate.evidenceIds;

  return {
    candidate,
    evidence,
    features,
    remainingEvidence: evidenceForIds(evidence, evidenceIds),
  };
}

async function proveCandidateFixAttempt(input: ProveCandidateFixAttemptInput): Promise<CandidateFixAttemptProof> {
  const { context, preflight, state, execution, attemptId, attemptNumber, maxAttempts, revalidationRequired } = input;
  const { resolved, dryRun, verificationCommands, scopeContext } = preflight;
  const { allowedWriteScope, dirtyBefore, patchPath, statePrefix } = scopeContext;
  const { attemptDiagnostics, worker, diffBeforeAttempt } = execution;
  let { status, changedFiles } = execution;
  let verificationResults: FixAttemptRecord["verificationResults"] = [];
  let revalidation: RevalidationRecord | undefined;

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
  status = applyFixAttemptExecutionGuards({
    dryRun,
    changedFiles,
    diffAfterAttempt,
    diffBeforeAttempt,
    outOfScopeFiles,
    workerTimedOut: Boolean(worker?.timedOut),
    status,
    attemptDiagnostics,
  });
  if (!dryRun && status !== "failed" && outOfScopeFiles.length === 0) {
    verificationResults = await runFixVerification(context.paths, attemptId, verificationCommands);
    status = verificationResults.every((result) => result.passed) ? "passed" : "failed";
  }
  if (!dryRun && revalidationRequired && outOfScopeFiles.length === 0) {
    const record = await revalidateFixTarget(context, resolved.findingId, {
      previousEvidence: state.currentEvidence,
      changedFiles,
    });
    revalidation = record.revalidation;
    attemptDiagnostics.push(...record.diagnostics);
  }

  const classifiedOutcome = classifyFixOutcome({ dryRun, status, outOfScopeFiles, verificationResults, revalidation, requireRevalidation: revalidationRequired });
  const outcome = enforceFixAttemptRetryLimit({
    dryRun,
    hasPatchPath: Boolean(patchPath),
    attemptNumber,
    maxAttempts,
    outcome: classifiedOutcome,
    revalidation,
    verificationResults,
    attemptDiagnostics,
  });
  if (outcome === "needs_human" && status !== "failed" && status !== "scope-failed" && !dryRun) {
    status = "failed";
  }

  return { status, outcome, changedFiles, outOfScopeFiles, revalidation, verificationResults };
}

async function recordCandidateFixAttemptCycle(input: RecordCandidateFixAttemptCycleInput): Promise<CandidateFixAttemptCycleResult> {
  const { context, options, preflight, state, execution, proof, attemptId, attemptNumber, maxAttempts } = input;
  const { resolved, dryRun, verificationCommands, scopeContext } = preflight;
  const { planResult, allowedWriteScope, dirtyBefore, patchPath } = scopeContext;
  const retry = await recordCandidateFixAttemptAndDecideRetry({
    context,
    command: options.command,
    attempts: input.attempts,
    attemptPaths: input.attemptPaths,
    previousAttemptSummaries: input.previousAttemptSummaries,
    attemptId,
    resolved,
    planId: planResult.plan.id,
    status: proof.status,
    outcome: proof.outcome,
    dryRun,
    patchPath,
    attemptNumber,
    maxAttempts,
    dirtyBefore,
    allowedWriteScope,
    outOfScopeFiles: proof.outOfScopeFiles,
    revalidation: proof.revalidation,
    revalidationRequired: input.revalidationRequired,
    changedFiles: proof.changedFiles,
    patchPreviewPath: execution.patchPreviewPath,
    verificationCommands,
    verificationResults: proof.verificationResults,
    worker: execution.worker,
    attemptDiagnostics: execution.attemptDiagnostics,
  });
  if (!retry) {
    return { ok: true, retry, revalidation: proof.revalidation };
  }

  const retryState = await refreshCandidateFixRetryState(context.paths, resolved.findingId, state.currentCandidate, proof.revalidation);
  return {
    ok: true,
    retry,
    revalidation: proof.revalidation,
    nextState: {
      currentCandidate: retryState.candidate,
      currentEvidence: retryState.evidence,
      currentFeatures: retryState.features,
      remainingEvidence: retryState.remainingEvidence,
    },
  };
}

async function runCandidateFixAttemptCycle(input: RunCandidateFixAttemptCycleInput): Promise<CandidateFixAttemptCycleResult> {
  const {
    context,
    options,
    preflight,
    state,
    workflowId,
    attemptNumber,
    maxAttempts,
    revalidationRequired,
    attempts,
    attemptPaths,
    previousAttemptSummaries,
  } = input;
  const { config, dryRun, verificationCommands, scopeContext } = preflight;
  const { planResult, allowedWriteScope, patchPath } = scopeContext;
  const attemptId = maxAttempts > 1 ? `${workflowId}-${String(attemptNumber).padStart(2, "0")}` : workflowId;
  const execution = await executeCandidateFixAttempt({
    context,
    config,
    dryRun,
    patchPath,
    attemptId,
    attemptNumber,
    maxAttempts,
    previousAttemptSummaries,
    currentCandidate: state.currentCandidate,
    planContent: planResult.plan.content,
    currentEvidence: state.currentEvidence,
    currentFeatures: state.currentFeatures,
    remainingEvidence: state.remainingEvidence,
    allowedWriteScope,
    verificationCommands,
  });
  if (!execution.ok) {
    return execution;
  }
  const proof = await proveCandidateFixAttempt({ context, preflight, state, execution, attemptId, attemptNumber, maxAttempts, revalidationRequired });

  return recordCandidateFixAttemptCycle({
    context,
    options,
    preflight,
    state,
    execution,
    proof,
    attemptId,
    attemptNumber,
    maxAttempts,
    revalidationRequired,
    attempts,
    attemptPaths,
    previousAttemptSummaries,
  });
}

async function runCandidateFixAttempts(input: {
  context: CommandContext;
  options: FixWorkflowOptions;
  preflight: CandidateFixWorkflowPreflight;
  workflowId: string;
  maxAttempts: number;
  revalidationRequired: boolean;
}): Promise<CandidateFixAttemptRunResult> {
  const {
    context,
    options,
    preflight,
    workflowId,
    maxAttempts,
    revalidationRequired,
  } = input;
  const diagnostics: Diagnostic[] = [];
  let loopState: CandidateFixAttemptLoopState = {
    currentCandidate: preflight.resolved.candidate,
    currentEvidence: preflight.state.evidence,
    currentFeatures: preflight.state.features,
    remainingEvidence: evidenceForIds(preflight.state.evidence, preflight.resolved.candidate.evidenceIds),
  };
  const attempts: FixAttemptRecord[] = [];
  const attemptPaths: string[] = [];
  const previousAttemptSummaries: FixWorkerPreviousAttempt[] = [];
  let lastRevalidation: RevalidationRecord | undefined;

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    const result = await runCandidateFixAttemptCycle({
      context,
      options,
      preflight,
      state: loopState,
      workflowId,
      attemptNumber,
      maxAttempts,
      revalidationRequired,
      attempts,
      attemptPaths,
      previousAttemptSummaries,
    });
    if (!result.ok) {
      return result;
    }
    lastRevalidation = result.revalidation;
    if (!result.retry) {
      break;
    }
    if (result.nextState) {
      loopState = result.nextState;
    }
  }

  return {
    ok: true,
    attempts,
    attemptPaths,
    lastRevalidation,
    diagnostics,
  };
}

async function runCandidateFixWorkflow(
  context: CommandContext,
  target: string,
  options: FixWorkflowOptions,
): Promise<FixWorkflowResult> {
  const preflight = await prepareCandidateFixWorkflow(context, target, options);
  if (!preflight.ok) {
    return preflight;
  }
  const { config, resolved, dryRun, scopeContext, branch } = preflight;
  const { planResult, allowedWriteScope, patchPath } = scopeContext;
  const workflowId = timestampId("fix");
  const maxAttempts = (!dryRun && !patchPath)
    ? Math.max(1, config.fixExecution.maxAttempts)
    : 1;
  await mkdir(context.paths.fixesDir, { recursive: true });

  const attemptRun = await runCandidateFixAttempts({
    context,
    options,
    preflight,
    workflowId,
    maxAttempts,
    revalidationRequired: flagBoolean(context.parsed.flags, "revalidate") || options.createBranch || options.requirePrProof,
  });
  if (!attemptRun.ok) {
    return attemptRun;
  }

  return finishCandidateFixWorkflow({
    context,
    options,
    attempts: attemptRun.attempts,
    attemptPaths: attemptRun.attemptPaths,
    planResult,
    candidate: resolved.candidate,
    branch,
    dryRun,
    allowedWriteScope,
    revalidation: attemptRun.lastRevalidation,
    diagnostics: attemptRun.diagnostics,
  });
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
    "- Do not run test, build, typecheck, package, npm install, or verification commands.",
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
    "Deepclean will run these verification commands after you stop; do not run them yourself:",
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
  options: {
    previousEvidence?: EvidenceRecord[];
    changedFiles?: string[];
  } = {},
): Promise<{ revalidation: RevalidationRecord; diagnostics: Diagnostic[] }> {
  const beforeFindings = await readFindings(context.paths);
  const finding = beforeFindings.find((item) => item.id === findingId);
  const scan = await executeScan(context, { synthesize: false });
  const currentEvidence = await readEvidence(context.paths, scan.runId).catch(() => []);
  const revalidation = await classifyRevalidation({
    root: context.paths.root,
    finding,
    currentCandidates: scan.data.candidates,
    runId: scan.runId,
    createdAt: new Date().toISOString(),
    previousEvidence: options.previousEvidence ?? [],
    currentEvidence,
    changedFiles: options.changedFiles ?? scan.data.scope.changedPaths,
  });
  await writeRevalidation(context.paths, revalidation);
  return { revalidation, diagnostics: scan.diagnostics };
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

async function currentGitBranch(root: string): Promise<string | undefined> {
  return execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, timeout: 5000 })
    .then((result) => result.stdout.trim())
    .catch(() => undefined);
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
      kind: "patch-started",
      command,
      createdAt: now,
      data: {
        candidateId: attempt.candidateId,
        dryRun: attempt.dryRun,
        branch: attempt.branch,
        allowedWriteScope: attempt.allowedWriteScope,
      },
    },
    ...(!attempt.dryRun && attempt.changedFiles.length > 0
      ? [{
        schemaVersion,
        recordType: "lifecycle_event" as const,
        id: timestampId("event"),
        targetType: "fix_attempt" as const,
        targetId: attempt.id,
        findingId: attempt.findingId,
        kind: "patch-applied" as const,
        command,
        createdAt: now,
        data: { changedFiles: attempt.changedFiles },
      }]
      : []),
    ...((attempt.outOfScopeFiles?.length ?? 0) > 0
      ? [{
        schemaVersion,
        recordType: "lifecycle_event" as const,
        id: timestampId("event"),
        targetType: "fix_attempt" as const,
        targetId: attempt.id,
        findingId: attempt.findingId,
        kind: "scope-failed" as const,
        command,
        createdAt: now,
        data: { outOfScopeFiles: attempt.outOfScopeFiles },
      }]
      : []),
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
      : !attempt.dryRun
        ? [{
          schemaVersion,
          recordType: "lifecycle_event" as const,
          id: timestampId("event"),
          targetType: "fix_attempt" as const,
          targetId: attempt.id,
          findingId: attempt.findingId,
          kind: "unverified" as const,
          command,
          createdAt: now,
          data: { status: attempt.status },
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

async function writeFixRefusalLifecycleEvent(
  paths: StatePaths,
  options: {
    findingId: string;
    candidateId?: string | undefined;
    command: "fix" | "work";
    code: string;
    message: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await writeLifecycleEvents(paths, [{
    schemaVersion,
    recordType: "lifecycle_event",
    id: timestampId("event"),
    targetType: "finding",
    targetId: options.findingId,
    findingId: options.findingId,
    kind: "fix-refused",
    command: options.command,
    createdAt: now,
    data: {
      candidateId: options.candidateId,
      code: options.code,
      message: options.message,
    },
  }]);
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
  const overrides = [
    ...flagStrings(context.parsed.flags, "verification"),
    ...flagStrings(context.parsed.flags, "verification-command"),
  ].filter((command) => command.length > 0);
  if (overrides.length > 0) {
    return overrides;
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
  const env = await proofCommandEnvironment(paths.root);
  for (const [index, command] of commandsToRun.entries()) {
    const startedAt = Date.now();
    const outputPath = path.join(paths.fixesDir, `${attemptId}-verification-${String(index + 1).padStart(2, "0")}.txt`);
    const result = await execFileAsync("sh", ["-lc", command], { cwd: paths.root, env, timeout: 120_000 })
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
      durationMs: Date.now() - startedAt,
      summary: summarizeVerificationOutput(result.output, result.exitCode),
      outputPath,
    });
  }
  return results;
}

async function proofCommandEnvironment(root: string): Promise<NodeJS.ProcessEnv> {
  const env = { ...process.env };
  const virtualenvBin = path.join(root, ".venv", "bin");
  if (await directoryExists(virtualenvBin)) {
    prependPathEntry(env, virtualenvBin);
  }
  return env;
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

function prependPathEntry(env: NodeJS.ProcessEnv, entry: string): void {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const current = env[pathKey];
  if (!current) {
    env[pathKey] = entry;
    return;
  }
  const entries = current.split(path.delimiter);
  if (entries.includes(entry)) {
    return;
  }
  env[pathKey] = [entry, ...entries].join(path.delimiter);
}

function summarizeVerificationOutput(output: string, exitCode: number): string {
  const normalized = output.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return exitCode === 0 ? "Command completed successfully with no output." : `Command failed with exit ${exitCode} and no output.`;
  }
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

async function candidateForHistoryLookup(
  paths: StatePaths,
  id: string,
  runId?: string | undefined,
): Promise<CandidateRecord | undefined> {
  if (runId) {
    return resolveCandidateFromRunState(await readCandidates(paths, runId).catch(() => []), id);
  }
  const latest = await readLatestCandidates(paths);
  const inLatest = resolveCandidateFromRunState(latest, id);
  if (inLatest) {
    return inLatest;
  }
  const runs = await readRuns(paths);
  for (const run of [...runs].reverse()) {
    const candidates = await readCandidates(paths, run.id).catch(() => []);
    const found = resolveCandidateFromRunState(candidates, id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function resolveCandidateFromRunState(candidates: CandidateRecord[], id: string): CandidateRecord | undefined {
  return candidates.find((candidate) => candidate.id === id)
    ?? candidates.find((candidate) => candidate.findingId === id)
    ?? candidates.find((candidate) => candidate.id === id || candidate.findingId === id);
}

async function findingForId(paths: StatePaths, findingId: string): Promise<FindingRecord | undefined> {
  return (await readFindings(paths)).find((finding) => finding.id === findingId);
}

async function ensureLifecycleStateMigration(
  paths: StatePaths,
  runIdOverride?: string,
): Promise<Diagnostic[]> {
  const runId = runIdOverride ?? await latestRunId(paths);
  if (!runId) {
    return [];
  }
  const [candidates, findings, evidence, runs] = await Promise.all([
    readCandidates(paths, runId).catch(() => []),
    readFindings(paths),
    readEvidence(paths, runId).catch(() => []),
    readRuns(paths),
  ]);
  if (candidates.length === 0) {
    return [];
  }

  const requiresMigration = candidates.some((candidate) => (
    !candidate.findingId || !candidate.signature || !candidate.lifecycleState || !candidate.identityConfidence
  ));
  if (!requiresMigration) {
    return [];
  }

  const observedAt = runs.find((run) => run.id === runId)?.completedAt ?? new Date().toISOString();
  const identity = attachStableIdentity({
    runId,
    candidates,
    evidence,
    existingFindings: findings,
    observedAt,
  });
  await writeCandidates(paths, runId, identity.candidates);
  await writeFindings(paths, identity.findings);
  await writeCandidateObservations(paths, runId, identity.observations);
  await writeLifecycleEvents(paths, identity.lifecycleEvents);
  await writeIdentityMatches(paths, identity.identityMatches);

  return [{
    level: "info",
    code: "alpha_state_migrated",
    message: `Migrated ${candidates.length} candidate records into lifecycle-aware finding state for ${runId}.`,
    adapter: "state",
  }, ...identity.diagnostics];
}

async function resolveRevalidationTargets(
  paths: StatePaths,
  target: string,
  findings: Awaited<ReturnType<typeof readFindings>>,
): Promise<{
  type: "finding" | "candidate" | "theme" | "all";
  findings: Awaited<ReturnType<typeof readFindings>>;
  clusterId?: string;
  forceNeedsHuman?: string;
  diagnostics: Diagnostic[];
}> {
  if (target === "all") {
    return {
      type: "all",
      findings: findings.filter((finding) => openFindingForRevalidation(finding)),
      diagnostics: [],
    };
  }
  const clusters = await readLatestClusters(paths).catch(() => []);
  const cluster = clusters.find((item) => item.id === target);
  if (cluster) {
    const candidateIds = new Set(cluster.candidateIds);
    const latestCandidates = await readLatestCandidates(paths).catch(() => []);
    const findingIds = new Set(latestCandidates
      .filter((candidate) => candidateIds.has(candidate.id) && candidate.findingId)
      .map((candidate) => candidate.findingId as string));
    const targetFindings = findings.filter((finding) => findingIds.has(finding.id) && openFindingForRevalidation(finding));
    return {
      type: "theme",
      clusterId: cluster.id,
      findings: targetFindings,
      ...(cluster.actionability === "too-broad"
        ? { forceNeedsHuman: `${cluster.id} is too broad for deterministic revalidation; split it into bounded findings first.` }
        : {}),
      diagnostics: cluster.actionability === "too-broad"
        ? [{
          level: "warning",
          code: "theme_too_broad",
          message: `${cluster.id} is too broad for deterministic revalidation.`,
        }]
        : [],
    };
  }
  if (target.startsWith("candidate-")) {
    const candidate = await candidateForHistoryLookup(paths, target, undefined);
    return {
      type: "candidate",
      findings: candidate?.findingId
        ? findings.filter((finding) => finding.id === candidate.findingId)
        : [],
      diagnostics: [],
    };
  }
  return {
    type: "finding",
    findings: findings.filter((finding) => finding.id === target),
    diagnostics: [],
  };
}

function openFindingForRevalidation(finding: FindingRecord): boolean {
  if (finding.status === "ignored" || finding.status === "false-positive") {
    return false;
  }
  return !["resolved", "suppressed", "superseded", "fixed"].includes(finding.lifecycleState);
}

function scopedRevalidationContext(
  context: CommandContext,
  findings: FindingRecord[],
): CommandContext {
  if (flagString(context.parsed.flags, "paths") || findings.length === 0) {
    return context;
  }
  const primaryPaths = uniqueNormalized(findings.flatMap((finding) => [
    ...finding.files.map((file) => file.path),
    ...finding.signature.components.primaryAnchors.map((file) => file.path),
  ]));
  if (primaryPaths.length === 0) {
    return context;
  }
  return {
    ...context,
    parsed: {
      ...context.parsed,
      flags: {
        ...context.parsed.flags,
        paths: primaryPaths.join(","),
      },
    },
  };
}

function withReviewPrScope(context: CommandContext, base: string, head: string): CommandContext {
  return {
    ...context,
    parsed: {
      ...context.parsed,
      flags: {
        ...context.parsed.flags,
        "merge-base": flagString(context.parsed.flags, "merge-base") ?? base,
        head,
        "local-only": true,
        "evidence-only": true,
      },
    },
  };
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
    ["identity-matches", paths.identityMatchesDir],
    ["revalidations", paths.revalidationsDir],
    ["ci", paths.ciDir],
    ["opportunities", paths.opportunitiesDir],
    ["campaigns", paths.campaignsDir],
    ["quality-profiles", paths.qualityProfilesDir],
    ["quality-results", paths.qualityResultsDir],
    ["analyzer-setup", paths.analyzerSetupDir],
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

interface StateIntegritySummary {
  valid: boolean;
  partialRecords: number;
  duplicateIds: number;
  alphaRecords: number;
  diagnostics: Diagnostic[];
}

interface StateIntegrityDirectory {
  name: string;
  dir: string;
  arrayRecords?: boolean;
  alphaCandidates?: boolean;
}

type StateRecordReadResult =
  | { ok: true; parsed: unknown }
  | { ok: false; diagnostic: Diagnostic };

function stateIntegrityDirectories(paths: StatePaths): StateIntegrityDirectory[] {
  return [
    { name: "runs", dir: paths.runsDir },
    { name: "findings", dir: paths.findingsDir },
    { name: "observations", dir: paths.observationsDir, arrayRecords: true },
    { name: "features", dir: paths.featuresDir, arrayRecords: true },
    { name: "evidence", dir: paths.evidenceDir, arrayRecords: true },
    { name: "candidates", dir: paths.candidatesDir, arrayRecords: true, alphaCandidates: true },
    { name: "clusters", dir: paths.clustersDir, arrayRecords: true },
    { name: "reports", dir: paths.reportsDir },
    { name: "triage", dir: paths.triageDir },
    { name: "handoffs", dir: paths.handoffsDir },
    { name: "plans", dir: paths.plansDir },
    { name: "lifecycle", dir: paths.lifecycleDir },
    { name: "identity-matches", dir: paths.identityMatchesDir },
    { name: "revalidations", dir: paths.revalidationsDir },
    { name: "ci", dir: paths.ciDir },
    { name: "opportunities", dir: paths.opportunitiesDir, arrayRecords: true },
    { name: "campaigns", dir: paths.campaignsDir },
    { name: "quality-profiles", dir: paths.qualityProfilesDir },
    { name: "quality-results", dir: paths.qualityResultsDir },
    { name: "analyzer-setup", dir: paths.analyzerSetupDir },
    { name: "retention", dir: paths.retentionDir },
    { name: "fixes", dir: paths.fixesDir },
    { name: "synthesis", dir: paths.synthesisDir },
  ];
}

async function readStateRecordFile(filePath: string, relativePath: string): Promise<StateRecordReadResult> {
  try {
    const raw = await readFile(filePath, "utf8");
    if (raw.trim().length === 0) {
      throw new Error("file is empty");
    }
    return { ok: true, parsed: JSON.parse(raw) };
  } catch (error) {
    return {
      ok: false,
      diagnostic: {
        level: "error",
        code: "partial_state_record",
        message: `${relativePath} is unreadable or partially written: ${errorMessage(error)}`,
        adapter: "state",
      },
    };
  }
}

async function stateIntegrity(paths: StatePaths): Promise<StateIntegritySummary> {
  const diagnostics: Diagnostic[] = [];
  let partialRecords = 0;
  let duplicateIds = 0;
  let alphaRecords = 0;

  for (const dir of stateIntegrityDirectories(paths)) {
    let files: string[];
    try {
      files = (await readdir(dir.dir)).filter((file) => file.endsWith(".json")).sort();
    } catch {
      continue;
    }
    const seenIds = new Map<string, string>();
    for (const file of files) {
      const filePath = path.join(dir.dir, file);
      const relativePath = path.relative(paths.root, filePath) || filePath;
      const readResult = await readStateRecordFile(filePath, relativePath);
      if (!readResult.ok) {
        partialRecords += 1;
        diagnostics.push(readResult.diagnostic);
        continue;
      }

      const parsed = readResult.parsed;
      const records = Array.isArray(parsed) ? parsed : [parsed];
      if (dir.arrayRecords && !Array.isArray(parsed)) {
        partialRecords += 1;
        diagnostics.push({
          level: "error",
          code: "partial_state_record",
          message: `${relativePath} should contain an array of ${dir.name} records.`,
          adapter: "state",
        });
      }

      const idsInFile = new Map<string, number>();
      for (const record of records) {
        const object = asRecord(record);
        const id = stateRecordId(object);
        if (!id) {
          continue;
        }
        idsInFile.set(id, (idsInFile.get(id) ?? 0) + 1);
        if (!dir.arrayRecords) {
          const priorPath = seenIds.get(id);
          if (priorPath && priorPath !== relativePath) {
            duplicateIds += 1;
            diagnostics.push({
              level: "error",
              code: "duplicate_state_id",
              message: `${dir.name} state id ${id} is present in both ${priorPath} and ${relativePath}.`,
              adapter: "state",
            });
          } else {
            seenIds.set(id, relativePath);
          }
        }
        if (dir.alphaCandidates && candidateNeedsAlphaMigration(object)) {
          alphaRecords += 1;
        }
      }
      for (const [id, count] of idsInFile) {
        if (count > 1) {
          duplicateIds += 1;
          diagnostics.push({
            level: "error",
            code: "duplicate_state_id",
            message: `${relativePath} contains duplicate ${dir.name} state id ${id}.`,
            adapter: "state",
          });
        }
      }
    }
  }

  if (alphaRecords > 0) {
    diagnostics.push({
      level: "warning",
      code: "alpha_state_detected",
      message: `Found ${alphaRecords} alpha-era candidate record${alphaRecords === 1 ? "" : "s"} missing lifecycle identity fields. Run show or history to lazily migrate inspectable records.`,
      adapter: "state",
    });
  }

  return {
    valid: partialRecords === 0 && duplicateIds === 0,
    partialRecords,
    duplicateIds,
    alphaRecords,
    diagnostics,
  };
}

function stateRecordId(record: Record<string, unknown>): string | undefined {
  const id = record["id"] ?? record["featureId"];
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function candidateNeedsAlphaMigration(record: Record<string, unknown>): boolean {
  return record["recordType"] === "candidate"
    && (
      typeof record["findingId"] !== "string"
      || typeof record["signature"] !== "object"
      || typeof record["lifecycleState"] !== "string"
      || typeof record["identityConfidence"] !== "string"
    );
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
  const headRef = flagString(context.parsed.flags, "head") ?? "HEAD";
  const includeDirty = flagBoolean(context.parsed.flags, "include-dirty");
  const paths = csvFlag(context, "paths");
  const categories = csvFlag(context, "categories");
  const reviewers = csvFlag(context, "reviewers");
  const dirtyPaths = includeDirty ? await gitChangedPaths(context.paths.root, ["diff", "--name-only"]) : [];
  const untrackedPaths = includeDirty ? await gitChangedPaths(context.paths.root, ["ls-files", "--others", "--exclude-standard"]) : [];
  const committedChangedPaths = mergeBaseRef
    ? await gitMergeBaseChangedPaths(context.paths.root, mergeBaseRef, headRef)
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
    readiness: candidate.readiness ?? "fix-ready",
    status: candidate.status,
    lifecycleState: candidate.lifecycleState ?? "ready",
    baselineStatus: candidate.baselineStatus ?? "unknown",
    problem: candidate.whyItMatters,
    evidenceIds: candidate.evidenceIds,
    files: candidate.files,
    ownedFiles: candidate.ownedFiles ?? candidate.files,
    contextFiles: candidate.contextFiles ?? [],
    expectedBehavior: candidate.expectedBehavior,
    proofRequired: candidate.proofRequired ?? [],
    nonGoals: candidate.nonGoals ?? [],
    doNotTouch: candidate.doNotTouch ?? [],
    splitChildren: candidate.splitChildren ?? [],
    constraints: [
      "Keep changes scoped to this finding.",
      "Preserve behavior unless verification proves current behavior is wrong.",
    ],
    verification: candidate.verification,
  };
}

function handoffFreshnessWarnings(
  candidate: CandidateRecord,
  latestRevalidation?: CandidateProofStatus["latestRevalidation"],
): string[] {
  const warnings: string[] = [];
  const lifecycleState = candidate.lifecycleState ?? "ready";
  if ([
    "stale",
    "resolved",
    "superseded",
    "suppressed",
    "needs-human",
    "split",
    "fixed",
    "inconclusive",
  ].includes(lifecycleState)) {
    warnings.push(`Finding lifecycle state is ${lifecycleState}; revalidate before assigning implementation work.`);
  }
  if (candidate.confidence === "low") {
    warnings.push("Finding confidence is low; confirm evidence before implementation.");
  }
  if (candidate.status === "fixed" || candidate.status === "superseded" || candidate.status === "ignored" || candidate.status === "false-positive") {
    warnings.push(`Candidate status is ${candidate.status}; avoid generating implementation handoff without a fresh target.`);
  }
  if (candidate.effort === "large" || candidate.risk === "design-needed" || candidate.impact === "cross-cutting") {
    warnings.push("Finding may be too broad for one implementation handoff; split or narrow it first.");
  }
  if (latestRevalidation && latestRevalidation.outcome !== "still-open" && latestRevalidation.outcome !== "partially-resolved") {
    warnings.push(`Latest revalidation outcome is ${latestRevalidation.outcome}; follow its next action before implementation.`);
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

function qualityProfileFromCi(
  context: CommandContext,
  policy: Record<string, unknown>,
  createdAt: string,
) {
  const profileId = flagString(context.parsed.flags, "profile");
  if (!profileId) {
    return adHocQualityProfile(policy, createdAt);
  }
  if (isBuiltInQualityProfile(profileId)) {
    return builtInQualityProfile(profileId, createdAt);
  }
  throw new Error(`Unsupported quality profile: ${profileId}. Expected advisory, balanced, strict, or maintainability-only.`);
}

async function reviewPrQualityInputFromCi(context: CommandContext): Promise<ReviewPrQualityInput | undefined> {
  const reviewPrPath = flagString(context.parsed.flags, "review-pr");
  if (!reviewPrPath) {
    return undefined;
  }
  const resolved = path.resolve(context.paths.root, reviewPrPath);
  const parsed = JSON.parse(await readFile(resolved, "utf8")) as {
    targetVerdict?: ReviewPrQualityInput["targetVerdict"];
  };
  return { targetVerdict: parsed.targetVerdict ?? null };
}

function isBuiltInQualityProfile(value: string): value is BuiltInQualityProfileId {
  return ["advisory", "balanced", "strict", "maintainability-only"].includes(value);
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
    [context.paths.opportunitiesDir, "json"],
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
  await classifyRunLinkedArtifacts(context.paths, context.paths.identityMatchesDir, retainedRunIds, retainedPaths, deletePaths, ["json"]);
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

function sourceSafeOpportunity(opportunity: PrOpportunityRecord): Record<string, unknown> {
  return {
    id: opportunity.id,
    runId: opportunity.runId,
    classification: opportunity.classification,
    status: opportunity.status,
    title: opportunity.title,
    targetCandidateIds: opportunity.targetCandidateIds,
    targetFindingIds: opportunity.targetFindingIds,
    targetClusterIds: opportunity.targetClusterIds,
    score: opportunity.score,
    confidence: opportunity.confidence,
    risk: opportunity.risk,
    ownedFiles: opportunity.ownedFiles.map((file) => ({
      path: file.path,
      ...(file.startLine ? { startLine: file.startLine } : {}),
      ...(file.endLine ? { endLine: file.endLine } : {}),
    })),
    contextFiles: opportunity.contextFiles.map((file) => ({
      path: file.path,
      ...(file.startLine ? { startLine: file.startLine } : {}),
      ...(file.endLine ? { endLine: file.endLine } : {}),
    })),
    doNotTouch: opportunity.doNotTouch,
    testsRequiredFirst: opportunity.testsRequiredFirst,
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
  qualityGateResult: QualityGateResultRecord,
): Promise<{ json?: string; markdown?: string; sarif?: string }> {
  const artifactPaths: { json?: string; markdown?: string; sarif?: string } = {};
  const output = flagString(context.parsed.flags, "output");
  if (output) {
    const markdownPath = path.resolve(context.paths.root, output);
    await mkdir(path.dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, renderCiMarkdown(scan, gate, qualityGateResult), "utf8");
    artifactPaths.markdown = markdownPath;
  }
  const sarif = flagString(context.parsed.flags, "sarif");
  if (sarif) {
    const sarifPath = path.resolve(context.paths.root, sarif);
    await mkdir(path.dirname(sarifPath), { recursive: true });
    await writeFile(sarifPath, JSON.stringify(renderCiSarif(scan.candidates, qualityGateResult), null, 2) + "\n", "utf8");
    artifactPaths.sarif = sarifPath;
  }
  return artifactPaths;
}

function renderCiMarkdown(
  scan: ScanExecutionResult["data"],
  gate: { blockingFindingIds: string[]; reasons: Array<{ findingId: string; reason: string }> },
  qualityGateResult: QualityGateResultRecord,
): string {
  return [
    "# Deepclean CI",
    "",
    `Run: ${scan.runId}`,
    `Candidates: ${scan.candidateCount}`,
    `Blocking: ${gate.blockingFindingIds.length}`,
    `Quality gate: ${qualityGateResult.status}`,
    `Profile: ${qualityGateResult.profileId}`,
    "",
    "## Blocking Findings",
    "",
    ...(
      gate.reasons.length > 0
        ? gate.reasons.map((reason) => `- ${reason.findingId}: ${reason.reason}`)
        : ["None"]
    ),
    "",
    "## Quality Blockers",
    "",
    ...(
      qualityGateResult.blockers.length > 0
        ? qualityGateResult.blockers.map((finding) => `- ${finding.id}: ${finding.title} - ${finding.summary}`)
        : ["None"]
    ),
    "",
    "## Quality Advisories",
    "",
    ...(
      qualityGateResult.advisories.length > 0
        ? qualityGateResult.advisories.map((finding) => `- ${finding.id}: ${finding.title} - ${finding.summary}`)
        : ["None"]
    ),
    "",
  ].join("\n");
}

function renderCiSarif(candidates: CandidateRecord[], qualityGateResult?: QualityGateResultRecord): unknown {
  const qualityFindings = qualityGateResult ? [...qualityGateResult.blockers, ...qualityGateResult.advisories] : [];
  return {
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "Deepclean" } },
      results: [
        ...candidates.map((candidate) => ({
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
        ...qualityFindings.map((finding) => ({
          ruleId: `deepclean/quality/${finding.family}`,
          level: finding.severity === "blocker" ? "error" : "note",
          message: { text: `${finding.id}: ${finding.title}. ${finding.summary}` },
          locations: finding.files.slice(0, 1).map((file) => ({
            physicalLocation: {
              artifactLocation: { uri: file.path },
              region: { startLine: file.startLine ?? 1, endLine: file.endLine ?? file.startLine ?? 1 },
            },
          })),
          properties: {
            profileId: qualityGateResult?.profileId,
            candidateIds: finding.candidateIds,
            findingIds: finding.findingIds,
            opportunityIds: finding.opportunityIds,
            analyzerRuleIds: finding.analyzerRuleIds,
            baselineStatus: finding.baselineStatus,
          },
        })),
      ],
    }],
  };
}

function numberPolicy(policy: Record<string, unknown>, key: string): number | undefined {
  const value = policy[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function gitMergeBaseChangedPaths(root: string, ref: string, head = "HEAD"): Promise<string[]> {
  try {
    const mergeBase = await gitMergeBase(root, ref, head);
    return mergeBase ? gitChangedPaths(root, ["diff", "--name-only", `${mergeBase}...${head}`]) : [];
  } catch {
    return [];
  }
}

async function reviewPrChangedPaths(root: string, ref: string, head = "HEAD"): Promise<{ ok: true; paths: string[] } | { ok: false; message: string }> {
  try {
    const mergeBase = await gitMergeBase(root, ref, head);
    if (!mergeBase) {
      return { ok: false, message: `Could not resolve merge base for ${ref} and ${head}.` };
    }
    const { stdout } = await execFileAsync("git", ["diff", "--name-only", `${mergeBase}...${head}`], { cwd: root, timeout: 5000 });
    return { ok: true, paths: uniqueNormalized(stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function gitMergeBase(root: string, ref: string, head = "HEAD"): Promise<string> {
  const { stdout } = await execFileAsync("git", ["merge-base", ref, head], { cwd: root, timeout: 5000 });
  return stdout.trim();
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
    ["identity-matches", paths.identityMatchesDir],
    ["revalidations", paths.revalidationsDir],
    ["ci", paths.ciDir],
    ["opportunities", paths.opportunitiesDir],
    ["campaigns", paths.campaignsDir],
    ["quality-profiles", paths.qualityProfilesDir],
    ["quality-results", paths.qualityResultsDir],
    ["analyzer-setup", paths.analyzerSetupDir],
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
  outcome: RevalidationRecord["outcome"],
): "still-open" | "partially-resolved" | "resolved" | "stale" | "superseded" | "needs-human" {
  switch (outcome) {
    case "resolved":
      return "resolved";
    case "partially-resolved":
      return "partially-resolved";
    case "still-open":
      return "still-open";
    case "stale":
      return "stale";
    case "superseded":
      return "superseded";
    case "needs-human":
    case "inconclusive":
      return "needs-human";
  }
}

function revalidationOutcomeToStatus(
  outcome: RevalidationRecord["outcome"],
  fallback: CandidateRecord["status"],
): CandidateRecord["status"] {
  switch (outcome) {
    case "resolved":
      return "fixed";
    case "stale":
      return "stale";
    case "superseded":
      return "superseded";
    case "needs-human":
    case "inconclusive":
    case "partially-resolved":
    case "still-open":
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

async function packageUpdateStatus(context: CommandContext, currentVersion: string): Promise<PackageUpdateStatus> {
  const packageName = "@fraction12/deepclean";
  const channel = flagString(context.parsed.flags, "update-channel") ?? "latest";
  const updateCommand = channel === "latest" ? `npm install -g ${packageName}` : `npm install -g ${packageName}@${channel}`;
  const skipReason = packageUpdateSkipReason(context);
  if (skipReason) {
    return {
      packageName,
      channel,
      currentVersion,
      stale: false,
      checked: false,
      skippedReason: skipReason,
      updateCommand,
    };
  }

  try {
    const latestVersion = await latestPackageVersion(packageName, channel);
    return {
      packageName,
      channel,
      currentVersion,
      latestVersion,
      stale: comparePackageVersions(currentVersion, latestVersion) < 0,
      checked: true,
      updateCommand,
    };
  } catch (error) {
    return {
      packageName,
      channel,
      currentVersion,
      stale: false,
      checked: false,
      error: error instanceof Error ? error.message : String(error),
      updateCommand,
    };
  }
}

function packageUpdateSkipReason(context: CommandContext): string | undefined {
  if (flagBoolean(context.parsed.flags, "no-update-check")) {
    return "disabled by --no-update-check";
  }
  if (flagBoolean(context.parsed.flags, "offline")) {
    return "offline mode";
  }
  if (flagBoolean(context.parsed.flags, "local-only")) {
    return "local-only mode";
  }
  return undefined;
}

async function latestPackageVersion(packageName: string, channel: string): Promise<string> {
  if (process.env["DEEPCLEAN_UPDATE_CHECK_ERROR"]) {
    throw new Error(process.env["DEEPCLEAN_UPDATE_CHECK_ERROR"]);
  }
  if (process.env["DEEPCLEAN_UPDATE_CHECK_LATEST_VERSION"]) {
    return process.env["DEEPCLEAN_UPDATE_CHECK_LATEST_VERSION"];
  }
  const { stdout } = await execFileAsync("npm", ["view", `${packageName}@${channel}`, "version"], {
    timeout: 5000,
    maxBuffer: 64 * 1024,
  });
  const version = stdout.trim().replace(/^"|"$/g, "");
  if (!version) {
    throw new Error(`No version returned for ${packageName}@${channel}`);
  }
  return version;
}

function comparePackageVersions(left: string, right: string): number {
  const parsedLeft = parsePackageVersion(left);
  const parsedRight = parsePackageVersion(right);
  for (const key of ["major", "minor", "patch"] as const) {
    const delta = parsedLeft[key] - parsedRight[key];
    if (delta !== 0) {
      return delta < 0 ? -1 : 1;
    }
  }
  if (!parsedLeft.prerelease.length && !parsedRight.prerelease.length) {
    return 0;
  }
  if (!parsedLeft.prerelease.length) {
    return 1;
  }
  if (!parsedRight.prerelease.length) {
    return -1;
  }
  const length = Math.max(parsedLeft.prerelease.length, parsedRight.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = parsedLeft.prerelease[index];
    const rightPart = parsedRight.prerelease[index];
    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }
    const delta = comparePrereleasePart(leftPart, rightPart);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function comparePrereleasePart(left: string, right: string): number {
  const leftNumber = /^[0-9]+$/.test(left) ? Number(left) : undefined;
  const rightNumber = /^[0-9]+$/.test(right) ? Number(right) : undefined;
  if (leftNumber !== undefined && rightNumber !== undefined) {
    return Math.sign(leftNumber - rightNumber);
  }
  if (leftNumber !== undefined) {
    return -1;
  }
  if (rightNumber !== undefined) {
    return 1;
  }
  return left.localeCompare(right);
}

function parsePackageVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
} {
  const [core = "0.0.0", prerelease = ""] = version.split("+")[0]?.split("-", 2) ?? [];
  const [major = 0, minor = 0, patch = 0] = core.split(".").map((part) => Number.parseInt(part, 10));
  return {
    major: Number.isFinite(major) ? major : 0,
    minor: Number.isFinite(minor) ? minor : 0,
    patch: Number.isFinite(patch) ? patch : 0,
    prerelease: prerelease ? prerelease.split(".") : [],
  };
}

const entryPath = process.argv[1] ? realpathSync(process.argv[1]) : undefined;
const modulePath = realpathSync(fileURLToPath(import.meta.url));
if (entryPath === modulePath) {
  process.exitCode = await main(process.argv.slice(2));
}
