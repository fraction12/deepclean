import {
  schemaVersion,
  type CandidateRecord,
  type ClusterRecord,
  type EvidenceRecord,
  type HandoffRecord,
  type ReportRecord,
} from "./types.js";
import { timestampId } from "./ids.js";

export function buildReportRecord(
  runId: string,
  candidates: CandidateRecord[],
  clusters: ClusterRecord[] = [],
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
    recommendations: buildReportRecommendations(candidates, clusters),
  };
}

export function renderMarkdownReport(candidates: CandidateRecord[]): string {
  const recommendations = buildReportRecommendations(candidates, []);
  const queuedCandidates = agentQueueCandidates(candidates.filter((candidate) => candidate.status === "open"));
  const lines = [
    "# Deepclean Report",
    "",
    `Found ${candidates.length} cleanup candidate${candidates.length === 1 ? "" : "s"}.`,
    "",
    ...recommendationMarkdown(recommendations),
    ...agentQueueMarkdown(queuedCandidates),
  ];

  lines.push("## Candidate Appendix", "");
  for (const candidate of candidates.slice(0, 40)) {
    lines.push(
      `## ${candidate.priority} ${candidate.id}: ${candidate.title}`,
      "",
      `- Status: ${candidate.status}`,
      `- Category: ${candidate.category}`,
      `- Confidence: ${candidate.confidence}`,
      `- Impact: ${candidate.impact}`,
      `- Effort: ${candidate.effort}`,
      `- Risk: ${candidate.risk}`,
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
    );
  }
  if (candidates.length > 40) {
    lines.push(`_Appendix truncated to 40 candidates. Full candidate records are in the JSON artifact._`, "");
  }

  return `${lines.join("\n")}\n`;
}

export function renderMarkdownReportWithClusters(
  candidates: CandidateRecord[],
  clusters: ClusterRecord[],
): string {
  const recommendations = buildReportRecommendations(candidates, clusters);
  const queuedCandidates = agentQueueCandidates(candidates.filter((candidate) => candidate.status === "open"));
  const lines = [
    "# Deepclean Report",
    "",
    `Found ${candidates.length} cleanup candidate${candidates.length === 1 ? "" : "s"} across ${clusters.length} theme${clusters.length === 1 ? "" : "s"}.`,
    "",
    ...recommendationMarkdown(recommendations),
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
): NonNullable<ReportRecord["recommendations"]> {
  const openCandidates = candidates.filter((candidate) => candidate.status === "open");
  const boundedThemes = clusters.filter((cluster) => (cluster.actionability ?? "bounded") === "bounded");
  const queuedCandidates = agentQueueCandidates(openCandidates);
  const topCandidateIds = queuedCandidates.slice(0, 10).map((candidate) => candidate.id);
  const topThemeIds = boundedThemes.slice(0, 5).map((cluster) => cluster.id);
  const warnings = clusters.flatMap((cluster) => (cluster.warnings ?? []).map((warning) => `${cluster.id}: ${warning}`));
  const firstTheme = boundedThemes[0];
  const firstCandidate = queuedCandidates[0];
  const startHere = firstTheme
    ? {
      id: firstTheme.id,
      type: "theme" as const,
      reason: "Highest-ranked bounded cleanup theme; generate a plan before handing it to an agent.",
    }
    : firstCandidate
      ? {
        id: firstCandidate.id,
        type: "candidate" as const,
        reason: "Highest-ranked open candidate; generate a focused plan before making changes.",
      }
      : undefined;
  return {
    startHere,
    topCandidateIds,
    topThemeIds,
    warnings,
    suggestedPlanTargets: [...topThemeIds.slice(0, 2), ...topCandidateIds.slice(0, 3)],
  };
}

function agentQueueCandidates(candidates: CandidateRecord[]): CandidateRecord[] {
  const modelCandidates = candidates.filter((candidate) => candidate.provenance.source === "model-synthesis");
  const highSignalLocal = candidates.filter((candidate) => (
    candidate.provenance.source !== "model-synthesis"
    && !isWeakMetricCandidate(candidate)
  ));
  const weakMetric = candidates.filter((candidate) => (
    candidate.provenance.source !== "model-synthesis"
    && isWeakMetricCandidate(candidate)
  ));
  return [...modelCandidates, ...highSignalLocal, ...weakMetric];
}

function isWeakMetricCandidate(candidate: CandidateRecord): boolean {
  if (candidate.evidenceIds.length > 1 || candidate.confidence === "high") {
    return false;
  }
  return candidate.category === "complexity" || candidate.category === "testability";
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
    `- Category: ${candidate.category}`,
    `- Confidence: ${candidate.confidence}`,
    `- Impact: ${candidate.impact}`,
    `- Effort: ${candidate.effort}`,
    `- Risk: ${candidate.risk}`,
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
): HandoffRecord {
  return {
    schemaVersion,
    recordType: "handoff",
    id: timestampId("handoff"),
    candidateId: candidate.id,
    format,
    createdAt: new Date().toISOString(),
    content: renderHandoff(candidate, evidence),
  };
}

export function renderHandoff(
  candidate: CandidateRecord,
  evidence: EvidenceRecord[],
): string {
  return [
    `TASK: Investigate and address Deepclean candidate ${candidate.id}`,
    "",
    `Problem: ${candidate.title}`,
    "",
    `Category: ${candidate.category}`,
    `Priority: ${candidate.priority}`,
    `Confidence: ${candidate.confidence}`,
    `Impact: ${candidate.impact}`,
    `Effort: ${candidate.effort}`,
    `Risk: ${candidate.risk}`,
    "",
    "Why it matters:",
    candidate.whyItMatters,
    "",
    "Evidence:",
    ...evidence.map((record) => `- ${record.id} ${record.title}: ${record.files.map(formatFile).join(", ")}`),
    "",
    "Likely root cause:",
    candidate.likelyRootCause,
    "",
    "Suggested direction:",
    candidate.suggestedDirection,
    "",
    "Constraints:",
    "- Preserve existing behavior unless tests prove the current behavior is wrong.",
    "- Keep changes scoped to this candidate.",
    "- Do not perform unrelated refactors.",
    "",
    "Verification:",
    ...candidate.verification.map((command) => `- ${command}`),
  ].join("\n");
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
