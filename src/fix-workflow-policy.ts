import type { Diagnostic } from "./json.js";
import type { CandidateRecord, FixAttemptRecord, RevalidationRecord } from "./types.js";

export function applyFixAttemptExecutionGuards(input: {
  dryRun: boolean;
  changedFiles: string[];
  diffAfterAttempt: string;
  diffBeforeAttempt: string;
  outOfScopeFiles: string[];
  workerTimedOut: boolean;
  status: FixAttemptRecord["status"];
  attemptDiagnostics: Diagnostic[];
}): FixAttemptRecord["status"] {
  let status = input.status;
  if (!input.dryRun && input.changedFiles.length === 0 && status !== "failed") {
    input.attemptDiagnostics.push({
      level: "error",
      code: "fix_no_changed_files",
      message: "Patch worker completed without changing candidate-owned files.",
    });
    status = "failed";
  }
  if (!input.dryRun && input.changedFiles.length > 0 && input.diffAfterAttempt === input.diffBeforeAttempt && status !== "failed") {
    input.attemptDiagnostics.push({
      level: "error",
      code: "fix_no_retry_progress",
      message: "Patch worker did not make new candidate-owned changes on this attempt.",
    });
    status = "failed";
  }
  if (input.outOfScopeFiles.length > 0) {
    input.attemptDiagnostics.push({
      level: "error",
      code: "fix_scope_failed",
      message: `Patch changed files outside candidate scope: ${input.outOfScopeFiles.join(", ")}`,
    });
    status = "scope-failed";
  }
  if (!input.dryRun && input.workerTimedOut && input.changedFiles.length === 0) {
    status = "failed";
  }
  return status;
}

export function shouldRetryFixAttempt(options: {
  dryRun: boolean;
  hasPatchPath: boolean;
  attemptNumber: number;
  maxAttempts: number;
  changedFiles: string[];
  outOfScopeFiles: string[];
  verificationResults: FixAttemptRecord["verificationResults"];
  outcome?: FixAttemptRecord["outcome"] | undefined;
  revalidation?: RevalidationRecord | undefined;
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
  if (options.outcome === "partially-resolved" && hasRevalidationProgress(options.revalidation)) {
    return false;
  }
  return options.outcome === "still-open" || options.outcome === "partially-resolved";
}

export function hasRevalidationProgress(revalidation: RevalidationRecord | undefined): boolean {
  return Boolean(revalidation?.progress && revalidation.progress.delta > 0);
}

export function classifyFixOutcome(options: {
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
    case "resolved":
      return "resolved";
    case "partially-resolved":
      return "partially-resolved";
    case "still-open":
      return "still-open";
    case "superseded":
      return "superseded";
    case "stale":
    case "needs-human":
    case "inconclusive":
      return "needs_human";
    case undefined:
      return options.status === "passed" ? "partially-resolved" : "needs_human";
  }
}

export function enforceFixAttemptRetryLimit(options: {
  dryRun: boolean;
  hasPatchPath: boolean;
  attemptNumber: number;
  maxAttempts: number;
  outcome: FixAttemptRecord["outcome"];
  revalidation?: RevalidationRecord | undefined;
  verificationResults: FixAttemptRecord["verificationResults"];
  attemptDiagnostics: Diagnostic[];
}): FixAttemptRecord["outcome"] {
  const retryLimitReached = !options.dryRun
    && !options.hasPatchPath
    && options.attemptNumber >= options.maxAttempts
    && options.maxAttempts > 1
    && (
      options.outcome === "still-open"
      || (options.outcome === "partially-resolved" && !hasRevalidationProgress(options.revalidation))
      || options.verificationResults.some((result) => !result.passed)
    );
  if (!retryLimitReached) {
    return options.outcome;
  }
  options.attemptDiagnostics.push({
    level: "error",
    code: "fix_max_attempts_exhausted",
    message: `Candidate was not resolved after ${options.maxAttempts} fix attempts.`,
  });
  return "needs_human";
}

export function fixReadinessBlocker(candidate: CandidateRecord): { code: string; message: string } | undefined {
  if (candidate.confidence === "low") {
    return { code: "fix_low_confidence", message: "Low-confidence findings must be confirmed before fix execution." };
  }
  const lifecycleState = candidate.lifecycleState ?? "ready";
  if (["stale", "resolved", "superseded", "suppressed", "needs-human", "split", "fixed", "inconclusive"].includes(lifecycleState)) {
    return { code: "fix_not_current", message: `Finding lifecycle state is ${lifecycleState}; revalidate or choose another finding.` };
  }
  if (candidate.risk === "design-needed") {
    return { code: "fix_ambiguous", message: "Design-needed findings are too ambiguous for guarded fix execution." };
  }
  return undefined;
}
