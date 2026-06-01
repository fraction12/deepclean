import { schemaVersion } from "./defaults.js";
import type {
  CandidateRecord,
  QualityGateFinding,
  QualityGateResultRecord,
  QualityProfileRecord,
} from "./types.js";

export type BuiltInQualityProfileId = "advisory" | "balanced" | "strict" | "maintainability-only";

export function builtInQualityProfile(
  id: BuiltInQualityProfileId,
  createdAt = new Date().toISOString(),
): QualityProfileRecord {
  const blocking = id !== "advisory";
  return {
    schemaVersion,
    recordType: "quality_profile",
    id,
    name: profileName(id),
    mode: blocking ? "blocking" : "advisory",
    scope: "pr",
    gates: [
      {
        family: "maintainability",
        mode: blocking ? "blocking" : "advisory",
        thresholds: id === "strict" ? { maxNewP1: 0, maxP0: 0 } : { maxNewP1: 0 },
        requiredAnalyzerClasses: [],
        advisoryAnalyzerClasses: [],
      },
      {
        family: "security",
        mode: "advisory",
        thresholds: {},
        requiredAnalyzerClasses: [],
        advisoryAnalyzerClasses: ["semgrep", "codeql"],
      },
      {
        family: "dependency-risk",
        mode: "advisory",
        thresholds: {},
        requiredAnalyzerClasses: [],
        advisoryAnalyzerClasses: ["npm-audit"],
      },
      {
        family: "test-proof",
        mode: blocking ? "blocking" : "advisory",
        thresholds: {},
        requiredAnalyzerClasses: [],
        advisoryAnalyzerClasses: ["coverage"],
      },
    ],
    analyzerInputs: [],
    requiredAnalyzerClasses: [],
    recommendedAnalyzerClasses: id === "maintainability-only" ? [] : ["semgrep", "npm-audit", "coverage"],
    createdAt,
    updatedAt: createdAt,
  };
}

export function adHocQualityProfile(
  policy: Record<string, unknown>,
  createdAt = new Date().toISOString(),
): QualityProfileRecord {
  return {
    schemaVersion,
    recordType: "quality_profile",
    id: "ad-hoc",
    name: "Ad hoc legacy CI flags",
    mode: "blocking",
    scope: "pr",
    gates: [{
      family: "maintainability",
      mode: "blocking",
      thresholds: policy,
      requiredAnalyzerClasses: [],
      advisoryAnalyzerClasses: [],
    }],
    analyzerInputs: [],
    requiredAnalyzerClasses: [],
    recommendedAnalyzerClasses: [],
    createdAt,
    updatedAt: createdAt,
  };
}

export function evaluateQualityProfile(options: {
  profile: QualityProfileRecord;
  runId?: string | undefined;
  baselineRef?: string | undefined;
  headRef?: string | undefined;
  candidates: CandidateRecord[];
  legacyGate: { blockingFindingIds: string[]; reasons: Array<{ findingId: string; reason: string }> };
  createdAt?: string | undefined;
}): QualityGateResultRecord {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const legacyBlockers = options.legacyGate.reasons.map((reason) => findingFromLegacyReason(options.candidates, reason));
  const missingAssurance = missingAssuranceAdvisories(options.profile);
  const blockers = options.profile.mode === "advisory" ? [] : legacyBlockers;
  const advisories = [
    ...(options.profile.mode === "advisory" ? legacyBlockers : []),
    ...missingAssurance,
  ];
  const status: QualityGateResultRecord["status"] = blockers.length > 0
    ? "failed"
    : options.profile.mode === "advisory" || advisories.length > 0
      ? "advisory"
      : "passed";

  return {
    schemaVersion,
    recordType: "quality_gate_result",
    id: `quality-${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
    ...(options.runId ? { runId: options.runId } : {}),
    profileId: options.profile.id,
    ...(options.baselineRef ? { baselineRef: options.baselineRef } : {}),
    ...(options.headRef ? { headRef: options.headRef } : {}),
    status,
    blockers,
    advisories,
    regressions: blockers,
    improvements: [],
    analyzerProvenance: missingAssurance.map((finding) => ({
      analyzerId: finding.analyzerRuleIds[0] ?? "unknown",
      family: finding.family,
      evidenceClass: "recommended-analyzer",
      status: "not-configured",
      ruleIds: [],
      diagnosticIds: [],
    })),
    coverageStatus: missingAssurance.map((finding) => ({
      family: finding.family,
      status: "not-configured",
      evidenceClass: "recommended-analyzer",
      analyzerIds: finding.analyzerRuleIds,
      summary: finding.summary,
    })),
    artifactPaths: {},
    diagnostics: [],
    createdAt,
  };
}

function findingFromLegacyReason(
  candidates: CandidateRecord[],
  reason: { findingId: string; reason: string },
): QualityGateFinding {
  const candidate = candidates.find((item) => item.findingId === reason.findingId || item.id === reason.findingId);
  return {
    id: `quality-${reason.findingId}`,
    family: "maintainability",
    title: candidate?.title ?? reason.findingId,
    severity: "blocker",
    baselineStatus: candidate?.baselineStatus ?? "unknown",
    evidenceIds: candidate?.evidenceIds ?? [],
    candidateIds: candidate ? [candidate.id] : [],
    findingIds: candidate?.findingId ? [candidate.findingId] : [],
    opportunityIds: [],
    analyzerRuleIds: ["deepclean-ci-policy"],
    files: candidate?.files ?? [],
    summary: `Blocked by ${reason.reason}.`,
  };
}

function missingAssuranceAdvisories(profile: QualityProfileRecord): QualityGateFinding[] {
  return profile.recommendedAnalyzerClasses.map((analyzerId) => ({
    id: `missing-${analyzerId}`,
    family: analyzerFamily(analyzerId),
    title: `${analyzerId} not configured`,
    severity: "advisory",
    baselineStatus: "unknown",
    evidenceIds: [],
    candidateIds: [],
    findingIds: [],
    opportunityIds: [],
    analyzerRuleIds: [analyzerId],
    files: [],
    summary: `${analyzerId} is recommended for stronger assurance but is not configured for this gate run.`,
  }));
}

function analyzerFamily(analyzerId: string): QualityGateFinding["family"] {
  if (analyzerId.includes("audit")) {
    return "dependency-risk";
  }
  if (analyzerId.includes("coverage")) {
    return "test-proof";
  }
  return "security";
}

function profileName(id: BuiltInQualityProfileId): string {
  switch (id) {
    case "advisory":
      return "Advisory";
    case "balanced":
      return "Balanced";
    case "strict":
      return "Strict";
    case "maintainability-only":
      return "Maintainability only";
  }
}
