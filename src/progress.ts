import {
  readFixAttempts,
  readLifecycleEvents,
  readRuns,
  type StatePaths,
} from "./state.js";
import type { FixAttemptRecord, LifecycleEventRecord, RunRecord } from "./types.js";

export type ProgressNet = "positive" | "weak" | "neutral";

export interface ProgressRunSummary {
  latestRunId?: string;
  previousRunId?: string;
  candidateCount?: number;
  evidenceCount?: number;
  featureCount?: number;
  candidateDelta?: number;
  evidenceDelta?: number;
  featureDelta?: number;
}

export interface ProgressFixSummary {
  attempts: number;
  resolved: number;
  partiallyResolved: number;
  stillOpen: number;
  needsHuman: number;
  verificationPassed: number;
  verificationFailed: number;
  prUrls: string[];
  changedFiles: string[];
}

export interface ProgressSplitSummary {
  parents: number;
  children: number;
  parentCandidateIds: string[];
}

export interface ProgressBlockerSummary {
  candidateId: string;
  attempts: number;
  latestOutcome?: string;
}

export interface ProgressSummary {
  eventLimit: number;
  eventCount: number;
  latestEventAt?: string;
  net: ProgressNet;
  runs: ProgressRunSummary;
  fixes: ProgressFixSummary;
  splits: ProgressSplitSummary;
  revalidation: {
    resolved: number;
    partiallyResolved: number;
    stillOpen: number;
    stale: number;
    superseded: number;
    needsHuman: number;
    fixed: number;
    changed: number;
    unchanged: number;
    inconclusive: number;
  };
  blockers: ProgressBlockerSummary[];
  notes: string[];
}

export async function buildProgressSummary(
  paths: StatePaths,
  options: { eventLimit?: number } = {},
): Promise<ProgressSummary> {
  const eventLimit = Math.max(1, Math.floor(options.eventLimit ?? 200));
  const [runs, lifecycleEvents, fixAttempts] = await Promise.all([
    readRuns(paths),
    readLifecycleEvents(paths),
    readFixAttempts(paths),
  ]);
  const recentEvents = lifecycleEvents.slice(-eventLimit);
  const recentAttempts = fixAttempts.slice(-eventLimit);

  const runsSummary = summarizeRuns(runs);
  const fixes = summarizeFixes(recentAttempts);
  const splits = summarizeSplits(recentEvents);
  const revalidation = summarizeRevalidations(recentEvents);
  const blockers = summarizeBlockers(recentAttempts);
  const notes = progressNotes({ runs: runsSummary, fixes, splits, blockers });
  const latestEventAt = recentEvents.at(-1)?.createdAt;
  const summary: ProgressSummary = {
    eventLimit,
    eventCount: recentEvents.length,
    net: classifyNet({ runs: runsSummary, fixes, splits, revalidation }),
    runs: runsSummary,
    fixes,
    splits,
    revalidation,
    blockers,
    notes,
  };
  if (latestEventAt) {
    summary.latestEventAt = latestEventAt;
  }
  return summary;
}

export function renderProgressSummary(summary: ProgressSummary): string[] {
  const lines = [`progress: ${summary.net}`];
  if (summary.runs.latestRunId) {
    const runParts = [
      `${summary.runs.candidateCount ?? 0} candidates${formatDelta(summary.runs.candidateDelta)}`,
      `${summary.runs.evidenceCount ?? 0} evidence${formatDelta(summary.runs.evidenceDelta)}`,
      `${summary.runs.featureCount ?? 0} features${formatDelta(summary.runs.featureDelta)}`,
    ];
    lines.push(`runs: ${summary.runs.latestRunId} (${runParts.join(", ")})`);
  }
  if (summary.splits.parents > 0) {
    lines.push(`advanced: ${summary.splits.parents} parent candidate${plural(summary.splits.parents)} split into ${summary.splits.children} child slice${plural(summary.splits.children)}`);
  }
  if (summary.fixes.attempts > 0) {
    lines.push(`fixes: ${summary.fixes.resolved} resolved / ${summary.fixes.attempts} recent attempt${plural(summary.fixes.attempts)}`);
  }
  const proof = proofParts(summary);
  if (proof.length > 0) {
    lines.push(`proof: ${proof.join(", ")}`);
  }
  if (summary.blockers.length > 0) {
    const blocker = summary.blockers[0]!;
    lines.push(`blocked: ${blocker.candidateId} still needs attention after ${blocker.attempts} attempt${plural(blocker.attempts)}`);
  }
  for (const note of summary.notes) {
    lines.push(`caution: ${note}`);
  }
  return lines;
}

function summarizeRuns(runs: RunRecord[]): ProgressRunSummary {
  const latest = runs.at(-1);
  const previous = runs.at(-2);
  const summary: ProgressRunSummary = {};
  if (!latest) {
    return summary;
  }
  summary.latestRunId = latest.id;
  summary.candidateCount = latest.candidateCount;
  summary.evidenceCount = latest.evidenceCount;
  if (latest.featureCount !== undefined) {
    summary.featureCount = latest.featureCount;
  }
  if (previous) {
    summary.previousRunId = previous.id;
    summary.candidateDelta = latest.candidateCount - previous.candidateCount;
    summary.evidenceDelta = latest.evidenceCount - previous.evidenceCount;
    if (latest.featureCount !== undefined && previous.featureCount !== undefined) {
      summary.featureDelta = latest.featureCount - previous.featureCount;
    }
  }
  return summary;
}

function summarizeFixes(attempts: FixAttemptRecord[]): ProgressFixSummary {
  return {
    attempts: attempts.length,
    resolved: attempts.filter((attempt) => attempt.outcome === "resolved").length,
    partiallyResolved: attempts.filter((attempt) => attempt.outcome === "partially-resolved").length,
    stillOpen: attempts.filter((attempt) => attempt.outcome === "still-open").length,
    needsHuman: attempts.filter((attempt) => attempt.outcome === "needs_human").length,
    verificationPassed: attempts.filter((attempt) => attempt.verificationResults.length > 0 && attempt.verificationResults.every((result) => result.passed)).length,
    verificationFailed: attempts.filter((attempt) => attempt.verificationResults.some((result) => !result.passed)).length,
    prUrls: unique(attempts.flatMap((attempt) => attempt.pr?.url ? [attempt.pr.url] : [])),
    changedFiles: unique(attempts.flatMap((attempt) => attempt.changedFiles)),
  };
}

function summarizeSplits(events: LifecycleEventRecord[]): ProgressSplitSummary {
  const splitEvents = events.filter((event) => event.kind === "superseded" && asRecord(event.data)["parentCandidateId"]);
  const parentCandidateIds = unique(splitEvents.map((event) => String(asRecord(event.data)["parentCandidateId"])));
  const children = splitEvents.reduce((count, event) => {
    const childCandidateIds = asRecord(event.data)["childCandidateIds"];
    return count + (Array.isArray(childCandidateIds) ? childCandidateIds.length : 0);
  }, 0);
  return {
    parents: parentCandidateIds.length,
    children,
    parentCandidateIds,
  };
}

function summarizeRevalidations(events: LifecycleEventRecord[]): ProgressSummary["revalidation"] {
  const outcomes = events
    .filter((event) => event.kind === "revalidated")
    .map((event) => asRecord(event.data)["outcome"]);
  return {
    resolved: outcomes.filter((outcome) => outcome === "resolved" || outcome === "fixed").length,
    partiallyResolved: outcomes.filter((outcome) => outcome === "partially-resolved" || outcome === "changed").length,
    stillOpen: outcomes.filter((outcome) => outcome === "still-open" || outcome === "unchanged").length,
    stale: outcomes.filter((outcome) => outcome === "stale").length,
    superseded: outcomes.filter((outcome) => outcome === "superseded").length,
    needsHuman: outcomes.filter((outcome) => outcome === "needs-human").length,
    fixed: outcomes.filter((outcome) => outcome === "resolved" || outcome === "fixed").length,
    changed: outcomes.filter((outcome) => outcome === "partially-resolved" || outcome === "changed").length,
    unchanged: outcomes.filter((outcome) => outcome === "still-open" || outcome === "unchanged").length,
    inconclusive: outcomes.filter((outcome) => outcome === "inconclusive").length,
  };
}

function summarizeBlockers(attempts: FixAttemptRecord[]): ProgressBlockerSummary[] {
  const grouped = new Map<string, FixAttemptRecord[]>();
  for (const attempt of attempts) {
    const candidateId = attempt.candidateId ?? attempt.findingId;
    grouped.set(candidateId, [...(grouped.get(candidateId) ?? []), attempt]);
  }
  const blockers: ProgressBlockerSummary[] = [];
  for (const [candidateId, group] of grouped) {
    const latest = group.at(-1);
    if (!latest) {
      continue;
    }
    const unresolved = latest.outcome === "still-open" || latest.outcome === "partially-resolved" || latest.outcome === "needs_human";
    const exhausted = Boolean(latest.maxAttempts && latest.attemptNumber && latest.attemptNumber >= latest.maxAttempts);
    if (unresolved && (exhausted || group.length > 1)) {
      const blocker: ProgressBlockerSummary = {
        candidateId,
        attempts: group.length,
      };
      if (latest.outcome) {
        blocker.latestOutcome = latest.outcome;
      }
      blockers.push(blocker);
    }
  }
  return blockers.sort((a, b) => b.attempts - a.attempts || a.candidateId.localeCompare(b.candidateId));
}

function classifyNet(input: {
  runs: ProgressRunSummary;
  fixes: ProgressFixSummary;
  splits: ProgressSplitSummary;
  revalidation: ProgressSummary["revalidation"];
}): ProgressNet {
  if (
    input.fixes.resolved > 0 ||
    input.revalidation.fixed > 0 ||
    input.splits.children > 0 ||
    (input.runs.candidateDelta ?? 0) < 0
  ) {
    return "positive";
  }
  if (
    input.fixes.attempts > 0 &&
    (input.fixes.stillOpen > 0 || input.fixes.partiallyResolved > 0 || input.fixes.needsHuman > 0 || input.fixes.verificationFailed > 0)
  ) {
    return "weak";
  }
  return "neutral";
}

function progressNotes(input: {
  runs: ProgressRunSummary;
  fixes: ProgressFixSummary;
  splits: ProgressSplitSummary;
  blockers: ProgressBlockerSummary[];
}): string[] {
  const notes: string[] = [];
  if ((input.runs.candidateDelta ?? 0) >= 0 && input.splits.children > 0) {
    notes.push("Candidate count may stay flat while broad parents are split into child slices.");
  }
  if (input.blockers.length > 0) {
    notes.push("Repeated unresolved attempts should be split, switched, or marked needs-human.");
  }
  if (input.fixes.attempts > 0 && input.fixes.resolved === 0 && input.splits.children === 0) {
    notes.push("Recent attempts produced activity without a proved resolved candidate.");
  }
  return notes;
}

function proofParts(summary: ProgressSummary): string[] {
  const parts: string[] = [];
  if (summary.fixes.verificationPassed > 0) {
    parts.push(`${summary.fixes.verificationPassed} verification pass${plural(summary.fixes.verificationPassed, "es")}`);
  }
  if (summary.revalidation.fixed > 0) {
    parts.push(`${summary.revalidation.fixed} fixed revalidation${plural(summary.revalidation.fixed)}`);
  }
  if (summary.fixes.prUrls.length > 0) {
    parts.push(`${summary.fixes.prUrls.length} PR${plural(summary.fixes.prUrls.length)} opened`);
  }
  if (summary.fixes.verificationFailed > 0) {
    parts.push(`${summary.fixes.verificationFailed} verification failure${plural(summary.fixes.verificationFailed)}`);
  }
  return parts;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function formatDelta(value: number | undefined): string {
  if (value === undefined || value === 0) {
    return "";
  }
  return value > 0 ? `, +${value}` : `, ${value}`;
}

function plural(count: number, suffix = "s"): string {
  return count === 1 ? "" : suffix;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
