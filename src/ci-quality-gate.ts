import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { schemaVersion } from "./defaults.js";
import { timestampId } from "./ids.js";
import { deriveCandidateFixability, deriveSlopType } from "./slop-classification.js";
import {
  adHocQualityProfile,
  builtInQualityProfile,
  evaluateQualityProfile,
  type BuiltInQualityProfileId,
  type ReviewPrQualityInput,
} from "./quality-gates.js";
import type {
  CandidateRecord,
  CiRunRecord,
  Diagnostic,
  QualityGateResultRecord,
  QualityProfileRecord,
} from "./types.js";

export type CiPolicyResult = {
  blockingFindingIds: string[];
  reasons: Array<{ findingId: string; reason: string }>;
};

export type CiQualityGateScan = {
  runId: string;
  root: string;
  candidateCount: number;
  candidates: CandidateRecord[];
  scope: {
    since?: string | undefined;
    mergeBase?: string | undefined;
  };
};

export type CiQualityGateOptions = {
  root: string;
  profileId?: string | undefined;
  policy: Record<string, unknown>;
  scan: CiQualityGateScan;
  diagnostics: Diagnostic[];
  reviewPr?: ReviewPrQualityInput | undefined;
  outputPath?: string | undefined;
  sarifPath?: string | undefined;
  createdAt?: string | undefined;
};

export type CiQualityGateRun = {
  ciRun: CiRunRecord;
  policy: Record<string, unknown>;
  qualityProfile: QualityProfileRecord;
  qualityGateResult: QualityGateResultRecord;
  legacyGate: CiPolicyResult;
  legacyFailed: boolean;
  qualityFailed: boolean;
};

export async function buildCiQualityGateRun(options: CiQualityGateOptions): Promise<CiQualityGateRun> {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const qualityProfile = qualityProfileFromCi(options.profileId, options.policy, createdAt);
  const legacyGate = evaluateLegacyCiPolicy(options.scan.candidates, options.policy);
  const qualityGateResult = evaluateQualityProfile({
    profile: qualityProfile,
    runId: options.scan.runId,
    baselineRef: options.scan.scope.since ?? options.scan.scope.mergeBase,
    headRef: "HEAD",
    candidates: options.scan.candidates,
    legacyGate,
    reviewPr: options.reviewPr,
    createdAt,
  });
  const artifactPaths = await writeCiArtifacts({
    root: options.root,
    outputPath: options.outputPath,
    sarifPath: options.sarifPath,
    scan: options.scan,
    legacyGate,
    qualityGateResult,
  });
  qualityGateResult.artifactPaths = artifactPaths;
  const qualityFailed = qualityGateResult.status === "failed";
  const legacyFailed = legacyGate.blockingFindingIds.length > 0;
  const ciRun: CiRunRecord = {
    schemaVersion,
    recordType: "ci_run",
    id: timestampId("ci"),
    runId: options.scan.runId,
    baselineRef: options.scan.scope.since ?? options.scan.scope.mergeBase,
    status: legacyFailed || qualityFailed ? "policy-failed" : "passed",
    policy: options.policy,
    blockingFindingIds: legacyGate.blockingFindingIds,
    artifactPaths,
    diagnostics: options.diagnostics,
    createdAt,
  };

  return {
    ciRun,
    policy: options.policy,
    qualityProfile,
    qualityGateResult,
    legacyGate,
    legacyFailed,
    qualityFailed,
  };
}

export function qualityProfileFromCi(
  profileId: string | undefined,
  policy: Record<string, unknown>,
  createdAt: string,
): QualityProfileRecord {
  if (!profileId) {
    return adHocQualityProfile(policy, createdAt);
  }
  if (isBuiltInQualityProfile(profileId)) {
    return builtInQualityProfile(profileId, createdAt);
  }
  throw new Error(`Unsupported quality profile: ${profileId}. Expected advisory, balanced, strict, or maintainability-only.`);
}

export function evaluateLegacyCiPolicy(candidates: CandidateRecord[], policy: Record<string, unknown>): CiPolicyResult {
  const blockers = new Map<string, string>();
  const byPriority = countBy(candidates, (candidate) => candidate.priority.toLowerCase());
  for (const priority of ["p0", "p1", "p2", "p3"]) {
    const max = numberPolicy(policy, `max-${priority}`);
    if (max !== undefined && (byPriority[priority] ?? 0) > max) {
      for (const candidate of candidates.filter((item) => item.priority.toLowerCase() === priority).slice(max)) {
        blockers.set(candidate.findingId ?? candidate.id, `max-${priority}`);
      }
    }
    const maxNew = numberPolicy(policy, `max-new-${priority}`);
    if (maxNew !== undefined) {
      const newCandidates = candidates.filter((item) => (
        item.priority.toLowerCase() === priority
        && item.baselineStatus === "new"
      ));
      if (newCandidates.length > maxNew) {
        for (const candidate of newCandidates.slice(maxNew)) {
          blockers.set(candidate.findingId ?? candidate.id, `max-new-${priority}`);
        }
      }
    }
  }
  const maxStale = numberPolicy(policy, "max-stale");
  if (maxStale !== undefined) {
    const stale = candidates.filter((candidate) => candidate.lifecycleState === "stale" || candidate.status === "stale");
    if (stale.length > maxStale) {
      for (const candidate of stale.slice(maxStale)) {
        blockers.set(candidate.findingId ?? candidate.id, "max-stale");
      }
    }
  }
  const categories = Array.isArray(policy["fail-category"]) ? policy["fail-category"] : [];
  for (const candidate of candidates) {
    if (categories.includes(candidate.category)) {
      blockers.set(candidate.findingId ?? candidate.id, `fail-category:${candidate.category}`);
    }
  }
  const minConfidence = typeof policy["min-confidence"] === "string" ? policy["min-confidence"] : undefined;
  if (minConfidence) {
    const order = ["low", "medium", "high"];
    const minimum = order.indexOf(minConfidence);
    if (minimum >= 0) {
      for (const candidate of candidates) {
        if (order.indexOf(candidate.confidence) < minimum) {
          blockers.set(candidate.findingId ?? candidate.id, `min-confidence:${minConfidence}`);
        }
      }
    }
  }
  return {
    blockingFindingIds: [...blockers.keys()].sort(),
    reasons: [...blockers.entries()].map(([findingId, reason]) => ({ findingId, reason })),
  };
}

export async function writeCiArtifacts(options: {
  root: string;
  outputPath?: string | undefined;
  sarifPath?: string | undefined;
  scan: CiQualityGateScan;
  legacyGate: CiPolicyResult;
  qualityGateResult: QualityGateResultRecord;
}): Promise<{ json?: string; markdown?: string; sarif?: string }> {
  const artifactPaths: { json?: string; markdown?: string; sarif?: string } = {};
  if (options.outputPath) {
    const markdownPath = path.resolve(options.root, options.outputPath);
    await mkdir(path.dirname(markdownPath), { recursive: true });
    await writeFile(markdownPath, renderCiMarkdown(options.scan, options.legacyGate, options.qualityGateResult), "utf8");
    artifactPaths.markdown = markdownPath;
  }
  if (options.sarifPath) {
    const sarifPath = path.resolve(options.root, options.sarifPath);
    await mkdir(path.dirname(sarifPath), { recursive: true });
    await writeFile(sarifPath, JSON.stringify(renderCiSarif(options.scan.candidates, options.qualityGateResult), null, 2) + "\n", "utf8");
    artifactPaths.sarif = sarifPath;
  }
  return artifactPaths;
}

export function renderCiMarkdown(
  scan: CiQualityGateScan,
  legacyGate: CiPolicyResult,
  qualityGateResult: QualityGateResultRecord,
): string {
  return [
    "# Deepclean CI",
    "",
    `Run: ${scan.runId}`,
    `Candidates: ${scan.candidateCount}`,
    `Blocking: ${legacyGate.blockingFindingIds.length}`,
    `Quality gate: ${qualityGateResult.status}`,
    `Profile: ${qualityGateResult.profileId}`,
    "",
    "## Blocking Findings",
    "",
    ...(
      legacyGate.reasons.length > 0
        ? legacyGate.reasons.map((reason) => `- ${reason.findingId}: ${reason.reason}`)
        : ["None"]
    ),
    "",
    "## Quality Blockers",
    "",
    ...(
      qualityGateResult.blockers.length > 0
        ? qualityGateResult.blockers.map((finding) => `- ${finding.id}: ${finding.title} [${finding.actionability ?? "merge-blocker"}, ${finding.fixability ?? "review-only"}] - ${finding.summary}`)
        : ["None"]
    ),
    "",
    "## Quality Advisories",
    "",
    ...(
      qualityGateResult.advisories.length > 0
        ? qualityGateResult.advisories.map((finding) => `- ${finding.id}: ${finding.title} [${finding.actionability ?? "warning"}, ${finding.fixability ?? "review-only"}] - ${finding.summary}`)
        : ["None"]
    ),
    "",
  ].join("\n");
}

export function renderCiSarif(candidates: CandidateRecord[], qualityGateResult?: QualityGateResultRecord): unknown {
  const qualityFindings = qualityGateResult ? [...qualityGateResult.blockers, ...qualityGateResult.advisories] : [];
  return {
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "Deepclean" } },
      results: [
        ...candidates.map((candidate) => ({
          ruleId: `deepclean/${candidate.category}`,
          level: candidate.priority === "P0" || candidate.priority === "P1" ? "warning" : "note",
          message: { text: `${candidate.id}: ${candidate.title}` },
          locations: candidate.files.slice(0, 1).map((file) => ({
            physicalLocation: {
              artifactLocation: { uri: file.path },
              region: { startLine: file.startLine ?? 1, endLine: file.endLine ?? file.startLine ?? 1 },
            },
          })),
          properties: {
            findingId: candidate.findingId,
            priority: candidate.priority,
            confidence: candidate.confidence,
            slopType: deriveSlopType(candidate),
            fixability: deriveCandidateFixability(candidate),
            baselineStatus: candidate.baselineStatus,
          },
        })),
        ...qualityFindings.map((finding) => ({
          ruleId: `deepclean/quality/${finding.family}`,
          level: finding.severity === "blocker" ? "error" : "note",
          message: { text: `${finding.id}: ${finding.title}. ${finding.summary}` },
          locations: finding.files.slice(0, 1).map((file) => ({
            physicalLocation: {
              artifactLocation: { uri: file.path },
              region: { startLine: file.startLine ?? 1, endLine: file.endLine ?? file.startLine ?? 1 },
            },
          })),
          properties: {
            profileId: qualityGateResult?.profileId,
            candidateIds: finding.candidateIds,
            findingIds: finding.findingIds,
            opportunityIds: finding.opportunityIds,
            analyzerRuleIds: finding.analyzerRuleIds,
            actionability: finding.actionability,
            fixability: finding.fixability,
            baselineStatus: finding.baselineStatus,
          },
        })),
      ],
    }],
  };
}

function isBuiltInQualityProfile(value: string): value is BuiltInQualityProfileId {
  return ["advisory", "balanced", "strict", "maintainability-only"].includes(value);
}

function numberPolicy(policy: Record<string, unknown>, key: string): number | undefined {
  const value = policy[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = key(item);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}
