import { stat } from "node:fs/promises";
import path from "node:path";
import {
  schemaVersion,
  type CandidateRecord,
  type Diagnostic,
  type FindingRecord,
  type RevalidationRecord,
} from "./types.js";
import { timestampId } from "./ids.js";

export async function classifyRevalidation(options: {
  root: string;
  finding: FindingRecord | undefined;
  currentCandidates: CandidateRecord[];
  runId: string;
  createdAt: string;
}): Promise<RevalidationRecord> {
  const diagnostics: Diagnostic[] = [];
  if (!options.finding) {
    return revalidationRecord({
      runId: options.runId,
      outcome: "inconclusive",
      evidenceIds: [],
      diagnostics: [{
        level: "warning",
        code: "finding_missing",
        message: "The target finding could not be resolved before revalidation.",
      }],
      createdAt: options.createdAt,
    });
  }

  const matching = options.currentCandidates.find((candidate) => candidate.findingId === options.finding?.id);
  if (matching) {
    return revalidationRecord({
      targetId: options.finding.id,
      runId: options.runId,
      outcome: "unchanged",
      evidenceIds: matching.evidenceIds,
      previousObservationId: options.finding.currentObservationId,
      diagnostics,
      createdAt: options.createdAt,
    });
  }

  const filesExist = await anyFindingFilesExist(options.root, options.finding);
  if (!filesExist) {
    return revalidationRecord({
      targetId: options.finding.id,
      runId: options.runId,
      outcome: "fixed",
      evidenceIds: [],
      previousObservationId: options.finding.currentObservationId,
      diagnostics,
      createdAt: options.createdAt,
    });
  }

  const related = relatedCandidates(options.finding, options.currentCandidates);
  const replacement = related.find((candidate) => candidate.impact === "cross-cutting" || candidate.priority < options.finding!.priority);
  if (replacement?.findingId) {
    return revalidationRecord({
      targetId: options.finding.id,
      runId: options.runId,
      outcome: "superseded",
      evidenceIds: replacement.evidenceIds,
      previousObservationId: options.finding.currentObservationId,
      supersededByFindingId: replacement.findingId,
      diagnostics,
      createdAt: options.createdAt,
    });
  }

  if (related.length > 0) {
    return revalidationRecord({
      targetId: options.finding.id,
      runId: options.runId,
      outcome: "changed",
      evidenceIds: related.flatMap((candidate) => candidate.evidenceIds),
      previousObservationId: options.finding.currentObservationId,
      diagnostics,
      createdAt: options.createdAt,
    });
  }

  return revalidationRecord({
    targetId: options.finding.id,
    runId: options.runId,
    outcome: "stale",
    evidenceIds: [],
    previousObservationId: options.finding.currentObservationId,
    diagnostics,
    createdAt: options.createdAt,
  });
}

function revalidationRecord(input: {
  targetId?: string;
  runId: string;
  outcome: RevalidationRecord["outcome"];
  evidenceIds: string[];
  previousObservationId?: string | undefined;
  newObservationId?: string | undefined;
  supersededByFindingId?: string | undefined;
  diagnostics: Diagnostic[];
  createdAt: string;
}): RevalidationRecord {
  return {
    schemaVersion,
    recordType: "revalidation",
    id: timestampId("revalidation"),
    targetType: input.targetId ? "finding" : "all",
    ...(input.targetId ? { targetId: input.targetId } : {}),
    runId: input.runId,
    outcome: input.outcome,
    evidenceIds: input.evidenceIds,
    ...(input.previousObservationId ? { previousObservationId: input.previousObservationId } : {}),
    ...(input.newObservationId ? { newObservationId: input.newObservationId } : {}),
    ...(input.supersededByFindingId ? { supersededByFindingId: input.supersededByFindingId } : {}),
    diagnostics: input.diagnostics,
    createdAt: input.createdAt,
  };
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
