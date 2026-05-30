import {
  candidateId,
} from "./ids.js";
import {
  churnContextProfile,
  evidenceKindScore,
  stableUtilityDependencyHotspotProfile,
} from "./candidate-scoring.js";
import { commandsForFiles, type VerificationProfile } from "./verification.js";
import { schemaVersion, type DeepcleanConfig } from "./defaults.js";

type CandidateRecord = import("./types.js").CandidateRecord;
type EvidenceRecord = import("./types.js").EvidenceRecord;

export type CandidateCaps = DeepcleanConfig["candidateCaps"];

const priorityScore = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
} as const;

export function candidatesFromEvidence(
  runId: string,
  evidence: EvidenceRecord[],
  createdAt: string,
  caps?: CandidateCaps,
  verificationProfile?: VerificationProfile,
): CandidateRecord[] {
  const sortedEvidence = [...evidence].sort(compareEvidence);
  const candidates: CandidateRecord[] = [];
  const kindCounts = new Map<string, number>();
  const areaKindCounts = new Map<string, number>();

  for (const record of sortedEvidence) {
    if (!shouldCreateLocalCandidate(record, kindCounts, areaKindCounts, caps)) {
      continue;
    }
    const candidate = candidateForEvidence(record, runId, createdAt, candidates.length, verificationProfile);
    if (!candidate) {
      continue;
    }
    candidates.push(candidate);
    kindCounts.set(record.kind, (kindCounts.get(record.kind) ?? 0) + 1);
    for (const area of candidateAreas(candidate)) {
      const key = `${record.kind}:${area}`;
      areaKindCounts.set(key, (areaKindCounts.get(key) ?? 0) + 1);
    }
  }

  return reassignCandidateIds(rankCandidates(candidates));
}

export function rankCandidates(candidates: CandidateRecord[]): CandidateRecord[] {
  return [...candidates].sort((a, b) => {
    const priorityDelta = priorityScore[a.priority] - priorityScore[b.priority];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const provenanceDelta = provenanceScore(b) - provenanceScore(a);
    if (provenanceDelta !== 0) {
      return provenanceDelta;
    }
    const readinessDelta = readinessScore(b) - readinessScore(a);
    if (readinessDelta !== 0) {
      return readinessDelta;
    }
    const impactDelta = impactScore(b.impact) - impactScore(a.impact);
    if (impactDelta !== 0) {
      return impactDelta;
    }
    const confidenceDelta = confidenceScore(b.confidence) - confidenceScore(a.confidence);
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }
    return a.id.localeCompare(b.id);
  });
}

function readinessScore(candidate: CandidateRecord): number {
  switch (candidate.readiness) {
    case "fix-ready":
      return 12;
    case "split-needed":
      return 4;
    case "design-needed":
      return -6;
    case "needs-human":
      return -10;
    case "defer":
      return -14;
    default:
      return 0;
  }
}

function shouldCreateLocalCandidate(
  evidence: EvidenceRecord,
  kindCounts: Map<string, number>,
  areaKindCounts: Map<string, number>,
  caps?: CandidateCaps,
): boolean {
  const kindLimit = localCandidateKindLimit(evidence.kind, caps);
  if (kindLimit !== undefined && (kindCounts.get(evidence.kind) ?? 0) >= kindLimit) {
    return false;
  }

  const areaLimit = localCandidateAreaLimit(evidence.kind, caps);
  if (areaLimit === undefined) {
    return true;
  }

  const areas = evidence.files.length > 0
    ? [...new Set(evidence.files.map((file) => candidateArea(file.path)))]
    : [evidence.kind];
  return areas.some((area) => (areaKindCounts.get(`${evidence.kind}:${area}`) ?? 0) < areaLimit);
}

function localCandidateKindLimit(kind: string, caps?: CandidateCaps): number | undefined {
  const configured = caps?.byKind[kind];
  if (configured !== undefined) {
    return configured;
  }
  switch (kind) {
    case "duplicate-cluster":
      return 16;
    case "dependency-hotspot":
      return 24;
    case "dependency-cycle":
      return 12;
    case "architecture-boundary-violation":
      return 24;
    case "large-function":
      return 24;
    case "large-file":
      return 24;
    case "test-gap":
      return 24;
    case "churn-hotspot":
      return 12;
    case "shallow-wrapper-cluster":
      return 16;
    default:
      return undefined;
  }
}

function localCandidateAreaLimit(kind: string, caps?: CandidateCaps): number | undefined {
  const configured = caps?.byKindAndArea[kind];
  if (configured !== undefined) {
    return configured;
  }
  switch (kind) {
    case "duplicate-cluster":
      return 4;
    case "dependency-hotspot":
    case "dependency-cycle":
    case "architecture-boundary-violation":
    case "large-function":
    case "large-file":
    case "test-gap":
      return 8;
    default:
      return undefined;
  }
}

export function reassignCandidateIds(candidates: CandidateRecord[]): CandidateRecord[] {
  return candidates.map((candidate, index) => ({
    ...candidate,
    id: candidateId(index),
  }));
}

type CandidateEvidenceBase = Pick<
  CandidateRecord,
  | "schemaVersion"
  | "recordType"
  | "id"
  | "runId"
  | "status"
  | "files"
  | "evidenceIds"
  | "affectedFeatureIds"
  | "featureScope"
  | "provenance"
  | "createdAt"
  | "updatedAt"
>;

function candidateEvidenceContext(
  evidence: EvidenceRecord,
  runId: string,
  createdAt: string,
  index: number,
  verificationProfile?: VerificationProfile,
): { base: CandidateEvidenceBase; verification: string[] } {
  const verification = commandsForFiles(verificationProfile ?? {
    defaultCommands: ["npm test", "npm run typecheck"],
    pythonCommands: ["npm test", "npm run typecheck"],
    frontendCommands: ["npm test", "npm run typecheck"],
    adminCommands: ["npm test", "npm run typecheck"],
  }, evidence.files, ["npm test", "npm run typecheck"]);
  return {
    base: {
      schemaVersion,
      recordType: "candidate" as const,
      id: candidateId(index),
      runId,
      status: "open" as const,
      files: evidence.files,
      evidenceIds: [evidence.id],
      affectedFeatureIds: evidence.affectedFeatureIds,
      featureScope: featureScopeForEvidence(evidence),
      provenance: {
        source: "local-evidence" as const,
      },
      createdAt,
      updatedAt: createdAt,
    },
    verification,
  };
}

function candidateForEvidence(
  evidence: EvidenceRecord,
  runId: string,
  createdAt: string,
  index: number,
  verificationProfile?: VerificationProfile,
): CandidateRecord | undefined {
  const { base, verification } = candidateEvidenceContext(evidence, runId, createdAt, index, verificationProfile);

  switch (evidence.kind) {
    case "duplicate-cluster":
    case "external-duplicate":
      return duplicateCandidateForEvidence(evidence, base, verification);
    case "sarif-finding":
    case "dependency-hotspot":
    case "dependency-cycle":
    case "architecture-boundary-violation":
      return diagnosticOrArchitectureCandidateForEvidence(evidence, base, verification);
    case "large-file":
    case "large-function":
      return {
        ...base,
        title: evidence.title,
        category: "complexity",
        priority: evidence.confidence === "high" ? "P1" : "P2",
        confidence: evidence.confidence,
        impact: "feature",
        effort: evidence.confidence === "high" ? "large" : "medium",
        risk: "moderate",
        whyItMatters: "Large units are harder for agents and humans to review, test, and change without accidentally mixing concerns.",
        likelyRootCause: "Fetching, state, validation, rendering, or orchestration logic may have accumulated in one place during fast implementation.",
        suggestedDirection: "Map the responsibilities in this unit, extract stable domain logic first, and leave UI or orchestration behavior thin.",
        verification,
      };
    case "test-gap":
      return {
        ...base,
        title: evidence.title,
        category: "testability",
        priority: "P2",
        confidence: evidence.confidence,
        impact: "feature",
        effort: "small",
        risk: "safe",
        whyItMatters: "Cleanup work is riskier when feature logic has weak nearby tests or no obvious verification path.",
        likelyRootCause: "The feature may have been implemented before test seams or source-to-test structure were established.",
        suggestedDirection: "Add targeted tests around the behavior before significant refactoring, especially for validation, state transitions, and edge cases.",
        verification,
      };
    case "churn-hotspot":
      const churnProfile = churnContextProfile(evidence);
      return {
        ...base,
        title: evidence.title,
        category: "architecture",
        priority: churnProfile.priority,
        confidence: evidence.confidence,
        impact: "feature",
        effort: churnProfile.effort,
        risk: churnProfile.risk,
        readiness: churnProfile.readiness,
        whyItMatters: churnProfile.whyItMatters,
        likelyRootCause: churnProfile.likelyRootCause,
        suggestedDirection: churnProfile.suggestedDirection,
        verification,
      };
    case "shallow-wrapper-cluster":
      return {
        ...base,
        title: evidence.title,
        category: "ai-slop",
        priority: "P2",
        confidence: evidence.confidence,
        impact: "feature",
        effort: "small",
        risk: "moderate",
        whyItMatters: "Clusters of shallow wrappers create indirection without leverage and make agents chase names instead of concepts.",
        likelyRootCause: "Fast AI-assisted implementation may have introduced wrapper helpers to make code look organized without creating real boundaries.",
        suggestedDirection: "Review the cluster and keep only wrappers that name real domain concepts, centralize policy, or provide stable seams.",
        verification,
      };
    default:
      return undefined;
  }
}

function diagnosticOrArchitectureCandidateForEvidence(
  evidence: EvidenceRecord,
  base: CandidateEvidenceBase,
  verification: string[],
): CandidateRecord | undefined {
  switch (evidence.kind) {
    case "sarif-finding":
      return {
        ...base,
        title: evidence.title,
        category: "diagnostic",
        priority: evidence.confidence === "high" ? "P1" : "P2",
        confidence: evidence.confidence,
        impact: evidence.files.length >= 3 ? "cross-cutting" : "feature",
        effort: "medium",
        risk: "moderate",
        whyItMatters: "External analyzer findings can point at maintainability, correctness, or policy issues that local Deepclean heuristics should preserve as evidence.",
        likelyRootCause: "A specialized analyzer found a source-level issue that needs human or agent review before structural cleanup.",
        suggestedDirection: "Inspect the analyzer finding, decide whether it is real, and either address it directly or triage it with a note before deeper cleanup.",
        verification,
      };
    case "dependency-hotspot":
      const utilityProfile = stableUtilityDependencyHotspotProfile(evidence);
      if (utilityProfile) {
        return {
          ...base,
          title: evidence.title,
          category: "architecture",
          priority: utilityProfile.priority,
          confidence: evidence.confidence,
          impact: "cross-cutting",
          effort: utilityProfile.effort,
          risk: utilityProfile.risk,
          readiness: utilityProfile.readiness,
          whyItMatters: utilityProfile.whyItMatters,
          likelyRootCause: utilityProfile.likelyRootCause,
          suggestedDirection: utilityProfile.suggestedDirection,
          verification,
        };
      }
      return {
        ...base,
        title: evidence.title,
        category: "architecture",
        priority: evidence.confidence === "high" ? "P1" : "P2",
        confidence: evidence.confidence,
        impact: "cross-cutting",
        effort: "medium",
        risk: "design-needed",
        whyItMatters: "Files with high fan-in or fan-out become expensive to change because unrelated features may depend on their shape.",
        likelyRootCause: "Responsibilities may be concentrated in a broad helper, orchestration module, or feature file that needs clearer boundaries.",
        suggestedDirection: "Review callers and imports, then separate stable domain logic from feature-specific coordination if the coupling is accidental.",
        verification,
      };
    case "dependency-cycle":
      return {
        ...base,
        title: evidence.title,
        category: "architecture",
        priority: evidence.confidence === "high" ? "P1" : "P2",
        confidence: evidence.confidence,
        impact: evidence.files.length >= 3 ? "cross-cutting" : "feature",
        effort: "medium",
        risk: "design-needed",
        readiness: "split-needed",
        whyItMatters: "Dependency cycles make local changes harder to reason about because modules cannot be understood or extracted independently.",
        likelyRootCause: "Two or more modules likely share responsibilities or depend on each other's implementation details instead of a stable lower-level contract.",
        suggestedDirection: "Pick the smallest edge in the cycle, introduce a stable owner or interface, and remove one import while preserving behavior.",
        verification,
      };
    case "architecture-boundary-violation":
      return {
        ...base,
        title: evidence.title,
        category: "architecture",
        priority: "P1",
        confidence: evidence.confidence,
        impact: "feature",
        effort: "medium",
        risk: "moderate",
        readiness: "fix-ready",
        whyItMatters: "Configured layer boundaries encode architecture intent; violations let higher-level or unrelated code depend on implementation details.",
        likelyRootCause: "A module imported across a disallowed layer instead of depending on an allowed public contract or moving ownership to the right layer.",
        suggestedDirection: "Replace the violating import with an allowed dependency direction, move the shared contract, or update policy only if the rule is wrong.",
        verification,
      };
    default:
      return undefined;
  }
}

function duplicateCandidateForEvidence(
  evidence: EvidenceRecord,
  base: CandidateEvidenceBase,
  verification: string[],
): CandidateRecord {
  return {
    ...base,
    title: evidence.title,
    category: "duplication",
    priority: evidence.confidence === "high" ? "P1" : "P2",
    confidence: evidence.confidence,
    impact: evidence.files.length >= 3 ? "cross-cutting" : "feature",
    effort: "medium",
    risk: "moderate",
    whyItMatters: "Repeated code paths tend to drift after later AI edits, creating inconsistent behavior that tests may not cover.",
    likelyRootCause: "Similar behavior was implemented in multiple places instead of being pulled into one domain-level module or shared component.",
    suggestedDirection: "Inspect the duplicated call sites and decide whether the shared concept should become a single module, helper, component, or explicit abstraction.",
    verification,
  };
}

function featureScopeForEvidence(evidence: EvidenceRecord): CandidateRecord["featureScope"] {
  if (evidence.affectedFeatureIds.length === 0) {
    return "unmapped";
  }
  if (evidence.affectedFeatureIds.length > 1) {
    return "cross-feature";
  }
  const roles = new Set(evidence.fileRoles.map((role) => role.role));
  if (roles.has("shared") || roles.has("context")) {
    return "shared-context";
  }
  return "feature-local";
}

function compareEvidence(a: EvidenceRecord, b: EvidenceRecord): number {
  const kindDelta = evidenceKindScore(b.kind) - evidenceKindScore(a.kind);
  if (kindDelta !== 0) {
    return kindDelta;
  }
  const confidenceDelta = confidenceScore(b.confidence) - confidenceScore(a.confidence);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }
  return a.id.localeCompare(b.id);
}

function confidenceScore(confidence: CandidateRecord["confidence"]): number {
  switch (confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

function impactScore(impact: CandidateRecord["impact"]): number {
  switch (impact) {
    case "cross-cutting":
      return 3;
    case "feature":
      return 2;
    case "local":
      return 1;
  }
}

function provenanceScore(candidate: CandidateRecord): number {
  return candidate.provenance.source === "model-synthesis" ? 2 : 1;
}

function candidateAreas(candidate: CandidateRecord): string[] {
  return [...new Set(candidate.files.map((file) => candidateArea(file.path)))];
}

export function candidateArea(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length === 0) {
    return ".";
  }
  const srcIndex = parts.indexOf("src");
  if (srcIndex >= 0) {
    const end = Math.min(parts.length - 1, srcIndex + 3);
    return parts.slice(0, end).join("/") || (parts[0] ?? ".");
  }
  if (parts.length <= 2) {
    return parts.length === 1 ? "." : parts[0] ?? ".";
  }
  return parts.slice(0, 2).join("/");
}
