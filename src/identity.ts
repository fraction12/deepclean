import { stableId } from "./ids.js";
import {
  schemaVersion,
  type CandidateObservationRecord,
  type CandidateRecord,
  type Diagnostic,
  type EvidenceRecord,
  type FindingRecord,
  type FindingSignature,
  type IdentityMatchRecord,
  type LifecycleEventRecord,
} from "./types.js";

export interface IdentityResult {
  candidates: CandidateRecord[];
  findings: FindingRecord[];
  observations: CandidateObservationRecord[];
  lifecycleEvents: LifecycleEventRecord[];
  identityMatches: IdentityMatchRecord[];
  diagnostics: Diagnostic[];
}

export function attachStableIdentity(options: {
  runId: string;
  candidates: CandidateRecord[];
  evidence: EvidenceRecord[];
  existingFindings: FindingRecord[];
  observedAt: string;
}): IdentityResult {
  const evidenceById = new Map(options.evidence.map((record) => [record.id, record]));
  const findingsBySignature = new Map(options.existingFindings.map((finding) => [finding.signature.value, finding]));
  const findingsById = new Map(options.existingFindings.map((finding) => [finding.id, finding]));
  const observations: CandidateObservationRecord[] = [];
  const lifecycleEvents: LifecycleEventRecord[] = [];
  const identityMatches: IdentityMatchRecord[] = [];
  const diagnostics: Diagnostic[] = [];

  const candidates = options.candidates.map((candidate, index) => {
    const signature = signatureForCandidate(candidate, evidenceById);
    const { existing, confidence, identityMatch } = resolveFindingMatch({
      runId: options.runId,
      candidate,
      signature,
      findings: options.existingFindings,
      findingsBySignature,
      observedAt: options.observedAt,
    });
    identityMatches.push(identityMatch);
    if (confidence !== "high") {
      diagnostics.push({
        level: "warning",
        code: "identity_match_low_confidence",
        message: `${candidate.id} matched with ${confidence} confidence (${identityMatch.reason}).`,
        adapter: "identity",
      });
    }
    const findingId = existing?.id ?? stableId("finding", signature.value, 16);
    const observationId = stableId("observation", `${options.runId}:${candidate.id}:${signature.value}`, 16);
    const lifecycleState = deriveLifecycleState(candidate, { isNewFinding: !existing });
    const identified: CandidateRecord = {
      ...candidate,
      findingId,
      signature,
      identityConfidence: confidence,
      lifecycleState,
      baselineStatus: existing ? "existing" : "new",
    };

    const observation: CandidateObservationRecord = {
      schemaVersion,
      recordType: "candidate_observation",
      id: observationId,
      findingId,
      candidateId: candidate.id,
      runId: options.runId,
      displayId: candidate.id,
      signature,
      identityConfidence: confidence,
      baselineStatus: existing ? "existing" : "new",
      files: candidate.files,
      evidenceIds: candidate.evidenceIds,
      rank: index + 1,
      evidenceFreshness: "fresh",
      observedAt: options.observedAt,
    };
    observations.push(observation);

    upsertFindingForObservation({
      candidate,
      existing,
      findingId,
      signature,
      identityConfidence: confidence,
      lifecycleState,
      observationId,
      observedAt: options.observedAt,
      runId: options.runId,
      findingsBySignature,
      findingsById,
      lifecycleEvents,
    });

    lifecycleEvents.push(lifecycleEvent({
      kind: "observed",
      targetId: findingId,
      findingId,
      runId: options.runId,
      toState: lifecycleState,
      command: "scan",
      createdAt: options.observedAt,
      data: {
        candidateId: candidate.id,
        observationId,
        baselineStatus: observation.baselineStatus,
      },
    }));

    return identified;
  });

  return {
    candidates,
    findings: applyFindingLinks(candidates, [...findingsById.values()]).sort((a, b) => a.id.localeCompare(b.id)),
    observations,
    lifecycleEvents,
    identityMatches,
    diagnostics,
  };
}

function upsertFindingForObservation(input: {
  candidate: CandidateRecord;
  existing: FindingRecord | undefined;
  findingId: string;
  signature: FindingSignature;
  identityConfidence: FindingRecord["identityConfidence"];
  lifecycleState: FindingRecord["lifecycleState"];
  observationId: string;
  observedAt: string;
  runId: string;
  findingsBySignature: Map<string, FindingRecord>;
  findingsById: Map<string, FindingRecord>;
  lifecycleEvents: LifecycleEventRecord[];
}): void {
  if (!input.existing) {
    const finding: FindingRecord = {
      schemaVersion,
      recordType: "finding",
      id: input.findingId,
      signature: input.signature,
      identityConfidence: input.identityConfidence,
      title: input.candidate.title,
      category: input.candidate.category,
      status: input.candidate.status,
      lifecycleState: input.lifecycleState,
      priority: input.candidate.priority,
      confidence: input.candidate.confidence,
      impact: input.candidate.impact,
      effort: input.candidate.effort,
      risk: input.candidate.risk,
      files: input.candidate.files,
      evidenceIds: input.candidate.evidenceIds,
      ...(input.candidate.decomposition ? { decomposition: input.candidate.decomposition } : {}),
      childFindingIds: [],
      supersedesFindingIds: [],
      observationIds: [input.observationId],
      currentObservationId: input.observationId,
      createdAt: input.observedAt,
      updatedAt: input.observedAt,
    };
    input.findingsBySignature.set(input.signature.value, finding);
    input.findingsById.set(finding.id, finding);
    input.lifecycleEvents.push(lifecycleEvent({
      kind: "created",
      targetId: finding.id,
      findingId: finding.id,
      runId: input.runId,
      toState: input.lifecycleState,
      command: "scan",
      createdAt: input.observedAt,
    }));
    return;
  }

  input.findingsById.set(input.existing.id, {
    ...input.existing,
    identityConfidence: input.identityConfidence,
    title: input.candidate.title,
    category: input.candidate.category,
    status: input.candidate.status,
    lifecycleState: input.lifecycleState,
    priority: input.candidate.priority,
    confidence: input.candidate.confidence,
    impact: input.candidate.impact,
    effort: input.candidate.effort,
    risk: input.candidate.risk,
    files: input.candidate.files,
    evidenceIds: input.candidate.evidenceIds,
    ...(input.candidate.decomposition ? { decomposition: input.candidate.decomposition } : {}),
    observationIds: appendUnique(input.existing.observationIds, input.observationId),
    currentObservationId: input.observationId,
    updatedAt: input.observedAt,
  });
}

function resolveFindingMatch(input: {
  runId: string;
  candidate: CandidateRecord;
  signature: FindingSignature;
  findings: FindingRecord[];
  findingsBySignature: Map<string, FindingRecord>;
  observedAt: string;
}): {
  existing: FindingRecord | undefined;
  confidence: FindingRecord["identityConfidence"];
  identityMatch: IdentityMatchRecord;
} {
  const exact = input.findingsBySignature.get(input.signature.value);
  if (exact) {
    return {
      existing: exact,
      confidence: "high",
      identityMatch: {
        schemaVersion,
        recordType: "identity_match",
        id: stableId("identity", `${input.runId}:${input.candidate.id}:${input.signature.value}`, 16),
        runId: input.runId,
        candidateId: input.candidate.id,
        signature: input.signature,
        matchedFindingId: exact.id,
        confidence: "high",
        reason: "exact_signature_match",
        unsafeMergeRefused: false,
        possiblePredecessorFindingIds: [],
        createdAt: input.observedAt,
      },
    };
  }

  const normalizedTitle = normalizeTitle(input.candidate.title);
  const candidateAnchors = new Set(input.candidate.files.map((file) => file.path));
  const related = input.findings
    .filter((finding) => (
      finding.category === input.candidate.category
      && finding.signature.components.normalizedTitle === normalizedTitle
    ))
    .map((finding) => {
      const overlap = finding.files.reduce((count, file) => (candidateAnchors.has(file.path) ? count + 1 : count), 0);
      return { finding, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap || a.finding.id.localeCompare(b.finding.id));

  const best = related[0];
  const shouldMerge = Boolean(best && best.overlap > 0);
  const confidence: FindingRecord["identityConfidence"] = shouldMerge
    ? "medium"
    : related.length === 0
      ? "high"
      : "low";
  const possiblePredecessorFindingIds = related.slice(0, 3).map((item) => item.finding.id);

  return {
    existing: shouldMerge ? best?.finding : undefined,
    confidence,
    identityMatch: {
      schemaVersion,
      recordType: "identity_match",
      id: stableId("identity", `${input.runId}:${input.candidate.id}:${input.signature.value}`, 16),
      runId: input.runId,
      candidateId: input.candidate.id,
      signature: input.signature,
      ...(shouldMerge && best?.finding ? { matchedFindingId: best.finding.id } : {}),
      confidence,
      reason: shouldMerge
        ? "title_and_anchor_overlap"
        : related.length === 0
          ? "new_signature_no_predecessor"
          : "possible_predecessor_without_safe_anchor_overlap",
      unsafeMergeRefused: !shouldMerge && related.length > 0,
      possiblePredecessorFindingIds,
      createdAt: input.observedAt,
    },
  };
}

function deriveLifecycleState(
  candidate: CandidateRecord,
  options: { isNewFinding: boolean },
): NonNullable<CandidateRecord["lifecycleState"]> {
  if (candidate.status === "ignored" || candidate.status === "false-positive") {
    return "suppressed";
  }
  if (candidate.status === "stale") {
    return "stale";
  }
  if (candidate.status === "fixed") {
    return "resolved";
  }
  if (candidate.status === "superseded") {
    return candidate.decomposition?.childCandidateIds?.length ? "split" : "superseded";
  }
  if (candidate.risk === "design-needed") {
    return "design-needed";
  }
  return options.isNewFinding ? "new" : "ready";
}

function applyFindingLinks(candidates: CandidateRecord[], findings: FindingRecord[]): FindingRecord[] {
  const findingById = new Map(findings.map((finding) => [finding.id, finding]));
  const findingIdByCandidateId = new Map(
    candidates
      .filter((candidate): candidate is CandidateRecord & { findingId: string } => typeof candidate.findingId === "string")
      .map((candidate) => [candidate.id, candidate.findingId]),
  );

  for (const candidate of candidates) {
    if (!candidate.findingId) {
      continue;
    }
    const finding = findingById.get(candidate.findingId);
    if (!finding) {
      continue;
    }

    const parentFindingId = candidate.decomposition?.parentCandidateId
      ? findingIdByCandidateId.get(candidate.decomposition.parentCandidateId)
      : undefined;
    const childFindingIds = (candidate.decomposition?.childCandidateIds ?? [])
      .map((id) => findingIdByCandidateId.get(id))
      .filter((id): id is string => Boolean(id));
    if (parentFindingId) {
      finding.parentFindingId = parentFindingId;
      finding.lifecycleState = finding.lifecycleState === "new" ? "ready" : finding.lifecycleState;
      finding.status = finding.status === "superseded" ? finding.status : "open";
      const parent = findingById.get(parentFindingId);
      if (parent) {
        parent.childFindingIds = appendUnique(parent.childFindingIds, finding.id);
      }
    }
    if (childFindingIds.length > 0) {
      finding.childFindingIds = appendManyUnique(finding.childFindingIds, childFindingIds);
      if (candidate.status === "superseded") {
        finding.lifecycleState = "split";
        finding.supersededByFindingId = childFindingIds[0];
      }
      for (const childFindingId of childFindingIds) {
        const child = findingById.get(childFindingId);
        if (!child) {
          continue;
        }
        child.parentFindingId = finding.id;
        child.supersedesFindingIds = appendUnique(child.supersedesFindingIds, finding.id);
      }
    }
  }

  return findings;
}

export function signatureForCandidate(
  candidate: CandidateRecord,
  evidenceById: Map<string, EvidenceRecord>,
): FindingSignature {
  const evidence = candidate.evidenceIds
    .map((id) => evidenceById.get(id))
    .filter((record): record is EvidenceRecord => Boolean(record));
  const evidenceKinds = [...new Set(evidence.map((record) => record.kind))].sort();
  const analyzerRuleIds = [...new Set(evidence.flatMap((record) => analyzerRuleId(record)))].sort();
  const graphNeighborhood = [...new Set(evidence.flatMap((record) => graphEdges(record)))].sort().slice(0, 20);
  const primaryAnchors = [...candidate.files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, 8)
    .map((file) => ({ path: file.path }));
  const components = {
    category: candidate.category,
    normalizedTitle: normalizeTitle(candidate.title),
    evidenceKinds,
    primaryAnchors,
    ...(graphNeighborhood.length > 0 ? { graphNeighborhood } : {}),
    ...(analyzerRuleIds.length > 0 ? { analyzerRuleIds } : {}),
  };
  const value = stableId("sig", JSON.stringify(components), 20);
  return {
    version: "1",
    value,
    components,
  };
}

function lifecycleEvent(input: {
  kind: LifecycleEventRecord["kind"];
  targetId: string;
  findingId: string;
  runId: string;
  toState: string;
  command: string;
  createdAt: string;
  data?: Record<string, unknown>;
}): LifecycleEventRecord {
  const id = stableId("event", `${input.runId}:${input.findingId}:${input.kind}:${JSON.stringify(input.data ?? {})}`, 16);
  return {
    schemaVersion,
    recordType: "lifecycle_event",
    id,
    targetType: "finding",
    targetId: input.targetId,
    findingId: input.findingId,
    runId: input.runId,
    kind: input.kind,
    toState: input.toState,
    command: input.command,
    createdAt: input.createdAt,
    ...(input.data ? { data: input.data } : {}),
  };
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function analyzerRuleId(record: EvidenceRecord): string[] {
  const ruleId = record.data["ruleId"];
  return typeof ruleId === "string" ? [ruleId] : [];
}

function graphEdges(record: EvidenceRecord): string[] {
  const edges = record.data["edges"];
  if (!Array.isArray(edges)) {
    return [];
  }
  return edges.flatMap((edge) => {
    if (
      edge
      && typeof edge === "object"
      && "from" in edge
      && "to" in edge
      && typeof edge.from === "string"
      && typeof edge.to === "string"
    ) {
      return [`${edge.from}->${edge.to}`];
    }
    return [];
  });
}

function appendUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function appendManyUnique(values: string[], toAppend: string[]): string[] {
  let next = values;
  for (const value of toAppend) {
    next = appendUnique(next, value);
  }
  return next;
}
