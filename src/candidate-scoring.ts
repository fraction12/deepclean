type CandidateRecord = import("./types.js").CandidateRecord;
type EvidenceRecord = import("./types.js").EvidenceRecord;

export type CandidateScoringProfile = Pick<
  CandidateRecord,
  | "priority"
  | "effort"
  | "risk"
  | "whyItMatters"
  | "likelyRootCause"
  | "suggestedDirection"
> & {
  readiness: NonNullable<CandidateRecord["readiness"]>;
};

export function stableUtilityDependencyHotspotProfile(evidence: EvidenceRecord): CandidateScoringProfile | undefined {
  if (!isStableUtilityDependencyHotspot(evidence)) {
    return undefined;
  }
  return {
    priority: "P2",
    effort: "small",
    risk: "safe",
    readiness: "defer",
    whyItMatters: "Stable utility modules can have high fan-in by design; many callers depending on a tiny policy module is not automatically architecture debt.",
    likelyRootCause: "A small utility, config, identity, or serialization module is being reused consistently across the codebase.",
    suggestedDirection: "Leave this alone unless it also gains high fan-out, churn, cycles, size pressure, or mixed domain responsibility.",
  };
}

export function churnContextProfile(evidence: EvidenceRecord): CandidateScoringProfile {
  return {
    priority: evidence.confidence === "high" ? "P2" : "P3",
    effort: "small",
    risk: "safe",
    readiness: "defer",
    whyItMatters: "High churn is useful context for review, but history alone is not an actionable cleanup target.",
    likelyRootCause: "The file may be changing often because active product work naturally flows through it, or because a deeper boundary issue exists elsewhere.",
    suggestedDirection: "Use churn as supporting evidence only; promote it when the same file is also large, cyclic, unstable, or carrying mixed responsibilities.",
  };
}

export function evidenceKindScore(kind: string): number {
  switch (kind) {
    case "duplicate-cluster":
      return 80;
    case "dependency-hotspot":
      return 75;
    case "architecture-boundary-violation":
      return 74;
    case "dependency-cycle":
      return 73;
    case "large-function":
      return 70;
    case "large-file":
      return 65;
    case "test-gap":
      return 45;
    case "churn-hotspot":
      return 25;
    case "shallow-wrapper-cluster":
      return 20;
    default:
      return 0;
  }
}

function isStableUtilityDependencyHotspot(evidence: EvidenceRecord): boolean {
  const metrics = dependencyHotspotMetrics(evidence);
  if (!metrics) {
    return false;
  }
  const filePath = evidence.files[0]?.path;
  return filePath !== undefined
    && metrics.incoming >= 4
    && metrics.outgoing <= 3
    && isUtilityLikeModulePath(filePath);
}

function dependencyHotspotMetrics(evidence: EvidenceRecord): { incoming: number; outgoing: number } | undefined {
  const incoming = evidence.data["incoming"];
  const outgoing = evidence.data["outgoing"];
  if (typeof incoming !== "number" || typeof outgoing !== "number") {
    return undefined;
  }
  return { incoming, outgoing };
}

function isUtilityLikeModulePath(filePath: string): boolean {
  const fileName = filePath.split("/").pop() ?? filePath;
  return /^(ids|json|defaults|config|constants|discovery|verification|source-policy|file-references)\.[cm]?[jt]sx?$/.test(fileName);
}
