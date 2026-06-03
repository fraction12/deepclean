import type { CandidateRecord, PrOpportunityRecord, QualityGateFinding } from "./types.js";

export type SlopType = NonNullable<CandidateRecord["slopType"]>;
export type FixabilityLevel = NonNullable<CandidateRecord["fixability"]>;

export function deriveSlopType(candidate: CandidateRecord): SlopType {
  if (candidate.slopType) {
    return candidate.slopType;
  }
  switch (candidate.category) {
    case "architecture":
      return "structure";
    case "duplication":
      return "duplication";
    case "complexity":
      return isWeakMetricCandidate(candidate) ? "metric-only" : "complexity";
    case "testability":
      return "testability";
    case "dead-weight":
      return "dead-weight";
    case "ai-slop":
      return "ai-slop";
    case "domain-drift":
      return "domain-drift";
    case "diagnostic":
      return "analyzer";
    default:
      return "metric-only";
  }
}

export function deriveCandidateFixability(candidate: CandidateRecord): FixabilityLevel {
  if (candidate.fixability) {
    return candidate.fixability;
  }
  if (candidate.status === "false-positive" || candidate.status === "ignored" || candidate.status === "stale") {
    return "noise";
  }
  if (candidate.status === "fixed" || candidate.status === "superseded") {
    return "review-only";
  }
  if (candidate.confidence === "low" && isWeakMetricCandidate(candidate)) {
    return "noise";
  }
  if (candidate.risk === "design-needed" || candidate.readiness === "design-needed" || candidate.readiness === "split-needed") {
    return "human-design-needed";
  }
  if (candidate.readiness === "needs-human" || candidate.readiness === "defer" || candidate.impact === "cross-cutting") {
    return "human-design-needed";
  }
  if (candidate.readiness === "fix-ready"
    && candidate.risk === "safe"
    && candidate.verification.length > 0
    && !hasMissingProof(candidate)) {
    return "auto-fixable";
  }
  return "agent-fixable";
}

export function deriveOpportunityFixability(opportunity: PrOpportunityRecord): FixabilityLevel {
  if (opportunity.fixability) {
    return opportunity.fixability;
  }
  return deriveFixabilityFromOpportunityClassification(opportunity.classification);
}

export function deriveFixabilityFromOpportunityClassification(
  classification: PrOpportunityRecord["classification"],
): FixabilityLevel {
  switch (classification) {
    case "safe-narrow-pr":
      return "auto-fixable";
    case "tests-first":
      return "agent-fixable";
    case "spec-design-first":
    case "bad-target":
    case "backlog-design-debt":
    case "do-not-automate":
      return "human-design-needed";
    case "duplicate":
    case "stop-campaign":
      return "noise";
    default:
      return "review-only";
  }
}

export function deriveQualityFindingActionability(
  finding: Pick<QualityGateFinding, "severity" | "candidateIds" | "opportunityIds" | "fixability">,
): NonNullable<QualityGateFinding["actionability"]> {
  if (finding.severity === "blocker") {
    return "merge-blocker";
  }
  if (finding.fixability === "auto-fixable" || finding.fixability === "agent-fixable") {
    return "cleanup-recommendation";
  }
  if (finding.candidateIds.length > 0 || finding.opportunityIds.length > 0) {
    return "warning";
  }
  return "review-only";
}

function isWeakMetricCandidate(candidate: CandidateRecord): boolean {
  if (candidate.evidenceIds.length > 1 || candidate.confidence === "high") {
    return false;
  }
  return candidate.category === "complexity" || candidate.category === "testability" || candidate.category === "diagnostic";
}

function hasMissingProof(candidate: CandidateRecord): boolean {
  return candidate.proofRequired !== undefined
    && candidate.proofRequired.length > 0
    && candidate.verification.length === 0;
}
