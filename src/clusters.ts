import { clusterId } from "./ids.js";
import {
  candidateCategories,
  candidateStatuses,
  confidenceLevels,
  effortLevels,
  impactLevels,
  priorities,
  riskLevels,
  schemaVersion,
  type CandidateRecord,
  type ClusterRecord,
  type EvidenceRecord,
  type FileReference,
} from "./types.js";

const priorityScore = { P0: 0, P1: 1, P2: 2, P3: 3 } as const;
const confidenceScore = { low: 1, medium: 2, high: 3 } as const;
const effortScore = { small: 1, medium: 2, large: 3 } as const;
const impactScore = { local: 1, feature: 2, "cross-cutting": 3 } as const;
const riskScore = { safe: 1, moderate: 2, "design-needed": 3 } as const;

export function buildClusters(
  runId: string,
  candidates: CandidateRecord[],
  evidence: EvidenceRecord[],
  createdAt = new Date().toISOString(),
  options: { maxCandidates?: number; maxFiles?: number; splitBroad?: boolean } = {},
): ClusterRecord[] {
  const maxCandidates = options.maxCandidates ?? 12;
  const maxFiles = options.maxFiles ?? 18;
  const splitBroad = options.splitBroad ?? true;
  const active = candidates.filter((candidate) => !["ignored", "false-positive", "stale"].includes(candidate.status));
  const graph = buildCandidateGraph(active, evidence);
  const components = connectedComponents(active, graph.edges);
  const clusters = components
    .flatMap((component) => splitBroad ? splitBroadComponent(component, maxCandidates) : [component])
    .filter((component) => component.length >= 2)
    .map((component, index) => clusterForComponent(runId, component, index, graph.reasons, createdAt, {
      maxCandidates,
      maxFiles,
    }));

  return clusters.sort(compareClusters).map((cluster, index) => ({
    ...cluster,
    id: clusterId(index),
  }));
}

export function unclusteredCandidateIds(
  candidates: CandidateRecord[],
  clusters: ClusterRecord[],
): string[] {
  const clustered = new Set(clusters.flatMap((cluster) => cluster.candidateIds));
  return candidates
    .filter((candidate) => candidate.status === "open" && !clustered.has(candidate.id))
    .map((candidate) => candidate.id);
}

function buildCandidateGraph(candidates: CandidateRecord[], evidence: EvidenceRecord[]): {
  edges: Array<{ from: string; to: string; weight: number }>;
  reasons: Map<string, string[]>;
} {
  const codeEdges = codeGraphEdges(evidence);
  const edges: Array<{ from: string; to: string; weight: number }> = [];
  const reasons = new Map<string, string[]>();

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      if (!left || !right) {
        continue;
      }
      const result = similarity(left, right, codeEdges);
      if (result.weight < 4) {
        continue;
      }
      edges.push({ from: left.id, to: right.id, weight: result.weight });
      reasons.set(pairKey(left.id, right.id), result.reasons);
    }
  }

  return { edges, reasons };
}

function similarity(
  left: CandidateRecord,
  right: CandidateRecord,
  codeEdges: Set<string>,
): { weight: number; reasons: string[] } {
  let weight = 0;
  const reasons: string[] = [];
  const sharedEvidence = intersection(left.evidenceIds, right.evidenceIds);
  if (sharedEvidence.length > 0) {
    weight += Math.min(8, sharedEvidence.length * 5);
    reasons.push(`shared evidence ${sharedEvidence.join(", ")}`);
  }

  const leftFiles = left.files.map((file) => file.path);
  const rightFiles = right.files.map((file) => file.path);
  const sharedFiles = intersection(leftFiles, rightFiles);
  if (sharedFiles.length > 0) {
    weight += Math.min(8, sharedFiles.length * 4);
    reasons.push(`shared files ${sharedFiles.slice(0, 3).join(", ")}`);
  }

  const sharedAreas = intersection(leftFiles.map(moduleArea), rightFiles.map(moduleArea))
    .filter((area) => area !== "." && area.split("/").length >= 3);
  if (sharedAreas.length > 0) {
    weight += 2;
    reasons.push(`same module area ${sharedAreas[0]}`);
  }

  if (hasCodeGraphLink(leftFiles, rightFiles, codeEdges)) {
    weight += 3;
    reasons.push("connected by local import graph");
  }

  if (left.category === right.category) {
    weight += 1;
  }

  const titleOverlap = intersection(tokens(left.title), tokens(right.title));
  if (titleOverlap.length >= 2) {
    weight += 1.5;
    reasons.push(`related language ${titleOverlap.slice(0, 3).join(", ")}`);
  }

  return { weight, reasons };
}

function connectedComponents(
  candidates: CandidateRecord[],
  edges: Array<{ from: string; to: string }>,
): CandidateRecord[][] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const adjacency = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    adjacency.set(candidate.id, new Set());
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const visited = new Set<string>();
  const components: CandidateRecord[][] = [];
  for (const candidate of candidates) {
    if (visited.has(candidate.id)) {
      continue;
    }
    const stack = [candidate.id];
    const component: CandidateRecord[] = [];
    visited.add(candidate.id);
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id) {
        continue;
      }
      const item = byId.get(id);
      if (item) {
        component.push(item);
      }
      for (const next of adjacency.get(id) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function clusterForComponent(
  runId: string,
  candidates: CandidateRecord[],
  index: number,
  reasons: Map<string, string[]>,
  createdAt: string,
  options: { maxCandidates: number; maxFiles: number },
): ClusterRecord {
  const sorted = [...candidates].sort(compareCandidates);
  const allFiles = uniqueFiles(sorted.flatMap((candidate) => candidate.files));
  const files = allFiles.slice(0, 20);
  const category = mode(sorted.map((candidate) => candidate.category), candidateCategories);
  const focus = clusterFocus(sorted, files);
  const priority = minBy(sorted.map((candidate) => candidate.priority), priorityScore);
  const confidence = maxBy(sorted.map((candidate) => candidate.confidence), confidenceScore);
  const impact = maxBy(sorted.map((candidate) => candidate.impact), impactScore);
  const effort = maxBy(sorted.map((candidate) => candidate.effort), effortScore);
  const risk = maxBy(sorted.map((candidate) => candidate.risk), riskScore);
  const evidenceIds = unique(sorted.flatMap((candidate) => candidate.evidenceIds));
  const connectionReasons = connectionReasonsFor(sorted, reasons);
  const title = clusterTitle(category, focus, sorted);
  const warnings = clusterWarnings(sorted, allFiles, options);
  const actionability = warnings.length > 0 ? "too-broad" : "bounded";

  return {
    schemaVersion,
    recordType: "cluster",
    id: clusterId(index),
    runId,
    title,
    summary: `${sorted.length} related candidates point at ${focus === "." ? "a shared cleanup theme" : focus}.`,
    category,
    status: aggregateStatus(sorted),
    priority,
    confidence,
    impact,
    effort,
    risk,
    candidateIds: sorted.map((candidate) => candidate.id),
    evidenceIds,
    files,
    rationale: connectionReasons.length > 0
      ? `Candidates are grouped because they have ${connectionReasons.slice(0, 4).join("; ")}.`
      : "Candidates are grouped because they share module area, files, category, or graph relationships.",
    suggestedDirection: `Treat this as one cleanup theme. Start by mapping the shared responsibility in ${focus}, then address the highest-priority candidate first while keeping the remaining candidates visible as constraints.`,
    verification: unique(sorted.flatMap((candidate) => candidate.verification)),
    actionability,
    warnings,
    createdAt,
    updatedAt: createdAt,
  };
}

function splitBroadComponent(candidates: CandidateRecord[], maxCandidates: number): CandidateRecord[][] {
  if (candidates.length <= maxCandidates) {
    return [candidates];
  }

  const byArea = groupBy(candidates, (candidate) => primaryArea(candidate));
  const areaGroups = [...byArea.values()].filter((group) => group.length >= 2);
  const singletons = [...byArea.values()].filter((group) => group.length === 1).flat();
  if (areaGroups.length > 1) {
    return [...areaGroups, ...splitByCategory(singletons, maxCandidates)].filter((group) => group.length >= 2);
  }

  return splitByCategory(candidates, maxCandidates);
}

function splitByCategory(candidates: CandidateRecord[], maxCandidates: number): CandidateRecord[][] {
  if (candidates.length === 0) {
    return [];
  }
  const byCategory = groupBy(candidates, (candidate) => candidate.category);
  const groups = [...byCategory.values()];
  if (groups.length === 1 && candidates.length > maxCandidates) {
    return chunk(candidates, maxCandidates);
  }
  return groups;
}

function clusterWarnings(
  candidates: CandidateRecord[],
  files: FileReference[],
  options: { maxCandidates: number; maxFiles: number },
): string[] {
  const warnings: string[] = [];
  if (candidates.length > options.maxCandidates) {
    warnings.push(`Theme has ${candidates.length} candidates, above the configured ${options.maxCandidates} candidate limit.`);
  }
  if (files.length > options.maxFiles) {
    warnings.push(`Theme spans ${files.length} files, above the configured ${options.maxFiles} file limit.`);
  }
  return warnings;
}

function primaryArea(candidate: CandidateRecord): string {
  return mode(candidate.files.map((file) => moduleArea(file.path)), []) || candidate.category;
}

function codeGraphEdges(evidence: EvidenceRecord[]): Set<string> {
  const graph = evidence.find((record) => record.kind === "code-graph-summary");
  const rawEdges = graph?.data["edges"];
  const edges = new Set<string>();
  if (!Array.isArray(rawEdges)) {
    return edges;
  }
  for (const edge of rawEdges) {
    if (!isObject(edge) || typeof edge["from"] !== "string" || typeof edge["to"] !== "string") {
      continue;
    }
    edges.add(`${edge["from"]}->${edge["to"]}`);
    edges.add(`${edge["to"]}->${edge["from"]}`);
  }
  return edges;
}

function hasCodeGraphLink(leftFiles: string[], rightFiles: string[], codeEdges: Set<string>): boolean {
  for (const left of leftFiles) {
    for (const right of rightFiles) {
      if (codeEdges.has(`${left}->${right}`)) {
        return true;
      }
    }
  }
  return false;
}

function connectionReasonsFor(candidates: CandidateRecord[], reasons: Map<string, string[]>): string[] {
  const values: string[] = [];
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      if (!left || !right) {
        continue;
      }
      values.push(...(reasons.get(pairKey(left.id, right.id)) ?? []));
    }
  }
  return unique(values);
}

function compareClusters(a: ClusterRecord, b: ClusterRecord): number {
  const priorityDelta = priorityScore[a.priority] - priorityScore[b.priority];
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  const impactDelta = impactScore[b.impact] - impactScore[a.impact];
  if (impactDelta !== 0) {
    return impactDelta;
  }
  return b.candidateIds.length - a.candidateIds.length;
}

function compareCandidates(a: CandidateRecord, b: CandidateRecord): number {
  const priorityDelta = priorityScore[a.priority] - priorityScore[b.priority];
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  return a.id.localeCompare(b.id);
}

function clusterTitle(
  category: ClusterRecord["category"],
  focus: string,
  candidates: CandidateRecord[],
): string {
  const label = category
    .replace("-", " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
  if (focus !== ".") {
    return `${label} cleanup around ${focus}`;
  }
  return `${label} cleanup theme: ${candidates[0]?.title ?? "related candidates"}`;
}

function clusterFocus(candidates: CandidateRecord[], files: FileReference[]): string {
  const specificAreas = files
    .map((file) => moduleArea(file.path))
    .filter((area) => area !== "." && area.split("/").length >= 3);
  if (specificAreas.length > 0) {
    return mode(specificAreas, []);
  }

  const fileCounts = new Map<string, number>();
  for (const candidate of candidates) {
    for (const file of candidate.files) {
      fileCounts.set(file.path, (fileCounts.get(file.path) ?? 0) + 1);
    }
  }
  const commonFile = [...fileCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (commonFile && commonFile[1] >= 2) {
    return commonFile[0];
  }
  return candidates[0]?.files[0]?.path ?? ".";
}

function aggregateStatus(candidates: CandidateRecord[]): ClusterRecord["status"] {
  if (candidates.some((candidate) => candidate.status === "open")) {
    return "open";
  }
  return candidates[0]?.status ?? "open";
}

function uniqueFiles(files: FileReference[]): FileReference[] {
  const seen = new Set<string>();
  const result: FileReference[] = [];
  for (const file of files) {
    const key = `${file.path}:${file.startLine ?? ""}:${file.endLine ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(file);
  }
  return result;
}

function moduleArea(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.includes("src")) {
    const srcIndex = parts.indexOf("src");
    return parts.slice(0, Math.min(parts.length - 1, srcIndex + 3)).join("/");
  }
  if (parts.length <= 1) {
    return ".";
  }
  return parts.slice(0, Math.min(parts.length - 1, 2)).join("/");
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join("|");
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return unique(left.filter((item) => rightSet.has(item)));
}

function tokens(value: string): string[] {
  return unique(value.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [])
    .filter((token) => ![
      "the",
      "and",
      "with",
      "from",
      "into",
      "around",
      "candidate",
      "large",
      "source",
      "file",
      "function",
      "nearby",
      "test",
      "discovered",
      "cleanup",
    ].includes(token));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function groupBy<T>(values: T[], keyFor: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function mode<T extends string>(values: T[], allowed: readonly T[]): T {
  const allowedSet = allowed.length > 0 ? new Set(allowed) : undefined;
  const counts = new Map<T, number>();
  for (const value of values) {
    if (allowedSet && !allowedSet.has(value)) {
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? values[0] ?? "." as T;
}

function minBy<T extends string>(values: T[], scores: Record<T, number>): T {
  const first = [...values].sort((a, b) => scores[a] - scores[b])[0];
  if (!first) {
    throw new Error("Cannot select minimum from empty values");
  }
  return first;
}

function maxBy<T extends string>(values: T[], scores: Record<T, number>): T {
  const first = [...values].sort((a, b) => scores[b] - scores[a])[0];
  if (!first) {
    throw new Error("Cannot select maximum from empty values");
  }
  return first;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
