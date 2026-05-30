export const candidateStatuses = [
  "open",
  "investigating",
  "handed-off",
  "ignored",
  "false-positive",
  "stale",
  "fixed",
  "superseded",
] as const;

export const candidateCategories = [
  "architecture",
  "complexity",
  "duplication",
  "testability",
  "dead-weight",
  "ai-slop",
  "domain-drift",
  "diagnostic",
] as const;

export const priorities = ["P0", "P1", "P2", "P3"] as const;
export const confidenceLevels = ["low", "medium", "high"] as const;
export const effortLevels = ["small", "medium", "large"] as const;
export const impactLevels = ["local", "feature", "cross-cutting"] as const;
export const riskLevels = ["safe", "moderate", "design-needed"] as const;
export const candidateReadinessLevels = [
  "fix-ready",
  "split-needed",
  "design-needed",
  "needs-human",
  "defer",
] as const;
export const clusterActionability = ["bounded", "too-broad"] as const;
export const identityConfidenceLevels = ["low", "medium", "high"] as const;
export const decompositionStrategies = [
  "large-function-slices",
  "large-file-slices",
  "dependency-hotspot-slices",
  "wrapper-slices",
] as const;
export const lifecycleEventKinds = [
  "created",
  "observed",
  "triaged",
  "suppressed",
  "revalidated",
  "changed",
  "fixed",
  "stale",
  "superseded",
  "fix-refused",
  "patch-started",
  "patch-applied",
  "scope-failed",
  "fix-attempted",
  "verification-passed",
  "verification-failed",
  "unverified",
] as const;
export const lifecycleStates = [
  "new",
  "ready",
  "design-needed",
  "split",
  "attempted",
  "resolved",
  "partially-resolved",
  "still-open",
  "needs-human",
  "suppressed",
  "stale",
  "superseded",
  // Legacy states kept for compatibility with older persisted state.
  "open",
  "fixed",
  "inconclusive",
] as const;
export const revalidationOutcomes = [
  "resolved",
  "partially-resolved",
  "still-open",
  "needs-human",
  "stale",
  "superseded",
  "inconclusive",
] as const;
export const baselineStatuses = [
  "new",
  "existing",
  "worsened",
  "improved",
  "fixed",
  "unknown",
] as const;
export const evidenceFreshnessStates = [
  "fresh",
  "baseline",
  "reused",
  "stale",
] as const;
export const fixAttemptStatuses = [
  "planned",
  "previewed",
  "applied",
  "passed",
  "failed",
  "scope-failed",
  "unverified",
] as const;
export const fixAttemptOutcomes = [
  "resolved",
  "partially-resolved",
  "still-open",
  "superseded",
  "needs_human",
] as const;
export const synthesisValidationStatuses = ["accepted", "rejected"] as const;
export const ciRunStatuses = [
  "passed",
  "failed",
  "policy-failed",
  "error",
] as const;
export const featureKinds = [
  "package-script",
  "route",
  "component",
  "module",
  "python-module",
  "test-suite",
  "config",
] as const;
export const featureMapSources = ["heuristic", "auto", "agent"] as const;
export const featureFileRoles = ["entrypoint", "owned", "context", "shared", "test", "config", "generated"] as const;
