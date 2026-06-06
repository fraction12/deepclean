import type {
  CandidateRecord,
  ClusterRecord,
  EvidenceRecord,
  FeatureRecord,
  FindingRecord,
  FixAttemptRecord,
  PrOpportunityRecord,
  RevalidationRecord,
} from "./types.js";
import { schemaVersion } from "./defaults.js";
import {
  deriveCandidateFixability,
  deriveFixabilityFromOpportunityClassification,
  deriveSlopType,
} from "./slop-classification.js";

export interface BuildPrOpportunitiesInput {
  runId: string;
  candidates: CandidateRecord[];
  clusters?: ClusterRecord[] | undefined;
  evidence?: EvidenceRecord[] | undefined;
  features?: FeatureRecord[] | undefined;
  findings?: FindingRecord[] | undefined;
  revalidations?: RevalidationRecord[] | undefined;
  fixAttempts?: FixAttemptRecord[] | undefined;
  createdAt?: string | undefined;
}

export function buildPrOpportunities(input: BuildPrOpportunitiesInput): PrOpportunityRecord[] {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const clusterByCandidateId = clusterIndex(input.clusters ?? []);
  const seenFingerprints = new Map<string, string>();
  const opportunities: PrOpportunityRecord[] = [];

  for (const candidate of input.candidates.filter((item) => item.status === "open")) {
    const fingerprint = candidateFingerprint(candidate);
    const duplicateOf = seenFingerprints.get(fingerprint);
    if (duplicateOf) {
      opportunities.push(candidateOpportunity({
        candidate,
        createdAt,
        classification: "duplicate",
        status: "rejected",
        score: 5,
        fixability: "noise",
        refusalReason: `Duplicates ${duplicateOf}.`,
        stopLine: "Do not open a separate PR for duplicate cleanup evidence.",
        expectedPayoff: "Avoids duplicate cleanup work.",
        clusterIds: clusterByCandidateId.get(candidate.id) ?? [],
      }));
      continue;
    }
    seenFingerprints.set(fingerprint, candidate.id);

    const classification = classifyCandidate(candidate, clusterByCandidateId.get(candidate.id) ?? []);
    const safe = classification === "safe-narrow-pr";
    const baseFixability = deriveCandidateFixability(candidate);
    const fixability = safe ? baseFixability : deriveFixabilityFromOpportunityClassification(classification);
    const autoFixable = safe && fixability === "auto-fixable";
    opportunities.push(candidateOpportunity({
      candidate,
      createdAt,
      classification,
      status: autoFixable ? "recommended" : "blocked",
      score: opportunityScore(candidate, classification),
      fixability,
      refusalReason: autoFixable ? undefined : refusalReasonFor(candidate, classification, fixability),
      stopLine: stopLineFor(candidate, classification),
      expectedPayoff: expectedPayoffFor(candidate, classification),
      clusterIds: clusterByCandidateId.get(candidate.id) ?? [],
    }));
  }

  const safeOpportunities = opportunities
    .filter((opportunity) => opportunity.classification === "safe-narrow-pr" && opportunity.fixability === "auto-fixable")
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  for (const opportunity of opportunities) {
    if (opportunity.classification === "safe-narrow-pr" && opportunity.fixability === "auto-fixable") {
      opportunity.status = opportunity.id === safeOpportunities[0]?.id ? "recommended" : "available";
    }
  }

  if (safeOpportunities.length === 0) {
    opportunities.push(stopCampaignOpportunity({
      runId: input.runId,
      createdAt,
      opportunities,
    }));
  }

  return opportunities.sort((a, b) => {
    const statusRank = statusSortRank(a.status) - statusSortRank(b.status);
    return statusRank || b.score - a.score || a.id.localeCompare(b.id);
  });
}

function candidateOpportunity(options: {
  candidate: CandidateRecord;
  createdAt: string;
  classification: PrOpportunityRecord["classification"];
  status: PrOpportunityRecord["status"];
  score: number;
  fixability?: PrOpportunityRecord["fixability"] | undefined;
  refusalReason?: string | undefined;
  stopLine: string;
  expectedPayoff: string;
  clusterIds: string[];
}): PrOpportunityRecord {
  const { candidate, createdAt } = options;
  const ownedFiles = candidate.ownedFiles && candidate.ownedFiles.length > 0 ? candidate.ownedFiles : candidate.files;
  return {
    schemaVersion: candidate.schemaVersion,
    recordType: "pr_opportunity",
    id: `opportunity-${candidate.id.replace(/^candidate-/, "")}`,
    runId: candidate.runId,
    targetCandidateIds: [candidate.id],
    targetFindingIds: candidate.findingId ? [candidate.findingId] : [],
    targetClusterIds: options.clusterIds,
    classification: options.classification,
    slopType: deriveSlopType(candidate),
    fixability: options.fixability ?? deriveCandidateFixability(candidate),
    status: options.status,
    title: candidate.title,
    oneSentenceChange: candidate.suggestedDirection,
    rationale: candidate.whyItMatters,
    score: options.score,
    confidence: candidate.confidence,
    risk: candidate.risk,
    ownedFiles,
    contextFiles: candidate.contextFiles ?? [],
    doNotTouch: candidate.doNotTouch ?? [],
    behaviorInvariants: candidate.expectedBehavior ? [candidate.expectedBehavior] : [],
    validationPlan: candidate.verification,
    testsRequiredFirst: options.classification === "tests-first",
    expectedReviewerConcern: reviewerConcernFor(candidate, options.classification),
    stopLine: options.stopLine,
    expectedPayoff: options.expectedPayoff,
    ...(options.refusalReason ? { refusalReason: options.refusalReason } : {}),
    sourceSignals: [
      { kind: "candidate", id: candidate.id, summary: candidate.title },
      ...candidate.evidenceIds.map((id) => ({ kind: "evidence", id, summary: "Candidate supporting evidence." })),
    ],
    diagnostics: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function stopCampaignOpportunity(options: {
  runId: string;
  createdAt: string;
  opportunities: PrOpportunityRecord[];
}): PrOpportunityRecord {
  const counts = countBy(options.opportunities, (opportunity) => opportunity.classification);
  const remaining = Object.entries(counts)
    .map(([classification, count]) => `${count} ${classification}`)
    .join(", ") || "no open candidates";
  return {
    schemaVersion,
    recordType: "pr_opportunity",
    id: "opportunity-stop-campaign",
    runId: options.runId,
    targetCandidateIds: [],
    targetFindingIds: [],
    targetClusterIds: [],
    classification: "stop-campaign",
    slopType: "metric-only",
    fixability: "noise",
    status: "blocked",
    title: "Stop cleanup campaign",
    oneSentenceChange: "Do not start another cleanup PR until blocked targets are clarified.",
    rationale: `No safe narrow PR opportunity is available; remaining buckets: ${remaining}.`,
    score: 0,
    confidence: "high",
    risk: "design-needed",
    ownedFiles: [],
    contextFiles: [],
    doNotTouch: [],
    behaviorInvariants: [],
    validationPlan: [],
    testsRequiredFirst: false,
    expectedReviewerConcern: "Starting a PR from the remaining targets would likely expand scope.",
    stopLine: "Stop the campaign and choose tests, spec, or design work before further refactoring.",
    expectedPayoff: "Prevents cosmetic or unsafe cleanup PRs.",
    refusalReason: "No candidate classified as safe-narrow-pr.",
    sourceSignals: [{ kind: "campaign", summary: "No safe PR opportunity is available." }],
    diagnostics: [],
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
  };
}

function classifyCandidate(
  candidate: CandidateRecord,
  clusterIds: string[],
): PrOpportunityRecord["classification"] {
  const files = candidateFiles(candidate);
  if (isSensitiveTarget(candidate) || files.some(isSensitivePath)) {
    return "do-not-automate";
  }
  if (candidate.risk === "design-needed" || candidate.readiness === "design-needed") {
    return "spec-design-first";
  }
  if (candidate.readiness === "split-needed" || candidate.impact === "cross-cutting" || files.length > 6 || clusterIds.length > 2) {
    return "bad-target";
  }
  if (candidate.readiness === "needs-human" || candidate.readiness === "defer") {
    return "backlog-design-debt";
  }
  if (candidate.readiness !== "fix-ready" || candidate.verification.length === 0 || missingProof(candidate)) {
    return "tests-first";
  }
  return "safe-narrow-pr";
}

function opportunityScore(
  candidate: CandidateRecord,
  classification: PrOpportunityRecord["classification"],
): number {
  if (classification !== "safe-narrow-pr") {
    return classification === "tests-first" || classification === "spec-design-first" ? 35 : 15;
  }
  const priorityScore = { P0: 40, P1: 30, P2: 20, P3: 10 }[candidate.priority];
  const confidenceScore = { high: 20, medium: 12, low: 4 }[candidate.confidence];
  const riskScore = { safe: 20, moderate: 12, "design-needed": 0 }[candidate.risk];
  const sizePenalty = Math.max(0, candidateFiles(candidate).length - 2) * 3;
  return Math.max(1, priorityScore + confidenceScore + riskScore - sizePenalty);
}

function candidateFingerprint(candidate: CandidateRecord): string {
  const signature = candidate.signature?.value;
  if (signature) {
    return signature;
  }
  return [
    candidate.title.toLowerCase().replace(/\s+/g, " ").trim(),
    ...candidateFiles(candidate).sort(),
  ].join("|");
}

function candidateFiles(candidate: CandidateRecord): string[] {
  return [...new Set([
    ...candidate.files.map((file) => file.path),
    ...(candidate.ownedFiles ?? []).map((file) => file.path),
  ])];
}

function missingProof(candidate: CandidateRecord): boolean {
  return candidate.proofRequired !== undefined
    && candidate.proofRequired.length > 0
    && candidate.verification.length === 0;
}

function isSensitiveTarget(candidate: CandidateRecord): boolean {
  const text = `${candidate.title} ${candidate.whyItMatters} ${candidate.suggestedDirection}`.toLowerCase();
  return [
    "auth",
    "security",
    "permission",
    "tenant",
    "payment",
    "pricing",
    "public api",
    "token",
    "secret",
  ].some((term) => text.includes(term));
}

function isSensitivePath(filePath: string): boolean {
  return /(^|\/)(auth|security|billing|payments?|pricing|tenant|permissions?)(\/|\.|-|_)/i.test(filePath);
}

function refusalReasonFor(
  candidate: CandidateRecord,
  classification: PrOpportunityRecord["classification"],
  fixability?: PrOpportunityRecord["fixability"] | undefined,
): string {
  switch (classification) {
    case "tests-first":
      return "Candidate needs proof before cleanup work is safe.";
    case "spec-design-first":
      return "Candidate needs an architecture/spec decision before implementation.";
    case "bad-target":
      return "Candidate is too broad or cross-cutting for one safe PR.";
    case "do-not-automate":
      return "Candidate touches sensitive product, security, auth, payment, tenant, or public API behavior.";
    case "backlog-design-debt":
      return "Candidate is backlog/design debt rather than an immediately safe PR.";
    case "duplicate":
      return "Candidate duplicates a better opportunity.";
    case "stop-campaign":
      return "No safe PR opportunity is available.";
    case "safe-narrow-pr":
      return fixability && fixability !== "auto-fixable"
        ? `Candidate is ${fixability}; guarded fix execution requires candidate-level auto-fixable proof.`
        : "";
    default:
      return `Candidate ${candidate.id} is not fix-ready.`;
  }
}

function stopLineFor(
  candidate: CandidateRecord,
  classification: PrOpportunityRecord["classification"],
): string {
  if (classification === "safe-narrow-pr") {
    const files = candidateFiles(candidate).slice(0, 4).join(", ") || "the owned files";
    return `Touch only ${files}; stop if the change expands into unrelated callers, shared transport, auth, public API, or product semantics.`;
  }
  if (classification === "tests-first") {
    return "Stop after adding or identifying proof; do not refactor behavior until verification exists.";
  }
  if (classification === "spec-design-first") {
    return "Stop after writing the design decision; do not implement the architecture move in the same PR.";
  }
  return "Do not start implementation from this target without a narrower opportunity.";
}

function expectedPayoffFor(
  candidate: CandidateRecord,
  classification: PrOpportunityRecord["classification"],
): string {
  if (classification === "safe-narrow-pr") {
    return candidate.whyItMatters;
  }
  if (classification === "tests-first") {
    return "Turns an unsafe cleanup target into a verifiable future PR.";
  }
  if (classification === "spec-design-first") {
    return "Turns ambiguous architecture debt into an implementation-ready decision.";
  }
  return "Keeps the cleanup campaign honest by avoiding a poor PR target.";
}

function reviewerConcernFor(
  candidate: CandidateRecord,
  classification: PrOpportunityRecord["classification"],
): string {
  if (classification === "safe-narrow-pr") {
    return candidate.risk === "moderate"
      ? "Reviewer may ask whether behavior stayed pinned by verification."
      : "Reviewer may ask whether the PR stayed within the intended files.";
  }
  return refusalReasonFor(candidate, classification);
}

function clusterIndex(clusters: ClusterRecord[]): Map<string, string[]> {
  const byCandidate = new Map<string, string[]>();
  for (const cluster of clusters) {
    for (const candidateId of cluster.candidateIds) {
      const ids = byCandidate.get(candidateId) ?? [];
      ids.push(cluster.id);
      byCandidate.set(candidateId, ids);
    }
  }
  return byCandidate;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function statusSortRank(status: PrOpportunityRecord["status"]): number {
  return {
    recommended: 0,
    available: 1,
    blocked: 2,
    rejected: 3,
    completed: 4,
    superseded: 5,
  }[status];
}
