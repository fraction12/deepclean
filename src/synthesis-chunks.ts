import { uniqueFileReferences } from "./file-references.js";
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

const bytesPerToken = 4;
const minimumChunkBudgetBytes = 24_000;
const defaultChunkBudgetRatio = 0.55;
const minimumWholePromptEvidenceCount = 60;
const minimumWholePromptFeatureCount = 80;
const minimumWholePromptCandidateCount = 50;

export function planSynthesisChunks(options: {
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
  existingCandidates: CandidateRecord[];
  tokenBudget: number;
}): SynthesisChunk[] {
  const wholeRepoChunk = buildWholeRepoChunk(options);
  if (!shouldChunk(options, wholeRepoChunk)) {
    return [wholeRepoChunk];
  }

  const groups = new Map<string, {
    evidence: EvidenceRecord[];
    features: FeatureRecord[];
    existingCandidates: CandidateRecord[];
  }>();
  const ensureGroup = (area: string) => {
    const key = area || "root";
    const existing = groups.get(key);
    if (existing) {
      return existing;
    }
    const created = { evidence: [], features: [], existingCandidates: [] };
    groups.set(key, created);
    return created;
  };

  for (const record of options.evidence) {
    ensureGroup(primaryArea(record.files)).evidence.push(record);
  }
  for (const candidate of options.existingCandidates) {
    ensureGroup(primaryArea(candidate.files)).existingCandidates.push(candidate);
  }
  for (const feature of options.features) {
    const featureFiles = [
      ...feature.entrypoints,
      ...feature.ownedFiles,
      ...feature.contextFiles,
      ...feature.testFiles,
    ];
    ensureGroup(primaryArea(featureFiles)).features.push(feature);
  }

  const chunkBudgetBytes = Math.max(
    minimumChunkBudgetBytes,
    Math.floor(options.tokenBudget * bytesPerToken * defaultChunkBudgetRatio),
  );
  const chunks = [...groups.entries()]
    .flatMap(([area, group]) => splitAreaGroup(area, group, chunkBudgetBytes))
    .filter((chunk) => chunk.evidence.length > 0 || chunk.existingCandidates.length > 0);

  return chunks.length > 0 ? chunks : [wholeRepoChunk];
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

function splitAreaGroup(
  area: string,
  group: {
    evidence: EvidenceRecord[];
    features: FeatureRecord[];
    existingCandidates: CandidateRecord[];
  },
  chunkBudgetBytes: number,
): SynthesisChunk[] {
  const orderedEvidence = [...group.evidence].sort(compareEvidence);
  const chunks: SynthesisChunk[] = [];
  let chunkEvidence: EvidenceRecord[] = [];

  for (const record of orderedEvidence) {
    const candidateEvidence = [...chunkEvidence, record];
    const draft = areaChunk(area, chunks.length + 1, {
      ...group,
      evidence: candidateEvidence,
    });
    if (chunkEvidence.length > 0 && estimateChunkBytes(draft) > chunkBudgetBytes) {
      chunks.push(areaChunk(area, chunks.length + 1, {
        ...group,
        evidence: chunkEvidence,
      }));
      chunkEvidence = [record];
      continue;
    }
    chunkEvidence = candidateEvidence;
  }

  if (chunkEvidence.length > 0) {
    chunks.push(areaChunk(area, chunks.length + 1, {
      ...group,
      evidence: chunkEvidence,
    }));
  }

  if (chunks.length === 0 && group.existingCandidates.length > 0) {
    chunks.push(areaChunk(area, 1, group));
  }

  return chunks.map((chunk, index) => ({
    ...chunk,
    id: chunkId(area, index + 1),
    title: chunks.length > 1 ? `${area} synthesis slice ${index + 1}` : `${area} synthesis`,
  }));
}

function areaChunk(
  area: string,
  sequence: number,
  group: {
    evidence: EvidenceRecord[];
    features: FeatureRecord[];
    existingCandidates: CandidateRecord[];
  },
): SynthesisChunk {
  const chunkFiles = uniqueFileReferences([
    ...group.evidence.flatMap((record) => record.files),
    ...group.existingCandidates.flatMap((candidate) => candidate.files),
    ...group.features.flatMap((feature) => feature.ownedFiles),
  ]);
  const relevantFeatureIds = new Set([
    ...group.evidence.flatMap((record) => record.affectedFeatureIds),
    ...group.existingCandidates.flatMap((candidate) => candidate.affectedFeatureIds),
  ]);
  const relevantPaths = new Set(chunkFiles.map((file) => file.path));
  const features = group.features.filter((feature) => (
    relevantFeatureIds.has(feature.featureId)
    || featureTouchesPaths(feature, relevantPaths)
  ));
  const existingCandidates = group.existingCandidates.filter((candidate) => (
    candidate.evidenceIds.some((id) => group.evidence.some((record) => record.id === id))
    || candidate.files.some((file) => relevantPaths.has(file.path))
  ));

  return {
    id: chunkId(area, sequence),
    title: `${area} synthesis`,
    reason: `Bounded synthesis packet for ${area} derived from local evidence, feature ownership, and metric hot spots.`,
    evidence: group.evidence,
    features,
    existingCandidates,
    fileRefs: chunkFiles,
  };
}

function estimateChunkBytes(chunk: SynthesisChunk): number {
  return Buffer.byteLength(JSON.stringify({
    evidence: chunk.evidence,
    features: chunk.features,
    existingCandidates: chunk.existingCandidates,
  }), "utf8");
}

function primaryArea(files: FileReference[]): string {
  const pathValue = files.map((file) => file.path).find(Boolean);
  if (!pathValue) {
    return "root";
  }
  const parts = pathValue.split("/").filter(Boolean);
  if (parts.length === 0) {
    return "root";
  }
  if (parts.length === 1) {
    return "root";
  }
  if (["src", "app", "pages", "routes", "backend", "frontend", "server", "client", "packages"].includes(parts[0] ?? "")) {
    return parts.slice(0, Math.min(2, parts.length - 1)).join("/") || (parts[0] ?? "root");
  }
  return parts[0] ?? "root";
}

function featureTouchesPaths(feature: FeatureRecord, paths: Set<string>): boolean {
  return [
    ...feature.entrypoints,
    ...feature.ownedFiles,
    ...feature.contextFiles,
    ...feature.testFiles,
  ].some((file) => paths.has(file.path));
}

function chunkId(area: string, sequence: number): string {
  const slug = area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "root";
  return `chunk-${String(sequence).padStart(3, "0")}-${slug}`;
}

function compareEvidence(left: EvidenceRecord, right: EvidenceRecord): number {
  return left.kind.localeCompare(right.kind)
    || (left.files[0]?.path ?? "").localeCompare(right.files[0]?.path ?? "")
    || left.id.localeCompare(right.id);
}
