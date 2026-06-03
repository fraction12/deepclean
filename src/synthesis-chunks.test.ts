import { describe, expect, test } from "vitest";
import { planSynthesisChunks } from "./synthesis-chunks.js";
import { schemaVersion, type CandidateRecord, type EvidenceRecord, type FeatureRecord } from "./types.js";

const createdAt = "2026-06-03T00:00:00.000Z";

describe("synthesis chunk planning", () => {
  test("keeps small evidence sets in one whole-repository chunk", () => {
    const evidence = [
      evidenceRecord("ev-001", "src/reporting.ts"),
      evidenceRecord("ev-002", "src/synthesis.ts"),
    ];
    const features = [featureRecord("feature-reporting", "src/reporting.ts")];
    const existingCandidates = [candidateRecord("candidate-001", "src/reporting.ts", ["ev-001"])];

    const chunks = planSynthesisChunks({
      evidence,
      features,
      existingCandidates,
      tokenBudget: 120_000,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.id).toBe("chunk-001-whole-repo");
    expect(chunks[0]?.evidence.map((record) => record.id)).toEqual(["ev-001", "ev-002"]);
    expect(chunks[0]?.features.map((feature) => feature.featureId)).toEqual(["feature-reporting"]);
    expect(chunks[0]?.existingCandidates.map((candidate) => candidate.id)).toEqual(["candidate-001"]);
  });

  test("quality-gate mode keeps one bounded packet around top candidates", () => {
    const evidence = Array.from({ length: 30 }, (_, index) => (
      evidenceRecord(`ev-${String(index + 1).padStart(3, "0")}`, `src/module-${index + 1}.ts`)
    ));
    const existingCandidates = Array.from({ length: 8 }, (_, index) => (
      candidateRecord(
        `candidate-${String(index + 1).padStart(3, "0")}`,
        `src/module-${index + 1}.ts`,
        [`ev-${String(index + 1).padStart(3, "0")}`],
      )
    ));

    const chunks = planSynthesisChunks({
      evidence,
      features: [],
      existingCandidates,
      tokenBudget: 120_000,
      mode: "quality-gate",
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.id).toBe("chunk-001-quality-gate");
    expect(chunks[0]?.evidence.map((record) => record.id)).toEqual([
      "ev-001",
      "ev-002",
      "ev-003",
      "ev-004",
      "ev-005",
      "ev-006",
    ]);
    expect(chunks[0]?.existingCandidates.map((candidate) => candidate.id)).toEqual([
      "candidate-001",
      "candidate-002",
      "candidate-003",
      "candidate-004",
      "candidate-005",
      "candidate-006",
    ]);
  });

  test("splits broad synthesis by primary source area", () => {
    const evidence = [
      ...Array.from({ length: 31 }, (_, index) => evidenceRecord(`ev-api-${index}`, `src/api/file-${index}.ts`)),
      ...Array.from({ length: 30 }, (_, index) => evidenceRecord(`ev-cli-${index}`, `src/cli/file-${index}.ts`)),
    ];
    const features = [
      featureRecord("feature-api", "src/api/index.ts"),
      featureRecord("feature-cli", "src/cli/index.ts"),
    ];
    const existingCandidates = [
      candidateRecord("candidate-api", "src/api/file-1.ts", ["ev-api-1"]),
      candidateRecord("candidate-cli", "src/cli/file-1.ts", ["ev-cli-1"]),
    ];

    const chunks = planSynthesisChunks({
      evidence,
      features,
      existingCandidates,
      tokenBudget: 120_000,
    });

    expect(chunks.map((chunk) => chunk.id)).toEqual(["chunk-001-src-api", "chunk-001-src-cli"]);
    expect(chunks.map((chunk) => chunk.evidence.length)).toEqual([31, 30]);
    expect(chunks[0]?.features.map((feature) => feature.featureId)).toEqual(["feature-api"]);
    expect(chunks[1]?.features.map((feature) => feature.featureId)).toEqual(["feature-cli"]);
    expect(chunks[0]?.existingCandidates.map((candidate) => candidate.id)).toEqual(["candidate-api"]);
    expect(chunks[1]?.existingCandidates.map((candidate) => candidate.id)).toEqual(["candidate-cli"]);
  });
});

function evidenceRecord(id: string, filePath: string): EvidenceRecord {
  return {
    schemaVersion,
    recordType: "evidence",
    id,
    runId: "run-test",
    adapter: "test",
    kind: "large-function",
    title: id,
    summary: id,
    files: [{ path: filePath }],
    affectedFeatureIds: [],
    fileRoles: [],
    data: {},
    confidence: "high",
    createdAt,
  };
}

function featureRecord(featureId: string, filePath: string): FeatureRecord {
  return {
    schemaVersion,
    recordType: "feature",
    featureId,
    runId: "run-test",
    title: featureId,
    summary: featureId,
    kind: "module",
    source: "local-source",
    mapSource: "heuristic",
    mapperVersion: "local-v1",
    confidence: "high",
    entrypoints: [{ path: filePath }],
    ownedFiles: [{ path: filePath }],
    contextFiles: [],
    testFiles: [],
    fileRoles: [],
    reasons: [],
    verification: ["npm test"],
    tags: ["module"],
    createdAt,
    updatedAt: createdAt,
  };
}

function candidateRecord(id: string, filePath: string, evidenceIds: string[]): CandidateRecord {
  return {
    schemaVersion,
    recordType: "candidate",
    id,
    runId: "run-test",
    title: id,
    category: "complexity",
    status: "open",
    priority: "P2",
    confidence: "medium",
    impact: "feature",
    effort: "small",
    risk: "safe",
    files: [{ path: filePath }],
    evidenceIds,
    affectedFeatureIds: [],
    featureScope: "feature-local",
    whyItMatters: "test",
    likelyRootCause: "test",
    suggestedDirection: "test",
    verification: ["npm test"],
    provenance: { source: "local-evidence" },
    createdAt,
    updatedAt: createdAt,
  };
}
