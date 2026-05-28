import { readFile } from "node:fs/promises";
import path from "node:path";
import { candidateId } from "./ids.js";
import {
  schemaVersion,
  type CandidateDecomposition,
  type CandidateRecord,
  type EvidenceRecord,
  type FeatureRecord,
  type FileReference,
} from "./types.js";

export interface CandidateSplitResult {
  parent: CandidateRecord;
  children: CandidateRecord[];
  strategy: CandidateDecomposition["strategy"];
}

export function isSplittableParentCandidate(
  candidate: CandidateRecord,
  evidence: EvidenceRecord[],
): boolean {
  if (candidate.decomposition?.parentCandidateId) {
    return false;
  }
  const kinds = evidenceForCandidate(candidate, evidence).map((record) => record.kind);
  return (
    candidate.risk === "design-needed"
    || candidate.effort === "large"
    || kinds.some((kind) => [
      "large-function",
      "large-file",
      "dependency-hotspot",
      "shallow-wrapper-cluster",
    ].includes(kind))
  );
}

export async function splitCandidate(options: {
  root: string;
  runId: string;
  candidate: CandidateRecord;
  candidates: CandidateRecord[];
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
  createdAt: string;
}): Promise<CandidateSplitResult | undefined> {
  const supportingEvidence = evidenceForCandidate(options.candidate, options.evidence);
  if (!isSplittableParentCandidate(options.candidate, options.evidence)) {
    return undefined;
  }

  const existingChildren = existingChildCandidates(options.candidate, options.candidates);
  if (existingChildren.length > 0) {
    return {
      parent: options.candidate,
      children: existingChildren,
      strategy: options.candidate.decomposition?.strategy ?? splitStrategy(options.candidate, supportingEvidence),
    };
  }

  const strategy = splitStrategy(options.candidate, supportingEvidence);
  const childInputs = await childInputsForStrategy({
    root: options.root,
    parent: options.candidate,
    evidence: supportingEvidence,
    allEvidence: options.evidence,
    features: options.features,
    strategy,
  });
  if (childInputs.length === 0) {
    return undefined;
  }

  const childIds = childInputs.map((_, index) => candidateId(options.candidates.length + index));
  const rootCandidateId = options.candidate.decomposition?.rootCandidateId ?? options.candidate.id;
  const total = childInputs.length;
  const children = childInputs.map((input, index): CandidateRecord => ({
    schemaVersion,
    recordType: "candidate",
    id: childIds[index] ?? candidateId(options.candidates.length + index),
    runId: options.runId,
    status: "open",
    title: input.title,
    category: options.candidate.category,
    priority: options.candidate.priority,
    confidence: options.candidate.confidence,
    impact: input.files.length > 1 ? options.candidate.impact : "feature",
    effort: input.effort,
    risk: input.risk,
    files: input.files,
    evidenceIds: input.evidenceIds.length > 0 ? input.evidenceIds : options.candidate.evidenceIds,
    affectedFeatureIds: options.candidate.affectedFeatureIds,
    featureScope: options.candidate.featureScope,
    whyItMatters: options.candidate.whyItMatters,
    likelyRootCause: options.candidate.likelyRootCause,
    suggestedDirection: input.suggestedDirection,
    verification: options.candidate.verification,
    fixReadiness: {
      minimumFixScope: input.suggestedDirection,
      suggestedRegressionTest: "Use the parent candidate's verification commands and add a focused regression only if behavior changes.",
      whyCurrentTestsMissIt: "The child candidate is a structural slice of a broader maintainability finding, not a separately discovered behavior failure.",
      confidenceDowngradeReasons: [],
    },
    decomposition: {
      parentCandidateId: options.candidate.id,
      rootCandidateId,
      strategy,
      sequence: index + 1,
      total,
      reason: input.reason,
      createdAt: options.createdAt,
    },
    provenance: {
      source: "candidate-decomposition",
      runtime: {
        parentCandidateId: options.candidate.id,
        strategy,
      },
    },
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
  }));

  const parent: CandidateRecord = {
    ...options.candidate,
    status: "superseded",
    decomposition: {
      childCandidateIds: children.map((child) => child.id),
      rootCandidateId,
      strategy,
      reason: "Parent candidate was decomposed into PR-sized child candidates.",
      createdAt: options.createdAt,
    },
    updatedAt: options.createdAt,
  };
  return { parent, children, strategy };
}

function evidenceForCandidate(candidate: CandidateRecord, evidence: EvidenceRecord[]): EvidenceRecord[] {
  const ids = new Set(candidate.evidenceIds);
  return evidence.filter((record) => ids.has(record.id));
}

function existingChildCandidates(parent: CandidateRecord, candidates: CandidateRecord[]): CandidateRecord[] {
  const childIds = new Set(parent.decomposition?.childCandidateIds ?? []);
  return candidates.filter((candidate) => (
    childIds.has(candidate.id)
    || candidate.decomposition?.parentCandidateId === parent.id
  ));
}

function splitStrategy(
  candidate: CandidateRecord,
  evidence: EvidenceRecord[],
): CandidateDecomposition["strategy"] {
  const kinds = evidence.map((record) => record.kind);
  if (kinds.includes("shallow-wrapper-cluster")) {
    return "wrapper-slices";
  }
  if (kinds.includes("dependency-hotspot") || candidate.risk === "design-needed") {
    return "dependency-hotspot-slices";
  }
  if (kinds.includes("large-file")) {
    return "large-file-slices";
  }
  return "large-function-slices";
}

async function childInputsForStrategy(options: {
  root: string;
  parent: CandidateRecord;
  evidence: EvidenceRecord[];
  allEvidence: EvidenceRecord[];
  features: FeatureRecord[];
  strategy: CandidateDecomposition["strategy"];
}): Promise<Array<{
  title: string;
  files: FileReference[];
  evidenceIds: string[];
  effort: CandidateRecord["effort"];
  risk: CandidateRecord["risk"];
  reason: string;
  suggestedDirection: string;
}>> {
  switch (options.strategy) {
    case "wrapper-slices":
      return wrapperChildInputs(options.parent, options.evidence);
    case "dependency-hotspot-slices":
      return dependencyChildInputs(options.parent, options.evidence, options.features);
    case "large-file-slices":
      return largeFileChildInputs(options.parent, options.evidence, options.allEvidence);
    case "large-function-slices":
      return await largeFunctionChildInputs(options.root, options.parent, options.evidence);
  }
}

function wrapperChildInputs(parent: CandidateRecord, evidence: EvidenceRecord[]) {
  const record = evidence.find((item) => item.kind === "shallow-wrapper-cluster");
  const wrappers = record ? wrapperRefs(record) : parent.files;
  return chunk(wrappers, 3).map((files, index) => ({
    title: `${parent.title} slice ${index + 1}`,
    files,
    evidenceIds: record ? [record.id] : parent.evidenceIds,
    effort: "small" as const,
    risk: "moderate" as const,
    reason: "Shallow-wrapper clusters are safe to review in small groups.",
    suggestedDirection: "Inline wrappers that add no policy or domain meaning, and keep only wrappers that name a real concept or centralize behavior.",
  }));
}

function dependencyChildInputs(
  parent: CandidateRecord,
  evidence: EvidenceRecord[],
  features: FeatureRecord[],
) {
  const record = evidence.find((item) => item.kind === "dependency-hotspot");
  const target = parent.files[0];
  const targetPath = target?.path ?? "the target file";
  const relatedFeatureFiles = features
    .filter((feature) => parent.affectedFeatureIds.includes(feature.featureId))
    .flatMap((feature) => feature.ownedFiles)
    .filter((file) => file.path !== targetPath)
    .slice(0, 4);
  const baseFiles = target ? [target] : parent.files;
  const evidenceIds = record ? [record.id] : parent.evidenceIds;
  return [
    {
      title: `Split incoming dependency pressure for ${targetPath}`,
      files: uniqueFileRefs([...baseFiles, ...relatedFeatureFiles]),
      evidenceIds,
      effort: "medium" as const,
      risk: "moderate" as const,
      reason: "Dependency hotspots need one direction of coupling handled at a time.",
      suggestedDirection: "Review incoming callers and extract only the smallest stable API or type boundary that reduces caller coupling.",
    },
    {
      title: `Split outgoing dependency pressure for ${targetPath}`,
      files: baseFiles,
      evidenceIds,
      effort: "medium" as const,
      risk: "moderate" as const,
      reason: "Dependency hotspots need one direction of coupling handled at a time.",
      suggestedDirection: "Review outgoing imports and move only one coherent helper, policy, or adapter concern closer to its owner.",
    },
  ];
}

function largeFileChildInputs(
  parent: CandidateRecord,
  evidence: EvidenceRecord[],
  allEvidence: EvidenceRecord[],
) {
  const targetPath = parent.files[0]?.path;
  const localEvidence = targetPath
    ? allEvidence.filter((record) => (
      record.id !== evidence[0]?.id
      && record.files.some((file) => file.path === targetPath)
      && record.kind !== "large-file"
    )).slice(0, 5)
    : [];
  if (localEvidence.length > 0) {
    return localEvidence.map((record, index) => ({
      title: `Large-file slice ${index + 1}: ${record.title}`,
      files: record.files.filter((file) => !targetPath || file.path === targetPath).slice(0, 4),
      evidenceIds: [record.id],
      effort: record.kind === "large-function" ? "medium" as const : "small" as const,
      risk: "moderate" as const,
      reason: "Large files should be reduced through existing local evidence slices.",
      suggestedDirection: `Address this local slice first while keeping the broader large-file parent visible: ${record.summary}`,
    }));
  }
  return rangeChildInputs(parent, "Large-file slice", "Move one cohesive responsibility out of this file or closer to its owner.");
}

async function largeFunctionChildInputs(
  root: string,
  parent: CandidateRecord,
  evidence: EvidenceRecord[],
) {
  const record = evidence.find((item) => item.kind === "large-function");
  const target = record?.files[0] ?? parent.files[0];
  if (!target?.startLine || !target.endLine) {
    return rangeChildInputs(parent, "Large-function slice", "Extract one cohesive block from this function.");
  }
  const functionName = typeof record?.data["name"] === "string" ? record.data["name"] : parent.title.replace(/^Large function:\s*/, "");
  const chunkSize = 45;
  const ranges = await statementAwareRanges(root, target, chunkSize);
  return ranges.slice(0, 5).map((file, index) => ({
    title: `Extract ${functionName} slice ${index + 1}`,
    files: [file],
    evidenceIds: record ? [record.id] : parent.evidenceIds,
    effort: "medium" as const,
    risk: "moderate" as const,
    reason: "Large functions should be reduced through one responsibility slice per PR.",
    suggestedDirection: "Extract one cohesive helper or policy block from the cited line range without changing external behavior.",
  }));
}

function rangeChildInputs(parent: CandidateRecord, titlePrefix: string, direction: string) {
  const ranges = parent.files.flatMap((file) => splitFileRange(file, 60)).slice(0, 5);
  return ranges.map((file, index) => ({
    title: `${titlePrefix} ${index + 1}: ${file.path}`,
    files: [file],
    evidenceIds: parent.evidenceIds,
    effort: "medium" as const,
    risk: "moderate" as const,
    reason: "The parent candidate is too broad for one safe patch.",
    suggestedDirection: direction,
  }));
}

async function statementAwareRanges(root: string, file: FileReference, chunkSize: number): Promise<FileReference[]> {
  const lineCount = Math.max(1, (file.endLine ?? file.startLine ?? 1) - (file.startLine ?? 1) + 1);
  if (lineCount <= chunkSize) {
    return [file];
  }
  try {
    const raw = await readFile(path.join(root, file.path), "utf8");
    const lines = raw.split(/\r?\n/);
    const start = file.startLine ?? 1;
    const end = file.endLine ?? lines.length;
    const breakpoints = new Set<number>([start, end + 1]);
    for (let line = start; line <= end; line += 1) {
      const text = lines[line - 1]?.trim() ?? "";
      if (/^(const|let|var|if|for|while|switch|try|await|return)\b/.test(text)) {
        breakpoints.add(line);
      }
    }
    const sorted = [...breakpoints].sort((a, b) => a - b);
    const ranges: FileReference[] = [];
    let rangeStart = start;
    for (const point of sorted) {
      if (point <= rangeStart) {
        continue;
      }
      if (point - rangeStart >= chunkSize) {
        ranges.push({ path: file.path, startLine: rangeStart, endLine: point - 1 });
        rangeStart = point;
      }
    }
    if (rangeStart <= end) {
      ranges.push({ path: file.path, startLine: rangeStart, endLine: end });
    }
    return ranges.length > 0 ? ranges : splitFileRange(file, chunkSize);
  } catch {
    return splitFileRange(file, chunkSize);
  }
}

function splitFileRange(file: FileReference, chunkSize: number): FileReference[] {
  const start = file.startLine ?? 1;
  const end = file.endLine ?? start;
  const ranges: FileReference[] = [];
  for (let line = start; line <= end; line += chunkSize) {
    ranges.push({
      path: file.path,
      startLine: line,
      endLine: Math.min(end, line + chunkSize - 1),
    });
  }
  return ranges.length > 0 ? ranges : [file];
}

function wrapperRefs(record: EvidenceRecord): FileReference[] {
  const wrappers = record.data["wrappers"];
  if (!Array.isArray(wrappers)) {
    return record.files;
  }
  return wrappers.flatMap((item): FileReference[] => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const wrapper = item as Record<string, unknown>;
    const pathValue = record.files[0]?.path;
    const startLine = wrapper["startLine"];
    const endLine = wrapper["endLine"];
    if (typeof pathValue !== "string" || typeof startLine !== "number" || typeof endLine !== "number") {
      return [];
    }
    return [{ path: pathValue, startLine, endLine }];
  });
}

function uniqueFileRefs(files: FileReference[]): FileReference[] {
  const seen = new Set<string>();
  const result: FileReference[] = [];
  for (const file of files) {
    const key = `${file.path}:${file.startLine ?? ""}:${file.endLine ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(file);
    }
  }
  return result;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
