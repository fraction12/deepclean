import {
  schemaVersion,
  type CandidateRecord,
  type ClusterRecord,
  type EvidenceRecord,
  type FileReference,
  type PlanRecord,
} from "./types.js";
import { timestampId } from "./ids.js";
import { formatFile } from "./reporting.js";

export function buildCandidatePlan(
  runId: string,
  candidate: CandidateRecord,
  evidence: EvidenceRecord[],
): PlanRecord {
  const candidateFiles = uniqueFileReferences(candidate.files, 12);
  const steps = [
    {
      title: "Characterize current behavior",
      description: "Read the cited files and add or identify the smallest verification path before changing structure.",
      candidateIds: [candidate.id],
      files: candidateFiles,
      verification: candidate.verification,
    },
    {
      title: "Map the responsibility boundary",
      description: candidate.likelyRootCause,
      candidateIds: [candidate.id],
      files: candidateFiles,
      verification: [],
    },
    {
      title: "Apply the focused cleanup",
      description: candidate.suggestedDirection,
      candidateIds: [candidate.id],
      files: candidateFiles,
      verification: candidate.verification,
    },
    {
      title: "Re-run verification and Deepclean",
      description: "Run the listed verification commands, then run Deepclean again to confirm the candidate no longer appears or has lower priority.",
      candidateIds: [candidate.id],
      files: [],
      verification: [...candidate.verification, "deepclean scan --synthesize"],
    },
  ];
  const plan = basePlan({
    runId,
    targetType: "candidate",
    targetId: candidate.id,
    title: `Plan for ${candidate.id}: ${candidate.title}`,
    summary: candidate.whyItMatters,
    steps,
    verification: candidate.verification,
  });
  return {
    ...plan,
    content: renderPlan(plan, { candidates: [candidate], evidence }),
  };
}

export function buildClusterPlan(
  runId: string,
  cluster: ClusterRecord,
  candidates: CandidateRecord[],
  evidence: EvidenceRecord[],
): PlanRecord {
  const ordered = [...candidates].sort((a, b) => cluster.candidateIds.indexOf(a.id) - cluster.candidateIds.indexOf(b.id));
  const clusterFiles = uniqueFileReferences(cluster.files, 12);
  const steps = [
    {
      title: "Read the cluster as one cleanup theme",
      description: cluster.rationale,
      candidateIds: ordered.map((candidate) => candidate.id),
      files: clusterFiles,
      verification: [],
    },
    {
      title: "Establish safety checks first",
      description: "Add or confirm targeted tests around the behavior touched by the highest-risk candidates before moving code.",
      candidateIds: ordered.filter((candidate) => candidate.category === "testability").map((candidate) => candidate.id),
      files: clusterFiles,
      verification: cluster.verification,
    },
    ...ordered.map((candidate) => ({
      title: `Address ${candidate.id}: ${candidate.title}`,
      description: candidate.suggestedDirection,
      candidateIds: [candidate.id],
      files: uniqueFileReferences(candidate.files, 8),
      verification: candidate.verification,
    })),
    {
      title: "Close the theme",
      description: "Run verification, regenerate the report, and triage any remaining candidates in this cluster with notes.",
      candidateIds: ordered.map((candidate) => candidate.id),
      files: clusterFiles,
      verification: [...cluster.verification, "deepclean scan --synthesize", "deepclean cluster"],
    },
  ];
  const plan = basePlan({
    runId,
    targetType: "cluster",
    targetId: cluster.id,
    title: `Plan for ${cluster.id}: ${cluster.title}`,
    summary: cluster.summary,
    steps,
    verification: cluster.verification,
  });
  return {
    ...plan,
    content: renderPlan(plan, { cluster, candidates: ordered, evidence }),
  };
}

function basePlan(values: {
  runId: string;
  targetType: PlanRecord["targetType"];
  targetId: string;
  title: string;
  summary: string;
  steps: PlanRecord["steps"];
  verification: string[];
}): PlanRecord {
  const now = new Date().toISOString();
  return {
    schemaVersion,
    recordType: "plan",
    id: timestampId("plan"),
    runId: values.runId,
    targetType: values.targetType,
    targetId: values.targetId,
    title: values.title,
    summary: values.summary,
    steps: values.steps,
    constraints: [
      "Preserve current behavior unless a failing or added test proves the behavior is wrong.",
      "Keep changes scoped to the target candidate or cluster.",
      "Do not perform broad style churn while doing structural cleanup.",
      "Update or add tests before moving behavior with user-visible impact.",
    ],
    verification: unique(values.verification),
    createdAt: now,
    content: "",
  };
}

function renderPlan(
  plan: PlanRecord,
  context: { cluster?: ClusterRecord; candidates: CandidateRecord[]; evidence: EvidenceRecord[] },
): string {
  const lines = [
    `TASK: ${plan.title}`,
    "",
    `Target: ${plan.targetType} ${plan.targetId}`,
    "",
    "Summary:",
    plan.summary,
    "",
  ];

  if (context.cluster) {
    lines.push(
      "Cluster:",
      `- Priority: ${context.cluster.priority}`,
      `- Category: ${context.cluster.category}`,
      `- Impact: ${context.cluster.impact}`,
      `- Candidates: ${context.cluster.candidateIds.join(", ")}`,
      `- Files: ${uniqueFileReferences(context.cluster.files, 12).map(formatFile).join(", ") || "n/a"}`,
      "",
    );
  }

  lines.push("Candidates:");
  for (const candidate of context.candidates) {
    lines.push(
      `- ${candidate.id} ${candidate.priority} ${candidate.title}`,
      `  Direction: ${candidate.suggestedDirection}`,
    );
  }

  lines.push("", "Evidence:");
  for (const record of context.evidence.slice(0, 20)) {
    lines.push(`- ${record.id} ${record.title}: ${uniqueFileReferences(record.files, 8).map(formatFile).join(", ") || "n/a"}`);
  }

  lines.push("", "Steps:");
  for (const [index, step] of plan.steps.entries()) {
    lines.push(
      `${index + 1}. ${step.title}`,
      `   ${step.description}`,
      `   Candidates: ${step.candidateIds.join(", ") || "n/a"}`,
      `   Files: ${step.files.map((file: FileReference) => formatFile(file)).join(", ") || "n/a"}`,
    );
    if (step.verification.length > 0) {
      lines.push(`   Verification: ${step.verification.join(", ")}`);
    }
  }

  lines.push("", "Constraints:", ...plan.constraints.map((constraint) => `- ${constraint}`));
  lines.push("", "Verification:", ...plan.verification.map((command) => `- ${command}`));
  return lines.join("\n");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueFileReferences(files: FileReference[], limit = 20): FileReference[] {
  const seen = new Set<string>();
  const result: FileReference[] = [];
  for (const file of files) {
    const key = file.path;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(file);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}
