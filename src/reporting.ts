import {
  schemaVersion,
  type CandidateRecord,
  type ClusterRecord,
  type EvidenceRecord,
  type FeatureRecord,
  type HandoffRecord,
  type ReportRecord,
} from "./types.js";
import { timestampId } from "./ids.js";

export function buildReportRecord(
  runId: string,
  candidates: CandidateRecord[],
  clusters: ClusterRecord[] = [],
  features: FeatureRecord[] = [],
): ReportRecord {
  const byPriority: Record<string, number> = {};
  for (const candidate of candidates) {
    byPriority[candidate.priority] = (byPriority[candidate.priority] ?? 0) + 1;
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
    },
    recommendations: buildReportRecommendations(candidates, clusters, features),
  };
}

export function renderMarkdownReport(candidates: CandidateRecord[], features: FeatureRecord[] = []): string {
  const recommendations = buildReportRecommendations(candidates, [], features);
  const queuedCandidates = agentQueueCandidates(candidates.filter((candidate) => candidate.status === "open"));
  const lines = [
    "# Deepclean Report",
    "",
    `Found ${candidates.length} cleanup candidate${candidates.length === 1 ? "" : "s"}.`,
    "",
    ...recommendationMarkdown(recommendations),
    ...featureMapMarkdown(candidates, features),
    ...agentQueueMarkdown(queuedCandidates),
  ];

  lines.push("## Candidate Appendix", "");
  for (const candidate of candidates.slice(0, 40)) {
    lines.push(...candidateMarkdown(candidate));
  }
  if (candidates.length > 40) {
    lines.push(`_Appendix truncated to 40 candidates. Full candidate records are in the JSON artifact._`, "");
  }

  return `${lines.join("\n")}\n`;
}

export function renderMarkdownReportWithClusters(
  candidates: CandidateRecord[],
  clusters: ClusterRecord[],
  features: FeatureRecord[] = [],
): string {
  const recommendations = buildReportRecommendations(candidates, clusters, features);
  const queuedCandidates = agentQueueCandidates(candidates.filter((candidate) => candidate.status === "open"));
  const lines = [
    "# Deepclean Report",
    "",
    `Found ${candidates.length} cleanup candidate${candidates.length === 1 ? "" : "s"} across ${clusters.length} theme${clusters.length === 1 ? "" : "s"}.`,
    "",
    ...recommendationMarkdown(recommendations),
    ...featureMapMarkdown(candidates, features),
    ...agentQueueMarkdown(queuedCandidates),
  ];

  if (clusters.length > 0) {
    lines.push("## Cleanup Themes", "");
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
  }

  lines.push("## Candidate Appendix", "");
  for (const candidate of candidates.slice(0, 40)) {
    lines.push(...candidateMarkdown(candidate));
  }
  if (candidates.length > 40) {
    lines.push(`_Appendix truncated to 40 candidates. Full candidate records are in the JSON artifact._`, "");
  }

  return `${lines.join("\n")}\n`;
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
      `- ${candidate.id} ${candidate.priority} ${candidate.title} (${source}, ${candidate.confidence})`,
      `  Feature scope: ${candidate.featureScope}; Features: ${candidate.affectedFeatureIds.join(", ") || "unmapped"}`,
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
      reason: firstFeature
        ? `Highest-ranked PR-sized cleanup slice inside ${firstFeature.title}; keep the plan inside that feature boundary unless the candidate is marked cross-feature.`
        : "Highest-ranked PR-sized cleanup slice; generate a focused plan before making changes.",
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
  const evidenceScore = Math.min(candidate.evidenceIds.length, 4) * 6;
  const synthesisScore = candidate.provenance.source === "model-synthesis" ? 20 : 0;
  const readinessScore = candidate.fixReadiness ? 8 : 0;
  const weakMetricPenalty = isWeakMetricCandidate(candidate) ? -25 : 0;
  return priorityScore
    + confidenceScore
    + impactScore
    + effortScore
    + riskScore
    + evidenceScore
    + synthesisScore
    + readinessScore
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
    `- Confidence: ${candidate.confidence}`,
    `- Impact: ${candidate.impact}`,
    `- Effort: ${candidate.effort}`,
    `- Risk: ${candidate.risk}`,
    `- Feature scope: ${candidate.featureScope}`,
    `- Features: ${candidate.affectedFeatureIds.join(", ") || "unmapped"}`,
    `- Files: ${candidate.files.map((file) => formatFile(file)).join(", ") || "n/a"}`,
    "",
    `Why it matters: ${candidate.whyItMatters}`,
    "",
    `Likely root cause: ${candidate.likelyRootCause}`,
    "",
    `Suggested direction: ${candidate.suggestedDirection}`,
    "",
    `Verification: ${candidate.verification.join(", ")}`,
    "",
  ];
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
    format,
    createdAt: new Date().toISOString(),
    content: renderHandoff(candidate, evidence, features),
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
  return [
    `TASK: ${candidate.title}`,
    "",
    `Candidate: ${candidate.id}`,
    "",
    `Category: ${candidate.category}`,
    `Priority: ${candidate.priority}`,
    `Confidence: ${candidate.confidence}`,
    `Impact: ${candidate.impact}`,
    `Effort: ${candidate.effort}`,
    `Risk: ${candidate.risk}`,
    `Feature scope: ${candidate.featureScope}`,
    `Features: ${candidate.affectedFeatureIds.join(", ") || "unmapped"}`,
    "",
    ...featureBoundaryMarkdown(features),
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
