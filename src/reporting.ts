import { schemaVersion } from "./defaults.js";
import { timestampId } from "./ids.js";
import {
  deriveCandidateFixability,
  deriveOpportunityFixability,
  deriveSlopType,
} from "./slop-classification.js";

type CandidateRecord = import("./types.js").CandidateRecord;
type ClusterRecord = import("./types.js").ClusterRecord;
type EvidenceRecord = import("./types.js").EvidenceRecord;
type FeatureRecord = import("./types.js").FeatureRecord;
type HandoffRecord = import("./types.js").HandoffRecord;
type PrOpportunityRecord = import("./types.js").PrOpportunityRecord;
type ReportRecord = import("./types.js").ReportRecord;

type FixabilityBucket = "auto-fixable" | "agent-fixable" | "human-design-needed" | "review-only" | "noise";

type BriefTarget = {
  id: string;
  targetType: "opportunity" | "candidate";
  title: string;
  priority?: CandidateRecord["priority"] | undefined;
  slopType: string;
  fixability: FixabilityBucket;
  whyItMatters: string;
  recommendedNext: string;
  verification: string[];
  files: FileLike[];
};

const fixabilityBriefOrder = [
  "auto-fixable",
  "agent-fixable",
  "human-design-needed",
  "review-only",
  "noise",
] as const satisfies readonly FixabilityBucket[];

export function buildReportRecord(
  runId: string,
  candidates: CandidateRecord[],
  clusters: ClusterRecord[] = [],
  features: FeatureRecord[] = [],
): ReportRecord {
  const byPriority: Record<string, number> = {};
  const bySlopType: Record<string, number> = {};
  const byFixability: Record<string, number> = {};
  for (const candidate of candidates) {
    byPriority[candidate.priority] = (byPriority[candidate.priority] ?? 0) + 1;
    const slopType = deriveSlopType(candidate);
    const fixability = deriveCandidateFixability(candidate);
    bySlopType[slopType] = (bySlopType[slopType] ?? 0) + 1;
    byFixability[fixability] = (byFixability[fixability] ?? 0) + 1;
  }

  return {
    schemaVersion,
    recordType: "report",
    id: timestampId("report"),
    runId,
    createdAt: new Date().toISOString(),
    candidateIds: candidates.map((candidate) => candidate.id),
    summary: {
      open: candidates.filter((candidate) => candidate.status === "open").length,
      total: candidates.length,
      byPriority,
      bySlopType,
      byFixability,
    },
    recommendations: buildReportRecommendations(candidates, clusters, features),
  };
}

export function renderMarkdownReport(
  candidates: CandidateRecord[],
  features: FeatureRecord[] = [],
  opportunities: PrOpportunityRecord[] = [],
): string {
  return renderSlopCleanupBrief(candidates, [], features, opportunities);
}

export function renderMarkdownReportWithClusters(
  candidates: CandidateRecord[],
  clusters: ClusterRecord[],
  features: FeatureRecord[] = [],
  opportunities: PrOpportunityRecord[] = [],
): string {
  return renderSlopCleanupBrief(candidates, clusters, features, opportunities);
}

function renderSlopCleanupBrief(
  candidates: CandidateRecord[],
  clusters: ClusterRecord[],
  features: FeatureRecord[],
  opportunities: PrOpportunityRecord[],
): string {
  const recommendations = buildReportRecommendations(candidates, clusters, features);
  const targets = buildBriefTargets(candidates, opportunities);
  const lines = [
    "# Deepclean Slop Cleanup Brief",
    "",
    reportScopeLine(candidates, clusters, opportunities),
    "",
    ...cleanupBriefMarkdown(targets),
    ...briefWarningsMarkdown(recommendations),
    ...reportAppendixMarkdown(candidates, clusters, features, opportunities),
  ];

  return `${lines.join("\n")}\n`;
}

function reportScopeLine(
  candidates: CandidateRecord[],
  clusters: ClusterRecord[],
  opportunities: PrOpportunityRecord[],
): string {
  const parts = [`${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`];
  if (clusters.length > 0) {
    parts.push(`${clusters.length} theme${clusters.length === 1 ? "" : "s"}`);
  }
  if (opportunities.length > 0) {
    parts.push(`${opportunities.length} opportunit${opportunities.length === 1 ? "y" : "ies"}`);
  }
  return `Found ${parts.join(", ")}. Markdown is routed for cleanup; JSON keeps the full machine record.`;
}

function buildBriefTargets(
  candidates: CandidateRecord[],
  opportunities: PrOpportunityRecord[],
): BriefTarget[] {
  const coveredCandidateIds = new Set(opportunities.flatMap((opportunity) => opportunity.targetCandidateIds));
  const opportunityTargets = opportunities
    .filter((opportunity) => opportunity.classification !== "stop-campaign")
    .map((opportunity): BriefTarget => {
      const fixability = deriveOpportunityFixability(opportunity) as FixabilityBucket;
      return {
        id: opportunity.id,
        targetType: "opportunity",
        title: opportunity.title,
        slopType: opportunity.slopType ?? "structure",
        fixability,
        whyItMatters: opportunity.rationale,
        recommendedNext: recommendedNextForOpportunity(opportunity, fixability),
        verification: opportunity.validationPlan.length > 0 ? opportunity.validationPlan : ["deepclean scan"],
        files: opportunity.ownedFiles.length > 0 ? opportunity.ownedFiles : opportunity.contextFiles,
      };
    });
  const candidateTargets = agentQueueCandidates(candidates.filter((candidate) => candidate.status === "open"))
    .filter((candidate) => !coveredCandidateIds.has(candidate.id))
    .map((candidate): BriefTarget => {
      const fixability = deriveCandidateFixability(candidate) as FixabilityBucket;
      return {
        id: candidate.id,
        targetType: "candidate",
        title: candidate.title,
        priority: candidate.priority,
        slopType: deriveSlopType(candidate),
        fixability,
        whyItMatters: candidate.whyItMatters,
        recommendedNext: recommendedNextForCandidate(candidate, fixability),
        verification: candidate.verification.length > 0 ? candidate.verification : ["deepclean scan"],
        files: candidate.ownedFiles && candidate.ownedFiles.length > 0 ? candidate.ownedFiles : candidate.files,
      };
    });
  return [...opportunityTargets, ...candidateTargets];
}

function cleanupBriefMarkdown(targets: BriefTarget[]): string[] {
  const lines = ["## What To Do Next", ""];
  const buckets = bucketBriefTargets(targets);
  const firstAutoFixable = buckets["auto-fixable"]?.[0];
  const firstAgentFixable = buckets["agent-fixable"]?.[0];
  const firstDesignNeeded = buckets["human-design-needed"]?.[0];
  if (firstAutoFixable) {
    lines.push(`- Auto-fix first: ${firstAutoFixable.id} - ${firstAutoFixable.title}`);
  }
  if (firstAgentFixable) {
    lines.push(`- Agent handoff first: ${firstAgentFixable.id} - ${firstAgentFixable.title}`);
  }
  if (firstDesignNeeded) {
    lines.push(`- Design first: ${firstDesignNeeded.id} - ${firstDesignNeeded.title}`);
  }
  if (!firstAutoFixable && !firstAgentFixable && !firstDesignNeeded) {
    lines.push("- No safe cleanup target is ready. Treat this run as review context.");
  }
  lines.push("");

  for (const fixability of fixabilityBriefOrder) {
    const bucket = buckets[fixability] ?? [];
    lines.push(...fixabilitySectionMarkdown(fixability, bucket));
  }
  return lines;
}

function bucketBriefTargets(targets: BriefTarget[]): Record<FixabilityBucket, BriefTarget[]> {
  const buckets: Record<FixabilityBucket, BriefTarget[]> = {
    "auto-fixable": [],
    "agent-fixable": [],
    "human-design-needed": [],
    "review-only": [],
    noise: [],
  };
  for (const target of targets) {
    buckets[target.fixability].push(target);
  }
  return buckets;
}

function fixabilitySectionMarkdown(fixability: FixabilityBucket, targets: BriefTarget[]): string[] {
  const lines = [`## ${fixabilityTitle(fixability)}`, ""];
  if (targets.length === 0) {
    lines.push(emptyFixabilityMessage(fixability), "");
    return lines;
  }
  for (const target of targets.slice(0, 6)) {
    lines.push(...briefTargetMarkdown(target));
  }
  if (targets.length > 6) {
    lines.push(`_${targets.length - 6} more ${fixability} target${targets.length - 6 === 1 ? "" : "s"} in the JSON artifact._`, "");
  }
  return lines;
}

function briefTargetMarkdown(target: BriefTarget): string[] {
  const prefix = target.priority ? `${target.priority} ` : "";
  return [
    `### ${prefix}${target.id}: ${target.title}`,
    "",
    `- Slop: ${target.slopType}`,
    `- Why it matters: ${target.whyItMatters}`,
    `- Next: ${target.recommendedNext}`,
    `- Verification: ${target.verification.join(", ")}`,
    `- Scope: ${target.files.slice(0, 5).map((file) => formatFile(file)).join(", ") || "n/a"}`,
    "",
  ];
}

function recommendedNextForOpportunity(opportunity: PrOpportunityRecord, fixability: FixabilityBucket): string {
  switch (fixability) {
    case "auto-fixable":
      return `Run guarded fix on ${opportunity.id}, then re-run ${opportunity.validationPlan.join(", ") || "deepclean scan"}.`;
    case "agent-fixable":
      return `Run deepclean plan ${opportunity.id} or deepclean handoff ${opportunity.id}; keep the stop line: ${opportunity.stopLine}`;
    case "human-design-needed":
      return opportunity.refusalReason ?? `Confirm the design/spec boundary before assigning this cleanup. Stop line: ${opportunity.stopLine}`;
    case "review-only":
      return "Keep this as CI/review context; do not mutate source from it unattended.";
    case "noise":
      return opportunity.refusalReason ?? "Suppress or ignore unless new evidence appears.";
  }
}

function recommendedNextForCandidate(candidate: CandidateRecord, fixability: FixabilityBucket): string {
  switch (fixability) {
    case "auto-fixable":
      return `Run deepclean fix ${candidate.id} --mode guarded --apply with verification: ${candidate.verification.join(", ") || "deepclean scan"}.`;
    case "agent-fixable":
      return `Run deepclean plan ${candidate.id} or deepclean handoff ${candidate.id}; keep the cleanup bounded to listed scope.`;
    case "human-design-needed":
      return candidate.readiness === "split-needed"
        ? "Split this into smaller cleanup slices before fix/work."
        : "Decide the design boundary before asking an agent to mutate source.";
    case "review-only":
      return "Use this in CI/review context only; do not treat it as a cleanup target.";
    case "noise":
      return "Treat as low-signal noise unless it gains stronger evidence.";
  }
}

function fixabilityTitle(fixability: FixabilityBucket): string {
  switch (fixability) {
    case "auto-fixable":
      return "Auto-Fixable Slop";
    case "agent-fixable":
      return "Agent-Fixable Slop";
    case "human-design-needed":
      return "Human Design Needed";
    case "review-only":
      return "Review-Only Findings";
    case "noise":
      return "Likely Noise";
  }
}

function emptyFixabilityMessage(fixability: FixabilityBucket): string {
  switch (fixability) {
    case "auto-fixable":
      return "No safe unattended cleanup target found.";
    case "agent-fixable":
      return "No bounded agent handoff target found.";
    case "human-design-needed":
      return "No design-first slop found.";
    case "review-only":
      return "No review-only findings found.";
    case "noise":
      return "No likely noise found.";
  }
}

function briefWarningsMarkdown(recommendations: NonNullable<ReportRecord["recommendations"]>): string[] {
  if (recommendations.warnings.length === 0) {
    return [];
  }
  return ["## Warnings", "", ...recommendations.warnings.map((warning) => `- ${warning}`), ""];
}

function reportAppendixMarkdown(
  candidates: CandidateRecord[],
  clusters: ClusterRecord[],
  features: FeatureRecord[],
  opportunities: PrOpportunityRecord[],
): string[] {
  return [
    ...opportunityAppendixMarkdown(opportunities),
    ...themeAppendixMarkdown(clusters),
    ...featureAppendixMarkdown(candidates, features),
    ...candidateAppendixMarkdown(candidates),
  ];
}

function opportunityAppendixMarkdown(opportunities: PrOpportunityRecord[]): string[] {
  if (opportunities.length === 0) {
    return [];
  }
  const lines = ["## Appendix: Opportunity Details", ""];
  for (const opportunity of opportunities.slice(0, 12)) {
    lines.push(
      `- ${opportunity.id} ${opportunity.classification} ${deriveOpportunityFixability(opportunity)} ${opportunity.title}`,
      `  Change: ${opportunity.oneSentenceChange}`,
      `  Verification: ${opportunity.validationPlan.join(", ") || "deepclean scan"}`,
    );
  }
  lines.push("");
  return lines;
}

function themeAppendixMarkdown(clusters: ClusterRecord[]): string[] {
  if (clusters.length === 0) {
    return [];
  }
  const lines = ["## Appendix: Cleanup Themes", ""];
  const bounded = clusters.filter((cluster) => (cluster.actionability ?? "bounded") === "bounded");
  const broad = clusters.filter((cluster) => (cluster.actionability ?? "bounded") === "too-broad");
  for (const cluster of [...bounded, ...broad]) {
    lines.push(
      `### ${cluster.priority} ${cluster.id}: ${cluster.title}`,
      "",
      `- Candidates: ${cluster.candidateIds.join(", ")}`,
      `- Category: ${cluster.category}`,
      `- Confidence: ${cluster.confidence}`,
      `- Impact: ${cluster.impact}`,
      `- Effort: ${cluster.effort}`,
      `- Risk: ${cluster.risk}`,
      `- Actionability: ${cluster.actionability ?? "bounded"}`,
      `- Files: ${cluster.files.map((file) => formatFile(file)).join(", ") || "n/a"}`,
      "",
      ...clusterWarningMarkdown(cluster),
      cluster.rationale,
      "",
      `Suggested direction: ${cluster.suggestedDirection}`,
      "",
    );
  }
  return lines;
}

function featureAppendixMarkdown(candidates: CandidateRecord[], features: FeatureRecord[]): string[] {
  const featureLines = featureMapMarkdown(candidates, features);
  if (featureLines.length === 0) {
    return [];
  }
  const [, , ...rest] = featureLines;
  return ["## Appendix: Feature Map", "", ...rest];
}

function candidateAppendixMarkdown(candidates: CandidateRecord[]): string[] {
  const lines = ["## Appendix: Candidate Details", ""];
  for (const candidate of candidates.slice(0, 40)) {
    lines.push(...candidateMarkdown(candidate));
  }
  if (candidates.length > 40) {
    lines.push("_Appendix truncated to 40 candidates. Full candidate records are in the JSON artifact._", "");
  }
  return lines;
}

function opportunityMarkdown(opportunities: PrOpportunityRecord[]): string[] {
  if (opportunities.length === 0) {
    return [];
  }
  const counts = countBy(opportunities, (opportunity) => opportunity.classification);
  const recommended = opportunities.find((opportunity) => opportunity.status === "recommended");
  const lines = ["## PR Opportunities", ""];
  if (recommended) {
    lines.push(
      `Start with ${recommended.id}: ${recommended.title}`,
      "",
      recommended.oneSentenceChange,
      "",
      `Classification: ${recommended.classification}`,
      `Fixability: ${deriveOpportunityFixability(recommended)}`,
      `Stop line: ${recommended.stopLine}`,
      `Plan: deepclean plan ${recommended.id}`,
      `Handoff: deepclean handoff ${recommended.id}`,
      "",
    );
  } else {
    const stop = opportunities.find((opportunity) => opportunity.classification === "stop-campaign");
    lines.push(stop?.rationale ?? "No PR-sized opportunity is currently recommended.", "");
  }
  lines.push("Classification counts:");
  for (const [classification, count] of Object.entries(counts).sort()) {
    lines.push(`- ${classification}: ${count}`);
  }
  lines.push("");
  const top = opportunities
    .filter((opportunity) => opportunity.classification !== "stop-campaign")
    .slice(0, 8);
  if (top.length > 0) {
    lines.push("Top opportunity queue:");
    for (const opportunity of top) {
      lines.push(
        `- ${opportunity.id} ${opportunity.classification} ${deriveOpportunityFixability(opportunity)} ${opportunity.title}`,
        `  ${opportunity.oneSentenceChange}`,
        `  Verification: ${opportunity.validationPlan.join(", ") || "deepclean scan"}`,
      );
    }
    lines.push("");
  }
  return lines;
}

function slopActionabilityMarkdown(candidates: CandidateRecord[], opportunities: PrOpportunityRecord[]): string[] {
  if (candidates.length === 0 && opportunities.length === 0) {
    return [];
  }
  const candidateBuckets = bucketCandidatesByFixability(candidates);
  const opportunityBuckets = bucketOpportunitiesByFixability(opportunities);
  const lines = ["## Slop Actionability", ""];
  for (const fixability of ["auto-fixable", "agent-fixable", "human-design-needed", "review-only", "noise"] as const) {
    const candidateIds = candidateBuckets[fixability] ?? [];
    const opportunityIds = opportunityBuckets[fixability] ?? [];
    if (candidateIds.length === 0 && opportunityIds.length === 0) {
      continue;
    }
    const parts = [
      `${candidateIds.length} candidate${candidateIds.length === 1 ? "" : "s"}`,
      opportunityIds.length > 0 ? `${opportunityIds.length} opportunit${opportunityIds.length === 1 ? "y" : "ies"}` : "",
    ].filter(Boolean);
    const ids = [...opportunityIds.slice(0, 3), ...candidateIds.slice(0, 3)].slice(0, 5);
    lines.push(`- ${fixability}: ${parts.join(", ")}${ids.length > 0 ? ` (${ids.join(", ")})` : ""}`);
  }
  lines.push("");
  return lines;
}

function bucketCandidatesByFixability(candidates: CandidateRecord[]): Record<string, string[]> {
  const buckets: Record<string, string[]> = {};
  for (const candidate of candidates) {
    const fixability = deriveCandidateFixability(candidate);
    const ids = buckets[fixability] ?? [];
    ids.push(candidate.id);
    buckets[fixability] = ids;
  }
  return buckets;
}

function bucketOpportunitiesByFixability(opportunities: PrOpportunityRecord[]): Record<string, string[]> {
  const buckets: Record<string, string[]> = {};
  for (const opportunity of opportunities) {
    const fixability = deriveOpportunityFixability(opportunity);
    const ids = buckets[fixability] ?? [];
    ids.push(opportunity.id);
    buckets[fixability] = ids;
  }
  return buckets;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function agentQueueMarkdown(candidates: CandidateRecord[]): string[] {
  const top = candidates.slice(0, 10);
  if (top.length === 0) {
    return [];
  }
  const lines = ["## Agent Queue", ""];
  for (const candidate of top) {
    const source = candidate.provenance.source === "model-synthesis" ? "synthesized" : "local";
    lines.push(
      `- ${candidate.id} ${candidate.priority} ${candidate.title} (${source}, ${candidate.confidence}, ${candidate.readiness ?? "fix-ready"})`,
      `  Feature scope: ${candidate.featureScope}; Features: ${candidate.affectedFeatureIds.join(", ") || "unmapped"}`,
      `  Proof needed: ${candidate.proofRequired?.join("; ") || "confirm cited evidence and expected behavior"}`,
      `  Files: ${candidate.files.slice(0, 4).map(formatFile).join(", ") || "n/a"}`,
      `  Verification: ${candidate.verification.join(", ")}`,
    );
  }
  lines.push("");
  return lines;
}

function clusterWarningMarkdown(cluster: ClusterRecord): string[] {
  const warnings = cluster.warnings ?? [];
  if (warnings.length === 0) {
    return [];
  }
  return [...warnings.map((warning) => `Warning: ${warning}`), ""];
}

function buildReportRecommendations(
  candidates: CandidateRecord[],
  clusters: ClusterRecord[],
  features: FeatureRecord[] = [],
): NonNullable<ReportRecord["recommendations"]> {
  const openCandidates = candidates.filter((candidate) => candidate.status === "open");
  const boundedThemes = clusters.filter((cluster) => (cluster.actionability ?? "bounded") === "bounded");
  const queuedCandidates = agentQueueCandidates(openCandidates);
  const topCandidateIds = queuedCandidates.slice(0, 10).map((candidate) => candidate.id);
  const topThemeIds = boundedThemes.slice(0, 5).map((cluster) => cluster.id);
  const warnings = clusters.flatMap((cluster) => (cluster.warnings ?? []).map((warning) => `${cluster.id}: ${warning}`));
  const firstTheme = boundedThemes[0];
  const firstCandidate = queuedCandidates[0];
  const firstFeature = firstCandidate
    ? features.find((feature) => firstCandidate.affectedFeatureIds.includes(feature.featureId))
    : undefined;
  const startHere = firstCandidate
    ? {
      id: firstCandidate.id,
      type: "candidate" as const,
      reason: startHereCandidateReason(firstCandidate, firstFeature),
      featureId: firstFeature?.featureId,
      featureTitle: firstFeature?.title,
    }
    : firstTheme
      ? {
        id: firstTheme.id,
        type: "theme" as const,
        reason: "No candidate slice is ready; inspect the highest-ranked bounded theme and split it before handoff.",
      }
      : undefined;
  return {
    startHere,
    topCandidateIds,
    topThemeIds,
    warnings,
    suggestedPlanTargets: [...topCandidateIds.slice(0, 4), ...topThemeIds.slice(0, 1)],
  };
}

function startHereCandidateReason(candidate: CandidateRecord, feature?: FeatureRecord | undefined): string {
  const readiness = candidate.readiness ?? "fix-ready";
  if (readiness !== "fix-ready") {
    return `Highest-ranked open candidate is ${readiness}; inspect proof, non-goals, and split/design boundaries before handoff.`;
  }
  return feature
    ? `Highest-ranked PR-sized cleanup slice inside ${feature.title}; keep the plan inside that feature boundary unless the candidate is marked cross-feature.`
    : "Highest-ranked PR-sized cleanup slice; generate a focused plan before making changes.";
}

function featureMapMarkdown(candidates: CandidateRecord[], features: FeatureRecord[]): string[] {
  if (features.length === 0) {
    return [];
  }
  const candidateIdsByFeature = new Map<string, string[]>();
  for (const candidate of candidates) {
    for (const featureId of candidate.affectedFeatureIds) {
      const current = candidateIdsByFeature.get(featureId) ?? [];
      current.push(candidate.id);
      candidateIdsByFeature.set(featureId, current);
    }
  }
  const mappedFeatures = features
    .filter((feature) => candidateIdsByFeature.has(feature.featureId))
    .slice(0, 12);
  if (mappedFeatures.length === 0) {
    return [];
  }
  const lines = ["## Feature Map", ""];
  for (const feature of mappedFeatures) {
    const candidateIds = candidateIdsByFeature.get(feature.featureId) ?? [];
    lines.push(
      `### ${feature.featureId}: ${feature.title}`,
      "",
      `- Candidates: ${candidateIds.join(", ")}`,
      `- Entrypoints: ${feature.entrypoints.map(formatFile).join(", ") || "n/a"}`,
      `- Owned files: ${feature.ownedFiles.map(formatFile).join(", ") || "n/a"}`,
      `- Context/shared files: ${feature.contextFiles.map(formatFile).join(", ") || "n/a"}`,
      `- Tests: ${feature.testFiles.map(formatFile).join(", ") || "n/a"}`,
      `- Verification: ${feature.verification.join(", ") || "n/a"}`,
      "",
    );
  }
  return lines;
}

function agentQueueCandidates(candidates: CandidateRecord[]): CandidateRecord[] {
  return [...candidates].sort((a, b) => agentReadinessScore(b) - agentReadinessScore(a) || a.id.localeCompare(b.id));
}

function isWeakMetricCandidate(candidate: CandidateRecord): boolean {
  if (candidate.evidenceIds.length > 1 || candidate.confidence === "high") {
    return false;
  }
  return candidate.category === "complexity" || candidate.category === "testability";
}

function agentReadinessScore(candidate: CandidateRecord): number {
  const priorityScore = { P0: 16, P1: 12, P2: 8, P3: 2 }[candidate.priority];
  const confidenceScore = candidate.confidence === "high" ? 15 : candidate.confidence === "medium" ? 8 : 0;
  const impactScore = candidate.impact === "feature" ? 14 : candidate.impact === "local" ? 10 : 5;
  const effortScore = candidate.effort === "small" ? 14 : candidate.effort === "medium" ? 8 : -8;
  const riskScore = candidate.risk === "safe" ? 10 : candidate.risk === "moderate" ? 5 : -18;
  const readinessScore = candidate.readiness === "fix-ready" ? 16
    : candidate.readiness === "split-needed" ? 4
      : candidate.readiness === "design-needed" ? -10
        : candidate.readiness === "needs-human" ? -15
          : candidate.readiness === "defer" ? -20
            : 0;
  const evidenceScore = Math.min(candidate.evidenceIds.length, 4) * 6;
  const synthesisScore = candidate.provenance.source === "model-synthesis" ? 20 : 0;
  const fixReadinessScore = candidate.fixReadiness ? 8 : 0;
  const weakMetricPenalty = isWeakMetricCandidate(candidate) ? -25 : 0;
  return priorityScore
    + confidenceScore
    + impactScore
    + effortScore
    + riskScore
    + evidenceScore
    + synthesisScore
    + readinessScore
    + fixReadinessScore
    + weakMetricPenalty;
}

function recommendationMarkdown(recommendations: NonNullable<ReportRecord["recommendations"]>): string[] {
  const lines: string[] = ["## Start Here", ""];
  if (recommendations.startHere) {
    lines.push(
      `Plan ${recommendations.startHere.type} ${recommendations.startHere.id} first.`,
      "",
      recommendations.startHere.reason,
      "",
    );
  } else {
    lines.push("No open candidate is ready for handoff.", "");
  }
  if (recommendations.suggestedPlanTargets.length > 0) {
    lines.push(`Suggested plan targets: ${recommendations.suggestedPlanTargets.join(", ")}`, "");
  }
  if (recommendations.warnings.length > 0) {
    lines.push("Warnings:", ...recommendations.warnings.map((warning) => `- ${warning}`), "");
  }
  return lines;
}

function candidateMarkdown(candidate: CandidateRecord): string[] {
  return [
    `### ${candidate.priority} ${candidate.id}: ${candidate.title}`,
    "",
    `- Status: ${candidate.status}`,
    `- Finding: ${candidate.findingId ?? "unlinked"}`,
      `- Revalidation: ${candidate.lifecycleState ?? "ready"}`,
      `- Category: ${candidate.category}`,
      `- Slop type: ${deriveSlopType(candidate)}`,
      `- Fixability: ${deriveCandidateFixability(candidate)}`,
      `- Confidence: ${candidate.confidence}`,
    `- Readiness: ${candidate.readiness ?? "fix-ready"}`,
    `- Impact: ${candidate.impact}`,
    `- Effort: ${candidate.effort}`,
    `- Risk: ${candidate.risk}`,
    `- Feature scope: ${candidate.featureScope}`,
    `- Features: ${candidate.affectedFeatureIds.join(", ") || "unmapped"}`,
    `- Files: ${candidate.files.map((file) => formatFile(file)).join(", ") || "n/a"}`,
    `- Owned files: ${candidate.ownedFiles?.map((file) => formatFile(file)).join(", ") || "n/a"}`,
    `- Context files: ${candidate.contextFiles?.map((file) => formatFile(file)).join(", ") || "n/a"}`,
    "",
    `Why it matters: ${candidate.whyItMatters}`,
    "",
    `Likely root cause: ${candidate.likelyRootCause}`,
    "",
    `Suggested direction: ${candidate.suggestedDirection}`,
    "",
    `Expected behavior: ${candidate.expectedBehavior ?? "Preserve current behavior while narrowing the cleanup boundary."}`,
    "",
    `Proof required: ${candidate.proofRequired?.join("; ") || "Run verification and confirm cited evidence no longer applies."}`,
    "",
    `Non-goals: ${candidate.nonGoals?.join("; ") || "Do not broaden into unrelated cleanup."}`,
    "",
    `Do not touch: ${candidate.doNotTouch?.join("; ") || "Unrelated public APIs, generated files, and adjacent refactors."}`,
    "",
    ...splitChildrenMarkdown(candidate),
    `Verification: ${candidate.verification.join(", ")}`,
    "",
  ];
}

function splitChildrenMarkdown(candidate: CandidateRecord): string[] {
  if (!candidate.splitChildren || candidate.splitChildren.length === 0) {
    return [];
  }
  const lines = ["Split children:"];
  for (const child of candidate.splitChildren) {
    lines.push(
      `- ${child.title}`,
      `  Owned files: ${child.ownedFiles.map(formatFile).join(", ") || "n/a"}`,
      `  Proof: ${child.proofRequired.join("; ")}`,
    );
  }
  lines.push("");
  return lines;
}

export function buildHandoff(
  candidate: CandidateRecord,
  evidence: EvidenceRecord[],
  format: string,
  features: FeatureRecord[] = [],
): HandoffRecord {
  return {
    schemaVersion,
    recordType: "handoff",
    id: timestampId("handoff"),
    candidateId: candidate.id,
    targetType: "candidate",
    targetId: candidate.id,
    format,
    createdAt: new Date().toISOString(),
    content: renderHandoff(candidate, evidence, features),
  };
}

export function buildOpportunityHandoff(
  opportunity: PrOpportunityRecord,
  format: string,
): HandoffRecord {
  return {
    schemaVersion,
    recordType: "handoff",
    id: timestampId("handoff"),
    targetType: "opportunity",
    targetId: opportunity.id,
    opportunityId: opportunity.id,
    format,
    createdAt: new Date().toISOString(),
    content: renderOpportunityHandoff(opportunity),
  };
}

export function renderHandoff(
  candidate: CandidateRecord,
  evidence: EvidenceRecord[],
  features: FeatureRecord[] = [],
): string {
  const testFirst = candidate.fixReadiness?.suggestedRegressionTest
    || "Add or identify the smallest behavior-level regression check before moving code.";
  const minimalFix = candidate.fixReadiness?.minimumFixScope || candidate.suggestedDirection;
  const ownedFiles = candidate.ownedFiles && candidate.ownedFiles.length > 0 ? candidate.ownedFiles : candidate.files;
  return [
    `TASK: ${candidate.title}`,
    "",
    `Candidate: ${candidate.id}`,
    "",
    `Category: ${candidate.category}`,
    `Priority: ${candidate.priority}`,
    `Confidence: ${candidate.confidence}`,
    `Readiness: ${candidate.readiness ?? "fix-ready"}`,
    `Impact: ${candidate.impact}`,
    `Effort: ${candidate.effort}`,
    `Risk: ${candidate.risk}`,
    `Feature scope: ${candidate.featureScope}`,
    `Features: ${candidate.affectedFeatureIds.join(", ") || "unmapped"}`,
    "",
    `Owned files: ${ownedFiles.map(formatFile).join(", ") || "n/a"}`,
    `Context files: ${candidate.contextFiles?.map(formatFile).join(", ") || "n/a"}`,
    "",
    ...featureBoundaryMarkdown(features),
    "Expected behavior:",
    candidate.expectedBehavior ?? "Preserve current user-visible behavior while changing only the cleanup boundary.",
    "",
    "Proof required:",
    ...(candidate.proofRequired && candidate.proofRequired.length > 0
      ? candidate.proofRequired.map((proof) => `- ${proof}`)
      : ["- Re-run verification and confirm cited evidence is resolved or downgraded."]),
    "",
    "Why:",
    candidate.whyItMatters,
    "",
    "Change:",
    minimalFix,
    "",
    "Tests first:",
    testFirst,
    "",
    "Evidence:",
    ...evidence.map((record) => `- ${record.id} ${record.kind} ${record.title}: ${record.files.map(formatFile).join(", ")} — ${record.summary}`),
    "",
    "Likely root cause:",
    candidate.likelyRootCause,
    "",
    "Suggested direction:",
    candidate.suggestedDirection,
    "",
    "Do not:",
    ...(candidate.nonGoals ?? []).map((nonGoal) => `- ${nonGoal}`),
    ...(candidate.doNotTouch ?? []).map((boundary) => `- Do not touch ${boundary}.`),
    "- Do not rewrite broad helper modules beyond this candidate.",
    ...(candidate.featureScope === "cross-feature"
      ? ["- Do not edit across multiple feature boundaries until the work is split into a smaller feature-local slice."]
      : []),
    "- Do not change public API, CLI, or response shapes unless the tests prove current behavior is wrong.",
    "- Do not perform unrelated refactors.",
    "- Do not keep expanding into adjacent cleanup once this slice passes verification.",
    "",
    "Verification:",
    ...candidate.verification.map((command) => `- ${command}`),
  ].join("\n");
}

export function renderOpportunityHandoff(opportunity: PrOpportunityRecord): string {
  return [
    `TASK: ${opportunity.title}`,
    "",
    `Opportunity: ${opportunity.id}`,
    "",
    `Classification: ${opportunity.classification}`,
    `Status: ${opportunity.status}`,
    `Confidence: ${opportunity.confidence}`,
    `Risk: ${opportunity.risk}`,
    `Candidates: ${opportunity.targetCandidateIds.join(", ") || "n/a"}`,
    `Findings: ${opportunity.targetFindingIds.join(", ") || "n/a"}`,
    `Clusters: ${opportunity.targetClusterIds.join(", ") || "n/a"}`,
    "",
    "Change:",
    opportunity.oneSentenceChange,
    "",
    "Why:",
    opportunity.rationale,
    "",
    "Owned files:",
    ...(opportunity.ownedFiles.length > 0 ? opportunity.ownedFiles.map((file) => `- ${formatFile(file)}`) : ["- n/a"]),
    "",
    "Context files:",
    ...(opportunity.contextFiles.length > 0 ? opportunity.contextFiles.map((file) => `- ${formatFile(file)}`) : ["- n/a"]),
    "",
    "Do not touch:",
    ...(opportunity.doNotTouch.length > 0 ? opportunity.doNotTouch.map((item) => `- ${item}`) : ["- Unrelated public APIs, generated files, and adjacent refactors."]),
    "",
    "Behavior invariants:",
    ...(opportunity.behaviorInvariants.length > 0 ? opportunity.behaviorInvariants.map((item) => `- ${item}`) : ["- Preserve current user-visible behavior unless tests prove it is wrong."]),
    "",
    "Stop line:",
    opportunity.stopLine,
    "",
    "Expected payoff:",
    opportunity.expectedPayoff,
    "",
    "Expected reviewer concern:",
    opportunity.expectedReviewerConcern ?? "n/a",
    "",
    "Verification:",
    ...(opportunity.validationPlan.length > 0 ? opportunity.validationPlan.map((command) => `- ${command}`) : ["- deepclean scan"]),
  ].join("\n");
}

function featureBoundaryMarkdown(features: FeatureRecord[]): string[] {
  if (features.length === 0) {
    return [];
  }
  const lines = ["Feature boundary:"];
  for (const feature of features) {
    lines.push(
      `- ${feature.featureId}: ${feature.title}`,
      `  Entrypoints: ${feature.entrypoints.map(formatFile).join(", ") || "n/a"}`,
      `  Owned files: ${feature.ownedFiles.map(formatFile).join(", ") || "n/a"}`,
      `  Context/shared files: ${feature.contextFiles.map(formatFile).join(", ") || "n/a"}`,
      `  Tests: ${feature.testFiles.map(formatFile).join(", ") || "n/a"}`,
    );
  }
  lines.push("");
  return lines;
}

type FileLike = { path: string; startLine?: number | undefined; endLine?: number | undefined };

export function formatFile(file: FileLike): string {
  if (file.startLine && file.endLine) {
    return `${file.path}:${file.startLine}-${file.endLine}`;
  }
  if (file.startLine) {
    return `${file.path}:${file.startLine}`;
  }
  return file.path;
}
