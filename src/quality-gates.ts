import { schemaVersion } from "./defaults.js";
import {
  deriveCandidateFixability,
  deriveQualityFindingActionability,
} from "./slop-classification.js";
import type {
  CandidateRecord,
  QualityGateFinding,
  QualityGateResultRecord,
  QualityProfileRecord,
} from "./types.js";

export type BuiltInQualityProfileId = "advisory" | "balanced" | "strict" | "maintainability-only";

export type ReviewPrQualityInput = {
  targetVerdict?: {
    targetType: string;
    targetId: string;
    opportunityId?: string | undefined;
    verdict: string;
    reasons: string[];
    ownedFiles: string[];
    doNotTouch: string[];
    changedDoNotTouchFiles: string[];
    missingVerification: string[];
  } | null | undefined;
};

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
  reviewPr?: ReviewPrQualityInput | undefined;
  createdAt?: string | undefined;
}): QualityGateResultRecord {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const legacyBlockers = options.legacyGate.reasons.map((reason) => findingFromLegacyReason(options.candidates, reason));
  const reviewFindings = findingsFromReviewPr(options.reviewPr);
  const missingAssurance = missingAssuranceAdvisories(options.profile);
  const blockers = options.profile.mode === "advisory" ? [] : [...legacyBlockers, ...reviewFindings.blockers];
  const advisories = [
    ...(options.profile.mode === "advisory" ? legacyBlockers : []),
    ...(options.profile.mode === "advisory" ? reviewFindings.blockers : []),
    ...reviewFindings.advisories,
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

function findingsFromReviewPr(reviewPr: ReviewPrQualityInput | undefined): {
  blockers: QualityGateFinding[];
  advisories: QualityGateFinding[];
} {
  const verdict = reviewPr?.targetVerdict;
  if (!verdict) {
    return { blockers: [], advisories: [] };
  }
  const blockers: QualityGateFinding[] = [];
  const advisories: QualityGateFinding[] = [];
  const opportunityIds = verdict.opportunityId ? [verdict.opportunityId] : verdict.targetType === "opportunity" ? [verdict.targetId] : [];
  if (["wrong-target", "too-broad", "needs-human"].includes(verdict.verdict)) {
    blockers.push(withFindingActionability({
      id: `review-target-${verdict.targetId}`,
      family: "policy",
      title: `PR target verdict: ${verdict.verdict}`,
      severity: "blocker",
      fixability: "human-design-needed",
      baselineStatus: "new",
      evidenceIds: [],
      candidateIds: verdict.targetType === "candidate" ? [verdict.targetId] : [],
      findingIds: verdict.targetType === "finding" ? [verdict.targetId] : [],
      opportunityIds,
      analyzerRuleIds: ["deepclean-review-pr-target"],
      files: [],
      summary: verdict.reasons.join(" ") || `Review target verdict is ${verdict.verdict}.`,
    }));
  }
  if (verdict.changedDoNotTouchFiles.length > 0) {
    blockers.push(withFindingActionability({
      id: `review-do-not-touch-${verdict.targetId}`,
      family: "policy",
      title: "PR changed do-not-touch files",
      severity: "blocker",
      fixability: "review-only",
      baselineStatus: "new",
      evidenceIds: [],
      candidateIds: verdict.targetType === "candidate" ? [verdict.targetId] : [],
      findingIds: verdict.targetType === "finding" ? [verdict.targetId] : [],
      opportunityIds,
      analyzerRuleIds: ["deepclean-review-pr-target"],
      files: verdict.changedDoNotTouchFiles.map((file) => ({ path: file })),
      summary: `Changed files outside the target stop line: ${verdict.changedDoNotTouchFiles.join(", ")}.`,
    }));
  }
  if (verdict.missingVerification.length > 0) {
    blockers.push(withFindingActionability({
      id: `review-missing-verification-${verdict.targetId}`,
      family: "test-proof",
      title: "PR is missing target verification",
      severity: "blocker",
      fixability: "agent-fixable",
      baselineStatus: "new",
      evidenceIds: [],
      candidateIds: verdict.targetType === "candidate" ? [verdict.targetId] : [],
      findingIds: verdict.targetType === "finding" ? [verdict.targetId] : [],
      opportunityIds,
      analyzerRuleIds: ["deepclean-review-pr-target"],
      files: [],
      summary: `Missing required verification: ${verdict.missingVerification.join(", ")}.`,
    }));
  }
  if (verdict.verdict === "partially-addresses-target") {
    advisories.push(withFindingActionability({
      id: `review-partial-${verdict.targetId}`,
      family: "policy",
      title: "PR partially addresses target",
      severity: "advisory",
      fixability: "agent-fixable",
      baselineStatus: "improved",
      evidenceIds: [],
      candidateIds: verdict.targetType === "candidate" ? [verdict.targetId] : [],
      findingIds: verdict.targetType === "finding" ? [verdict.targetId] : [],
      opportunityIds,
      analyzerRuleIds: ["deepclean-review-pr-target"],
      files: [],
      summary: verdict.reasons.join(" ") || "PR improves the target but leaves follow-up work.",
    }));
  }
  return { blockers, advisories };
}

function findingFromLegacyReason(
  candidates: CandidateRecord[],
  reason: { findingId: string; reason: string },
): QualityGateFinding {
  const candidate = candidates.find((item) => item.findingId === reason.findingId || item.id === reason.findingId);
  return withFindingActionability({
    id: `quality-${reason.findingId}`,
    family: "maintainability",
    title: candidate?.title ?? reason.findingId,
    severity: "blocker",
    fixability: candidate ? deriveCandidateFixability(candidate) : "review-only",
    baselineStatus: candidate?.baselineStatus ?? "unknown",
    evidenceIds: candidate?.evidenceIds ?? [],
    candidateIds: candidate ? [candidate.id] : [],
    findingIds: candidate?.findingId ? [candidate.findingId] : [],
    opportunityIds: [],
    analyzerRuleIds: ["deepclean-ci-policy"],
    files: candidate?.files ?? [],
    summary: `Blocked by ${reason.reason}.`,
  });
}

function missingAssuranceAdvisories(profile: QualityProfileRecord): QualityGateFinding[] {
  return profile.recommendedAnalyzerClasses.map((analyzerId) => withFindingActionability({
    id: `missing-${analyzerId}`,
    family: analyzerFamily(analyzerId),
    title: `${analyzerId} not configured`,
    severity: "advisory",
    fixability: "review-only",
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

function withFindingActionability(finding: QualityGateFinding): QualityGateFinding {
  return {
    ...finding,
    actionability: finding.actionability ?? deriveQualityFindingActionability(finding),
  };
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
