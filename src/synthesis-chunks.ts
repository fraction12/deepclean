import { uniqueFileReferences } from "./file-references.js";
import { buildAreaSynthesisChunks } from "./synthesis-chunk-areas.js";
import type { CandidateRecord, EvidenceRecord, FeatureRecord, FileReference } from "./types.js";

export interface SynthesisChunk {
  id: string;
  title: string;
  reason: string;
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
  existingCandidates: CandidateRecord[];
  fileRefs: FileReference[];
}

export type SynthesisPlanningMode = "comprehensive" | "quality-gate";

const bytesPerToken = 4;
const minimumChunkBudgetBytes = 24_000;
const defaultChunkBudgetRatio = 0.55;
const minimumWholePromptEvidenceCount = 60;
const minimumWholePromptFeatureCount = 80;
const minimumWholePromptCandidateCount = 50;
const qualityGateCandidateLimit = 6;
const qualityGateEvidenceLimit = 24;

export function planSynthesisChunks(options: {
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
  existingCandidates: CandidateRecord[];
  tokenBudget: number;
  mode?: SynthesisPlanningMode | undefined;
}): SynthesisChunk[] {
  if (options.mode === "quality-gate") {
    return [buildQualityGateChunk(options)];
  }

  const wholeRepoChunk = buildWholeRepoChunk(options);
  if (!shouldChunk(options, wholeRepoChunk)) {
    return [wholeRepoChunk];
  }

  const chunkBudgetBytes = Math.max(
    minimumChunkBudgetBytes,
    Math.floor(options.tokenBudget * bytesPerToken * defaultChunkBudgetRatio),
  );
  const chunks = buildAreaSynthesisChunks({
    ...options,
    chunkBudgetBytes,
    estimateChunkBytes,
  });

  return chunks.length > 0 ? chunks : [wholeRepoChunk];
}

function buildQualityGateChunk(options: {
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
  existingCandidates: CandidateRecord[];
}): SynthesisChunk {
  const topCandidates = options.existingCandidates.slice(0, qualityGateCandidateLimit);
  const evidenceIds = new Set(topCandidates.flatMap((candidate) => candidate.evidenceIds));
  const candidateEvidence = options.evidence.filter((record) => evidenceIds.has(record.id));
  const selectedEvidence = (candidateEvidence.length > 0 ? candidateEvidence : options.evidence)
    .slice(0, qualityGateEvidenceLimit);
  const selectedEvidenceIds = new Set(selectedEvidence.map((record) => record.id));
  const selectedCandidates = topCandidates.filter((candidate) => (
    candidate.evidenceIds.some((id) => selectedEvidenceIds.has(id))
  ));
  const fileRefs = uniqueFileReferences([
    ...selectedEvidence.flatMap((record) => record.files),
    ...selectedCandidates.flatMap((candidate) => candidate.files),
  ]);
  const features: FeatureRecord[] = [];

  return {
    id: "chunk-001-quality-gate",
    title: "Quality gate synthesis",
    reason: "CI quality gates use a single bounded provider packet over the highest-ranked local evidence instead of a full cleanup-campaign synthesis.",
    evidence: selectedEvidence,
    features,
    existingCandidates: selectedCandidates,
    fileRefs,
  };
}

function buildWholeRepoChunk(options: {
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
  existingCandidates: CandidateRecord[];
}): SynthesisChunk {
  return {
    id: "chunk-001-whole-repo",
    title: "Whole repository",
    reason: "Repository evidence fits within one bounded synthesis packet.",
    evidence: options.evidence,
    features: options.features,
    existingCandidates: options.existingCandidates,
    fileRefs: uniqueFileReferences([
      ...options.evidence.flatMap((record) => record.files),
      ...options.features.flatMap((feature) => feature.ownedFiles),
      ...options.existingCandidates.flatMap((candidate) => candidate.files),
    ]),
  };
}

function shouldChunk(options: {
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
  existingCandidates: CandidateRecord[];
  tokenBudget: number;
}, wholeRepoChunk: SynthesisChunk): boolean {
  const budgetBytes = Math.max(minimumChunkBudgetBytes, options.tokenBudget * bytesPerToken);
  return estimateChunkBytes(wholeRepoChunk) > budgetBytes
    || options.evidence.length > minimumWholePromptEvidenceCount
    || options.features.length > minimumWholePromptFeatureCount
    || options.existingCandidates.length > minimumWholePromptCandidateCount;
}

function estimateChunkBytes(chunk: SynthesisChunk): number {
  return Buffer.byteLength(JSON.stringify({
    evidence: chunk.evidence,
    features: chunk.features,
    existingCandidates: chunk.existingCandidates,
  }), "utf8");
}
