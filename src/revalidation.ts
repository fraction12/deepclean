import { stat } from "node:fs/promises";
import path from "node:path";
import {
  schemaVersion,
  type CandidateRecord,
  type Diagnostic,
  type EvidenceRecord,
  type FindingRecord,
  type FixAttemptRecord,
  type RevalidationRecord,
} from "./types.js";
import { timestampId } from "./ids.js";

type ClassifyRevalidationOptions = {
  root: string;
  finding: FindingRecord | undefined;
  currentCandidates: CandidateRecord[];
  runId: string;
  createdAt: string;
  previousEvidence?: EvidenceRecord[];
  currentEvidence?: EvidenceRecord[];
  verificationRunIds?: string[];
  changedFiles?: string[];
  dirtyState?: { dirty: boolean; files: string[] } | undefined;
  forceNeedsHuman?: string | undefined;
};

export async function classifyRevalidation(options: ClassifyRevalidationOptions): Promise<RevalidationRecord> {
  const preflightOutcome = classifyPreflightRevalidation(options);
  if (preflightOutcome) {
    return preflightOutcome;
  }

  const finding = options.finding!;
  const matching = options.currentCandidates.find((candidate) => candidate.findingId === finding.id);
  const progress = metricProgressForFinding(finding, options.previousEvidence ?? [], options.currentEvidence ?? []);
  if (matching) {
    if (progress) {
      return revalidationRecord({
        targetId: finding.id,
        priorLifecycleState: finding.lifecycleState,
        runId: options.runId,
        outcome: "partially-resolved",
        confidence: matching.confidence,
        evidenceIds: unique([...matching.evidenceIds, ...progress.evidenceIds]),
        evidenceFreshness: "fresh",
        previousObservationId: finding.currentObservationId,
        rationale: `The same stable finding remains, but ${progress.metric} moved from ${progress.before} to ${progress.after} ${progress.unit}.`,
        nextAction: "Treat this as campaign progress and continue slicing until the parent metric clears.",
        progress,
        diagnostics: [],
        createdAt: options.createdAt,
        verificationRunIds: options.verificationRunIds ?? [],
        changedFiles: options.changedFiles ?? [],
        dirtyState: options.dirtyState,
      });
    }
    return revalidationRecord({
      targetId: finding.id,
      priorLifecycleState: finding.lifecycleState,
      runId: options.runId,
      outcome: "still-open",
      confidence: matching.confidence,
      evidenceIds: matching.evidenceIds,
      evidenceFreshness: "fresh",
      previousObservationId: finding.currentObservationId,
      rationale: "The same stable finding was rediscovered in the revalidation scan, so the original issue remains present.",
      nextAction: "Keep the finding open and inspect the latest evidence before attempting another fix.",
      diagnostics: [],
      createdAt: options.createdAt,
      verificationRunIds: options.verificationRunIds ?? [],
      changedFiles: options.changedFiles ?? [],
      dirtyState: options.dirtyState,
    });
  }

  const filesExist = await anyFindingFilesExist(options.root, finding);
  if (!filesExist) {
    return revalidationRecord({
      targetId: finding.id,
      priorLifecycleState: finding.lifecycleState,
      runId: options.runId,
      outcome: "stale",
      confidence: "low",
      evidenceIds: finding.evidenceIds,
      evidenceFreshness: "stale",
      previousObservationId: finding.currentObservationId,
      rationale: "The original file anchors no longer exist, so Deepclean cannot prove whether the original concern was resolved or merely moved.",
      nextAction: "Rescan the repository and inspect replacement findings before closing this concern.",
      diagnostics: [{
        level: "warning",
        code: "target_anchors_missing",
        message: "None of the finding's primary files exist at their recorded paths.",
      }],
      createdAt: options.createdAt,
      verificationRunIds: options.verificationRunIds ?? [],
      changedFiles: options.changedFiles ?? [],
      dirtyState: options.dirtyState,
    });
  }

  const related = relatedCandidates(finding, options.currentCandidates);
  const replacement = related.find((candidate) => candidate.impact === "cross-cutting" || candidate.priority < finding.priority);
  if (replacement?.findingId) {
    return revalidationRecord({
      targetId: finding.id,
      priorLifecycleState: finding.lifecycleState,
      runId: options.runId,
      outcome: "superseded",
      confidence: replacement.confidence,
      evidenceIds: replacement.evidenceIds,
      evidenceFreshness: "fresh",
      previousObservationId: finding.currentObservationId,
      supersededByFindingId: replacement.findingId,
      replacementFindingId: replacement.findingId,
      rationale: `The original concern is now better represented by replacement finding ${replacement.findingId}.`,
      nextAction: `Continue work from replacement finding ${replacement.findingId}.`,
      diagnostics: [],
      createdAt: options.createdAt,
      verificationRunIds: options.verificationRunIds ?? [],
      changedFiles: options.changedFiles ?? [],
      dirtyState: options.dirtyState,
    });
  }

  if (related.length > 0) {
    return revalidationRecord({
      targetId: finding.id,
      priorLifecycleState: finding.lifecycleState,
      runId: options.runId,
      outcome: "partially-resolved",
      confidence: strongestConfidence(related.map((candidate) => candidate.confidence)),
      evidenceIds: unique(related.flatMap((candidate) => candidate.evidenceIds)),
      evidenceFreshness: "fresh",
      previousObservationId: finding.currentObservationId,
      rationale: progress
        ? `The exact finding was not rediscovered, but related evidence remains and ${progress.metric} moved from ${progress.before} to ${progress.after} ${progress.unit}.`
        : "The exact finding was not rediscovered, but related evidence remains on the same files and category.",
      nextAction: progress
        ? "Treat this as campaign progress and continue from the remaining related evidence."
        : "Treat the original fix as partial and plan from the remaining related evidence.",
      ...(progress ? { progress } : {}),
      diagnostics: [],
      createdAt: options.createdAt,
      verificationRunIds: options.verificationRunIds ?? [],
      changedFiles: options.changedFiles ?? [],
      dirtyState: options.dirtyState,
    });
  }

  return revalidationRecord({
    targetId: finding.id,
    priorLifecycleState: finding.lifecycleState,
    runId: options.runId,
    outcome: "resolved",
    confidence: finding.confidence === "low" ? "medium" : finding.confidence,
    evidenceIds: finding.evidenceIds,
    evidenceFreshness: "reused",
    previousObservationId: finding.currentObservationId,
    rationale: "The original file anchors still exist, but neither the original finding nor related replacement evidence was rediscovered.",
    nextAction: "Keep the proof record with the fix or handoff; passed verification alone was not used as resolution.",
    diagnostics: [],
    createdAt: options.createdAt,
    verificationRunIds: options.verificationRunIds ?? [],
    changedFiles: options.changedFiles ?? [],
    dirtyState: options.dirtyState,
  });
}

function classifyPreflightRevalidation(options: ClassifyRevalidationOptions): RevalidationRecord | undefined {
  if (!options.finding) {
    return revalidationRecord({
      runId: options.runId,
      outcome: "inconclusive",
      confidence: "low",
      evidenceIds: [],
      evidenceFreshness: "stale",
      rationale: "The target finding could not be resolved before revalidation, so Deepclean cannot compare the original claim to current evidence.",
      nextAction: "Resolve the target to a stable finding ID or rerun scan before revalidating.",
      diagnostics: [{
        level: "warning",
        code: "finding_missing",
        message: "The target finding could not be resolved before revalidation.",
      }],
      createdAt: options.createdAt,
      changedFiles: options.changedFiles ?? [],
      dirtyState: options.dirtyState,
    });
  }

  if (options.forceNeedsHuman) {
    return revalidationRecord({
      targetId: options.finding.id,
      priorLifecycleState: options.finding.lifecycleState,
      runId: options.runId,
      outcome: "needs-human",
      confidence: "low",
      evidenceIds: options.finding.evidenceIds,
      evidenceFreshness: "reused",
      previousObservationId: options.finding.currentObservationId,
      rationale: options.forceNeedsHuman,
      nextAction: "Have a human narrow or confirm the target before assigning implementation work.",
      diagnostics: [{
        level: "warning",
        code: "needs_human_revalidation",
        message: options.forceNeedsHuman,
      }],
      createdAt: options.createdAt,
      verificationRunIds: options.verificationRunIds ?? [],
      changedFiles: options.changedFiles ?? [],
      dirtyState: options.dirtyState,
    });
  }

  return undefined;
}

function revalidationRecord(input: {
  targetId?: string;
  priorLifecycleState?: string | undefined;
  runId: string;
  outcome: RevalidationRecord["outcome"];
  confidence: RevalidationRecord["confidence"];
  rationale: string;
  nextAction: string;
  evidenceIds: string[];
  evidenceFreshness?: RevalidationRecord["evidenceFreshness"];
  previousObservationId?: string | undefined;
  newObservationId?: string | undefined;
  verificationRunIds?: string[] | undefined;
  changedFiles?: string[] | undefined;
  dirtyState?: RevalidationRecord["dirtyState"];
  supersededByFindingId?: string | undefined;
  replacementFindingId?: string | undefined;
  progress?: RevalidationRecord["progress"] | undefined;
  diagnostics: Diagnostic[];
  createdAt: string;
}): RevalidationRecord {
  const id = timestampId("revalidation");
  return {
    schemaVersion,
    recordType: "revalidation",
    id,
    targetType: input.targetId ? "finding" : "all",
    ...(input.targetId ? { targetId: input.targetId } : {}),
    runId: input.runId,
    ...(input.priorLifecycleState ? { priorLifecycleState: input.priorLifecycleState } : {}),
    outcome: input.outcome,
    confidence: input.confidence,
    rationale: input.rationale,
    nextAction: input.nextAction,
    evidenceBundleId: `${id}-evidence`,
    ...(input.evidenceFreshness ? { evidenceFreshness: input.evidenceFreshness } : {}),
    evidenceIds: unique(input.evidenceIds),
    ...(input.previousObservationId ? { previousObservationId: input.previousObservationId } : {}),
    ...(input.newObservationId ? { newObservationId: input.newObservationId } : {}),
    verificationRunIds: input.verificationRunIds ?? [],
    changedFiles: input.changedFiles ?? [],
    ...(input.dirtyState ? { dirtyState: input.dirtyState } : {}),
    ...(input.supersededByFindingId ? { supersededByFindingId: input.supersededByFindingId } : {}),
    ...(input.replacementFindingId ? { replacementFindingId: input.replacementFindingId } : {}),
    ...(input.progress ? { progress: input.progress } : {}),
    diagnostics: input.diagnostics,
    createdAt: input.createdAt,
  };
}

export function verificationRunIdsForFinding(
  findingId: string,
  attempts: FixAttemptRecord[],
): string[] {
  return attempts
    .filter((attempt) => (
      attempt.findingId === findingId
      && attempt.verificationResults.length > 0
      && attempt.verificationResults.every((result) => result.passed)
    ))
    .map((attempt) => attempt.id);
}

async function anyFindingFilesExist(root: string, finding: FindingRecord): Promise<boolean> {
  for (const file of finding.files) {
    try {
      await stat(path.join(root, file.path));
      return true;
    } catch {
      // Keep checking other files.
    }
  }
  return false;
}

function relatedCandidates(finding: FindingRecord, candidates: CandidateRecord[]): CandidateRecord[] {
  const findingFiles = new Set(finding.files.map((file) => file.path));
  return candidates.filter((candidate) => (
    candidate.category === finding.category
    && candidate.findingId !== finding.id
    && candidate.files.some((file) => findingFiles.has(file.path))
  ));
}

function strongestConfidence(values: Array<CandidateRecord["confidence"]>): RevalidationRecord["confidence"] {
  if (values.includes("high")) {
    return "high";
  }
  if (values.includes("medium")) {
    return "medium";
  }
  return "low";
}

function metricProgressForFinding(
  finding: FindingRecord,
  previousEvidence: EvidenceRecord[],
  currentEvidence: EvidenceRecord[],
): RevalidationRecord["progress"] | undefined {
  const previous = previousEvidence
    .filter((record) => finding.evidenceIds.includes(record.id))
    .map((record) => ({ record, metric: metricValue(record), key: metricComparisonKey(record) }))
    .filter((item): item is { record: EvidenceRecord; metric: MetricValue; key: string } => (
      item.metric !== undefined && item.key.length > 0
    ));
  if (previous.length === 0 || currentEvidence.length === 0) {
    return undefined;
  }

  let best: RevalidationRecord["progress"] | undefined;
  for (const before of previous) {
    const candidates = currentEvidence
      .map((record) => ({ record, metric: metricValue(record), key: metricComparisonKey(record) }))
      .filter((item): item is { record: EvidenceRecord; metric: MetricValue; key: string } => (
        item.metric !== undefined
        && item.key === before.key
        && item.metric.metric === before.metric.metric
        && item.metric.unit === before.metric.unit
      ));
    for (const after of candidates) {
      const delta = before.metric.value - after.metric.value;
      if (delta <= 0) {
        continue;
      }
      const progress = {
        kind: "metric-reduction" as const,
        metric: before.metric.metric,
        unit: before.metric.unit,
        before: before.metric.value,
        after: after.metric.value,
        delta,
        evidenceIds: unique([before.record.id, after.record.id]),
      };
      if (!best || progress.delta > best.delta) {
        best = progress;
      }
    }
  }
  return best;
}

type MetricValue = {
  metric: string;
  unit: string;
  value: number;
};

function metricValue(record: EvidenceRecord): MetricValue | undefined {
  const lines = record.data["lines"];
  if (typeof lines === "number" && Number.isFinite(lines)) {
    return { metric: `${record.kind}.lines`, unit: "lines", value: lines };
  }
  const primary = record.files[0];
  if (
    (record.kind === "large-function" || record.kind === "large-file")
    && typeof primary?.startLine === "number"
    && typeof primary.endLine === "number"
    && primary.endLine >= primary.startLine
  ) {
    return {
      metric: `${record.kind}.lines`,
      unit: "lines",
      value: primary.endLine - primary.startLine + 1,
    };
  }
  return undefined;
}

function metricComparisonKey(record: EvidenceRecord): string {
  const primary = record.files[0]?.path;
  if (!primary) {
    return "";
  }
  const symbol = record.data["name"];
  return [
    record.kind,
    primary,
    typeof symbol === "string" && symbol.trim().length > 0 ? symbol.trim() : normalizeEvidenceTitle(record.title),
  ].join(":");
}

function normalizeEvidenceTitle(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
