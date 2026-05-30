import { candidateArea as surfaceArea } from "./candidates.js";
import type { FileReference } from "./file-references.js";

type CleanupCandidateCategory =
  | "architecture"
  | "complexity"
  | "duplication"
  | "testability"
  | "dead-weight"
  | "ai-slop"
  | "domain-drift"
  | "diagnostic";

type CleanupEvidenceConfidence = "low" | "medium" | "high";

export interface CleanupCandidateInput {
  id: string;
  title: string;
  category: CleanupCandidateCategory;
  priority: string;
  evidenceIds: string[];
  files: FileReference[];
}

export interface CleanupEvidenceInput {
  id: string;
  kind: string;
  title: string;
  confidence: CleanupEvidenceConfidence;
  files: FileReference[];
  data: Record<string, unknown>;
}

export interface CleanupSurface {
  id: string;
  title: string;
  focus: string;
  reviewerIds: string[];
  evidenceIds: string[];
  candidateIds: string[];
  files: FileReference[];
  signals: string[];
}

interface SurfaceDraft {
  key: string;
  title: string;
  focus: string;
  reviewerIds: Set<string>;
  evidenceIds: Set<string>;
  candidateIds: Set<string>;
  files: Map<string, FileReference>;
  signals: Set<string>;
  score: number;
}

export function buildCleanupSurfaces(
  evidence: CleanupEvidenceInput[],
  candidates: CleanupCandidateInput[],
  limit = 12,
): CleanupSurface[] {
  const surfaces = new Map<string, SurfaceDraft>();

  for (const candidate of candidates) {
    const areas = candidate.files.length > 0
      ? unique(candidate.files.map((file) => surfaceArea(file.path)))
      : [`candidate:${candidate.category}`];
    for (const area of areas) {
      const surface = getSurface(surfaces, area);
      surface.candidateIds.add(candidate.id);
      surface.score += 6;
      surface.signals.add(`${candidate.priority} ${candidate.category}: ${candidate.title}`);
      for (const id of candidate.evidenceIds) {
        surface.evidenceIds.add(id);
      }
      for (const file of candidate.files) {
        addFile(surface, file);
      }
      for (const reviewerId of reviewersForCandidate(candidate)) {
        surface.reviewerIds.add(reviewerId);
      }
    }
  }

  for (const record of evidence) {
    const areas = evidenceAreas(record);
    for (const area of areas) {
      const surface = getSurface(surfaces, area);
      surface.evidenceIds.add(record.id);
      surface.score += scoreEvidence(record);
      surface.signals.add(`${record.kind}: ${record.title}`);
      for (const file of record.files) {
        addFile(surface, file);
      }
      for (const reviewerId of reviewersForEvidence(record)) {
        surface.reviewerIds.add(reviewerId);
      }
    }
  }

  addGraphDirectorySurfaces(surfaces, evidence);

  return [...surfaces.values()]
    .filter((surface) => surface.evidenceIds.size > 0 || surface.candidateIds.size > 0)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, limit)
    .map((surface, index) => ({
      id: `surface-${String(index + 1).padStart(3, "0")}`,
      title: surface.title,
      focus: surface.focus,
      reviewerIds: [...surface.reviewerIds].sort(),
      evidenceIds: [...surface.evidenceIds].sort(),
      candidateIds: [...surface.candidateIds].sort(),
      files: [...surface.files.values()].slice(0, 12),
      signals: [...surface.signals].slice(0, 10),
    }));
}

function getSurface(surfaces: Map<string, SurfaceDraft>, key: string): SurfaceDraft {
  const existing = surfaces.get(key);
  if (existing) {
    return existing;
  }
  const surface: SurfaceDraft = {
    key,
    title: `Cleanup surface: ${key}`,
    focus: `Review ${key} as one maintainability surface, not as isolated files.`,
    reviewerIds: new Set(["critic-pass"]),
    evidenceIds: new Set(),
    candidateIds: new Set(),
    files: new Map(),
    signals: new Set(),
    score: 0,
  };
  surfaces.set(key, surface);
  return surface;
}

function addGraphDirectorySurfaces(surfaces: Map<string, SurfaceDraft>, evidence: CleanupEvidenceInput[]): void {
  for (const record of evidence) {
    if (record.kind !== "code-graph-summary") {
      continue;
    }
    const directories = arrayOfRecords(record.data["directories"]);
    const hotspots = arrayOfRecords(record.data["hotspots"]);
    for (const directory of directories.slice(0, 12)) {
      const directoryPath = stringValue(directory["path"]);
      if (!directoryPath) {
        continue;
      }
      const fileCount = numberValue(directory["fileCount"]);
      const internalEdges = numberValue(directory["internalEdges"]);
      const incomingEdges = numberValue(directory["incomingEdges"]);
      const outgoingEdges = numberValue(directory["outgoingEdges"]);
      const graphScore = fileCount + internalEdges + incomingEdges + outgoingEdges;
      if (graphScore < 5) {
        continue;
      }
      const surface = getSurface(surfaces, directoryPath);
      surface.title = `Graph surface: ${directoryPath}`;
      surface.focus = "Review this directory as a graph-connected cleanup surface.";
      surface.evidenceIds.add(record.id);
      surface.reviewerIds.add("dependency-graph");
      surface.reviewerIds.add("architecture-deepening");
      surface.reviewerIds.add("deep-module-discipline");
      surface.score += graphScore;
      surface.signals.add(`graph: ${fileCount} files, ${internalEdges} internal edges, ${incomingEdges} incoming edges, ${outgoingEdges} outgoing edges`);
      for (const hotspot of hotspots) {
        const hotspotPath = stringValue(hotspot["path"]);
        if (hotspotPath?.startsWith(`${directoryPath}/`)) {
          addFile(surface, { path: hotspotPath, startLine: 1, endLine: 1 });
        }
      }
    }
  }
}

function evidenceAreas(record: CleanupEvidenceInput): string[] {
  const fileAreas = record.files.map((file) => surfaceArea(file.path));
  if (fileAreas.length > 0) {
    return unique(fileAreas);
  }
  return [record.kind];
}

function addFile(surface: SurfaceDraft, file: FileReference): void {
  const existing = surface.files.get(file.path);
  if (existing) {
    const startLine = Math.min(existing.startLine ?? 1, file.startLine ?? 1);
    const endLine = Math.max(existing.endLine ?? 1, file.endLine ?? 1);
    surface.files.set(file.path, { path: file.path, startLine, endLine });
    return;
  }
  surface.files.set(file.path, {
    path: file.path,
    startLine: file.startLine ?? 1,
    endLine: file.endLine ?? 1,
  });
}

const candidateReviewerIds: Record<CleanupCandidateCategory, string[]> = {
  architecture: ["architecture-deepening", "deep-module-discipline", "dependency-graph"],
  complexity: ["architecture-deepening", "deep-module-discipline", "testability", "feedback-loop-discipline"],
  duplication: ["duplication-consolidation"],
  testability: ["testability", "feedback-loop-discipline"],
  "ai-slop": ["ai-slop-patterns", "architecture-deepening", "agent-ready-slices"],
  "domain-drift": ["domain-language", "architecture-deepening"],
  "dead-weight": ["dependency-graph", "ai-slop-patterns", "agent-ready-slices"],
  diagnostic: ["critic-pass"],
};

const evidenceReviewerIds: Record<string, string[]> = {
  "duplicate-cluster": ["duplication-consolidation"],
  "dependency-hotspot": ["dependency-graph", "architecture-deepening", "deep-module-discipline"],
  "code-graph-summary": ["dependency-graph", "architecture-deepening", "deep-module-discipline"],
  "large-file": ["architecture-deepening", "deep-module-discipline", "testability", "feedback-loop-discipline"],
  "complex-function": ["architecture-deepening", "deep-module-discipline", "testability", "feedback-loop-discipline"],
  "shallow-wrapper-cluster": ["ai-slop-patterns", "architecture-deepening", "deep-module-discipline"],
  "test-gap": ["testability", "feedback-loop-discipline"],
};

function reviewersForCandidate(candidate: CleanupCandidateInput): string[] {
  return candidateReviewerIds[candidate.category];
}

function reviewersForEvidence(record: CleanupEvidenceInput): string[] {
  return evidenceReviewerIds[record.kind] ?? ["critic-pass"];
}

function scoreEvidence(record: CleanupEvidenceInput): number {
  const confidenceScore = record.confidence === "high" ? 5 : record.confidence === "medium" ? 3 : 1;
  const kindScore = record.kind === "code-graph-summary" ? 4
    : record.kind === "duplicate-cluster" ? 5
      : record.kind === "dependency-hotspot" ? 4
        : 2;
  return confidenceScore + kindScore;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
