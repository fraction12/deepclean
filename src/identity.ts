import { stableId } from "./ids.js";
import {
  schemaVersion,
  type CandidateObservationRecord,
  type CandidateRecord,
  type EvidenceRecord,
  type FindingRecord,
  type FindingSignature,
  type LifecycleEventRecord,
} from "./types.js";

export interface IdentityResult {
  candidates: CandidateRecord[];
  findings: FindingRecord[];
  observations: CandidateObservationRecord[];
  lifecycleEvents: LifecycleEventRecord[];
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

  const candidates = options.candidates.map((candidate) => {
    const signature = signatureForCandidate(candidate, evidenceById);
    const existing = findingsBySignature.get(signature.value);
    const findingId = existing?.id ?? stableId("finding", signature.value, 16);
    const observationId = stableId("observation", `${options.runId}:${candidate.id}:${signature.value}`, 16);
    const identified: CandidateRecord = {
      ...candidate,
      findingId,
      signature,
      identityConfidence: "high",
      lifecycleState: "open",
      baselineStatus: "new",
    };

    const observation: CandidateObservationRecord = {
      schemaVersion,
      recordType: "candidate_observation",
      id: observationId,
      findingId,
      candidateId: candidate.id,
      runId: options.runId,
      signature,
      identityConfidence: "high",
      baselineStatus: existing ? "existing" : "new",
      evidenceFreshness: "fresh",
      observedAt: options.observedAt,
    };
    observations.push(observation);

    if (!existing) {
      const finding: FindingRecord = {
        schemaVersion,
        recordType: "finding",
        id: findingId,
        signature,
        identityConfidence: "high",
        title: candidate.title,
        category: candidate.category,
        status: candidate.status,
        lifecycleState: "open",
        priority: candidate.priority,
        confidence: candidate.confidence,
        impact: candidate.impact,
        effort: candidate.effort,
        risk: candidate.risk,
        files: candidate.files,
        evidenceIds: candidate.evidenceIds,
        ...(candidate.decomposition ? { decomposition: candidate.decomposition } : {}),
        observationIds: [observationId],
        currentObservationId: observationId,
        createdAt: options.observedAt,
        updatedAt: options.observedAt,
      };
      findingsBySignature.set(signature.value, finding);
      findingsById.set(finding.id, finding);
      lifecycleEvents.push(lifecycleEvent({
        kind: "created",
        targetId: finding.id,
        findingId: finding.id,
        runId: options.runId,
        toState: "open",
        command: "scan",
        createdAt: options.observedAt,
      }));
    } else {
      findingsById.set(existing.id, {
        ...existing,
        title: candidate.title,
        category: candidate.category,
        status: candidate.status,
        lifecycleState: "open",
        priority: candidate.priority,
        confidence: candidate.confidence,
        impact: candidate.impact,
        effort: candidate.effort,
        risk: candidate.risk,
        files: candidate.files,
        evidenceIds: candidate.evidenceIds,
        ...(candidate.decomposition ? { decomposition: candidate.decomposition } : {}),
        observationIds: appendUnique(existing.observationIds, observationId),
        currentObservationId: observationId,
        updatedAt: options.observedAt,
      });
    }

    lifecycleEvents.push(lifecycleEvent({
      kind: "observed",
      targetId: findingId,
      findingId,
      runId: options.runId,
      toState: "open",
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
    findings: [...findingsById.values()].sort((a, b) => a.id.localeCompare(b.id)),
    observations,
    lifecycleEvents,
  };
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
