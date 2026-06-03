import { z } from "zod";
import { schemaVersion } from "./defaults.js";
import { fileReferenceSchema } from "./file-references.js";
import type { CandidateRecord, EvidenceRecord, FeatureRecord, PrOpportunityRecord } from "./types.js";

export const reviewPrCandidateSchema = z.object({
  id: z.string(),
  findingId: z.string().optional(),
  title: z.string(),
  priority: z.string(),
  category: z.string(),
  risk: z.string(),
  readiness: z.string().optional(),
  confidence: z.string(),
  files: z.array(fileReferenceSchema),
  evidenceIds: z.array(z.string()),
  affectedFeatureIds: z.array(z.string()),
  suggestedDirection: z.string(),
  verification: z.array(z.string()),
});

export const reviewPrNeighborhoodSchema = z.object({
  path: z.string(),
  candidateIds: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  featureIds: z.array(z.string()),
  relatedFiles: z.array(z.string()),
});

export const reviewPrTargetVerdictSchema = z.object({
  targetId: z.string(),
  targetType: z.enum(["opportunity", "candidate", "finding"]),
  verdict: z.enum(["addresses-target", "partially-addresses-target", "wrong-target", "too-broad", "needs-human"]),
  reasons: z.array(z.string()),
  ownedFiles: z.array(z.string()),
  doNotTouch: z.array(z.string()),
  changedDoNotTouchFiles: z.array(z.string()),
  missingVerification: z.array(z.string()),
});

export const reviewPrContextSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  recordType: z.literal("review_pr_context"),
  id: z.string(),
  runId: z.string(),
  root: z.string(),
  stateDir: z.string(),
  base: z.string(),
  head: z.string(),
  changedFiles: z.array(z.string()),
  relatedCandidates: z.array(reviewPrCandidateSchema),
  architectureNeighborhoods: z.array(reviewPrNeighborhoodSchema),
  riskSummary: z.object({
    level: z.enum(["low", "medium", "high", "critical"]),
    reasons: z.array(z.string()),
    byPriority: z.record(z.string(), z.number().int().nonnegative()),
    designNeeded: z.number().int().nonnegative(),
    fixReady: z.number().int().nonnegative(),
  }),
  suggestedVerificationCommands: z.array(z.string()),
  targetVerdict: reviewPrTargetVerdictSchema.optional(),
  promptContext: z.string(),
  outputPath: z.string().optional(),
  createdAt: z.string(),
});

export type ReviewPrContext = z.infer<typeof reviewPrContextSchema>;

export const reviewPrQualityInputSchema = z.union([
  reviewPrContextSchema,
  z.object({
    targetVerdict: reviewPrTargetVerdictSchema.nullable(),
  }).passthrough(),
]);

export function buildReviewPrContext(options: {
  id: string;
  runId: string;
  root: string;
  stateDir: string;
  base: string;
  head: string;
  changedFiles: string[];
  candidates: CandidateRecord[];
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
  target?: ReviewPrTarget | undefined;
  createdAt: string;
  outputPath?: string | undefined;
}): ReviewPrContext {
  const relatedCandidates = candidatesRelatedToChangedFiles(options.candidates, options.evidence, options.features, options.changedFiles)
    .slice(0, 20)
    .map((candidate) => ({
      id: candidate.id,
      ...(candidate.findingId ? { findingId: candidate.findingId } : {}),
      title: candidate.title,
      priority: candidate.priority,
      category: candidate.category,
      risk: candidate.risk,
      ...(candidate.readiness ? { readiness: candidate.readiness } : {}),
      confidence: candidate.confidence,
      files: candidate.files,
      evidenceIds: candidate.evidenceIds,
      affectedFeatureIds: candidate.affectedFeatureIds,
      suggestedDirection: candidate.suggestedDirection,
      verification: candidate.verification,
    }));
  const relatedCandidateIds = new Set(relatedCandidates.map((candidate) => candidate.id));
  const relatedEvidence = options.evidence.filter((record) => (
    record.files.some((file) => pathTouchesChangedFiles(file.path, options.changedFiles))
    || relatedCandidates.some((candidate) => candidate.evidenceIds.includes(record.id))
  ));
  const neighborhoods = buildReviewNeighborhoods({
    changedFiles: options.changedFiles,
    candidates: options.candidates.filter((candidate) => relatedCandidateIds.has(candidate.id)),
    evidence: relatedEvidence,
    features: options.features,
  });
  const riskSummary = summarizeReviewRisk(relatedCandidates);
  const suggestedVerificationCommands = uniqueSorted([
    ...relatedCandidates.flatMap((candidate) => candidate.verification),
    ...options.features
      .filter((feature) => neighborhoods.some((neighborhood) => neighborhood.featureIds.includes(feature.featureId)))
      .flatMap((feature) => feature.verification),
  ]).slice(0, 12);
  const targetVerdict = options.target
    ? evaluateTargetVerdict(options.target, options.changedFiles, suggestedVerificationCommands)
    : undefined;
  const promptContext = renderReviewPromptContext({
    base: options.base,
    head: options.head,
    changedFiles: options.changedFiles,
    relatedCandidates,
    neighborhoods,
    riskSummary,
    suggestedVerificationCommands,
  });

  return reviewPrContextSchema.parse({
    schemaVersion,
    recordType: "review_pr_context",
    id: options.id,
    runId: options.runId,
    root: options.root,
    stateDir: options.stateDir,
    base: options.base,
    head: options.head,
    changedFiles: options.changedFiles,
    relatedCandidates,
    architectureNeighborhoods: neighborhoods,
    riskSummary,
    suggestedVerificationCommands,
    ...(targetVerdict ? { targetVerdict } : {}),
    promptContext,
    ...(options.outputPath ? { outputPath: options.outputPath } : {}),
    createdAt: options.createdAt,
  });
}

export type ReviewPrTarget = {
  id: string;
  type: "opportunity";
  opportunity: PrOpportunityRecord;
} | {
  id: string;
  type: "candidate";
  candidate: CandidateRecord;
} | {
  id: string;
  type: "finding";
  candidate: CandidateRecord;
};

function evaluateTargetVerdict(
  target: ReviewPrTarget,
  changedFiles: string[],
  suggestedVerificationCommands: string[],
): z.infer<typeof reviewPrTargetVerdictSchema> {
  const ownedFiles = targetOwnedFiles(target);
  const doNotTouch = targetDoNotTouch(target);
  const expectedVerification = targetVerification(target);
  const changedDoNotTouchFiles = changedFiles.filter((file) => doNotTouch.some((blocked) => pathTouchesChangedFiles(blocked, [file])));
  const changedOwnedFiles = changedFiles.filter((file) => ownedFiles.some((owned) => pathTouchesChangedFiles(owned, [file])));
  const missingVerification = expectedVerification.filter((command) => !suggestedVerificationCommands.includes(command));
  const reasons: string[] = [];
  let verdict: z.infer<typeof reviewPrTargetVerdictSchema>["verdict"] = "addresses-target";

  if (changedDoNotTouchFiles.length > 0) {
    verdict = "too-broad";
    reasons.push(`Changed do-not-touch files: ${changedDoNotTouchFiles.join(", ")}`);
  } else if (changedOwnedFiles.length === 0 && ownedFiles.length > 0) {
    verdict = "wrong-target";
    reasons.push("PR changed no files owned by the target.");
  } else if (missingVerification.length > 0) {
    verdict = "partially-addresses-target";
    reasons.push(`Target verification is not visible in PR context: ${missingVerification.join(", ")}`);
  } else if (ownedFiles.length === 0) {
    verdict = "needs-human";
    reasons.push("Target has no owned file scope to compare against.");
  } else {
    reasons.push("Changed files overlap the target scope and no do-not-touch files changed.");
  }

  return {
    targetId: target.id,
    targetType: target.type,
    verdict,
    reasons,
    ownedFiles,
    doNotTouch,
    changedDoNotTouchFiles,
    missingVerification,
  };
}

function targetOwnedFiles(target: ReviewPrTarget): string[] {
  if (target.type === "opportunity") {
    return target.opportunity.ownedFiles.map((file) => file.path);
  }
  return target.candidate.files.map((file) => file.path);
}

function targetDoNotTouch(target: ReviewPrTarget): string[] {
  if (target.type === "opportunity") {
    return target.opportunity.doNotTouch;
  }
  return target.candidate.doNotTouch ?? [];
}

function targetVerification(target: ReviewPrTarget): string[] {
  if (target.type === "opportunity") {
    return target.opportunity.validationPlan;
  }
  return target.candidate.verification;
}

function candidatesRelatedToChangedFiles(
  candidates: CandidateRecord[],
  evidence: EvidenceRecord[],
  features: FeatureRecord[],
  changedFiles: string[],
): CandidateRecord[] {
  if (changedFiles.length === 0) {
    return [];
  }
  const evidenceById = new Map(evidence.map((record) => [record.id, record]));
  const featuresById = new Map(features.map((feature) => [feature.featureId, feature]));
  return candidates.filter((candidate) => {
    const candidatePaths = [
      ...candidate.files.map((file) => file.path),
      ...(candidate.ownedFiles ?? []).map((file) => file.path),
      ...(candidate.contextFiles ?? []).map((file) => file.path),
      ...candidate.evidenceIds.flatMap((id) => evidenceById.get(id)?.files.map((file) => file.path) ?? []),
      ...candidate.affectedFeatureIds.flatMap((id) => {
        const feature = featuresById.get(id);
        return feature ? [
          ...feature.entrypoints.map((file) => file.path),
          ...feature.ownedFiles.map((file) => file.path),
          ...feature.contextFiles.map((file) => file.path),
          ...feature.testFiles.map((file) => file.path),
        ] : [];
      }),
    ];
    return candidatePaths.some((file) => pathTouchesChangedFiles(file, changedFiles));
  });
}

function buildReviewNeighborhoods(options: {
  changedFiles: string[];
  candidates: CandidateRecord[];
  evidence: EvidenceRecord[];
  features: FeatureRecord[];
}): ReviewPrContext["architectureNeighborhoods"] {
  return options.changedFiles.map((changedPath) => {
    const candidates = options.candidates.filter((candidate) => candidateTouchesPath(candidate, changedPath));
    const evidence = options.evidence.filter((record) => record.files.some((file) => pathTouchesChangedFiles(file.path, [changedPath])));
    const features = options.features.filter((feature) => featureTouchesPath(feature, changedPath));
    return {
      path: changedPath,
      candidateIds: uniqueSorted(candidates.map((candidate) => candidate.id)),
      evidenceIds: uniqueSorted(evidence.map((record) => record.id)),
      featureIds: uniqueSorted(features.map((feature) => feature.featureId)),
      relatedFiles: uniqueSorted([
        ...candidates.flatMap((candidate) => candidate.files.map((file) => file.path)),
        ...evidence.flatMap((record) => record.files.map((file) => file.path)),
        ...features.flatMap((feature) => [
          ...feature.ownedFiles.map((file) => file.path),
          ...feature.contextFiles.map((file) => file.path),
          ...feature.testFiles.map((file) => file.path),
        ]),
      ]).filter((file) => file !== changedPath).slice(0, 20),
    };
  });
}

function summarizeReviewRisk(candidates: ReviewPrContext["relatedCandidates"]): ReviewPrContext["riskSummary"] {
  const byPriority: Record<string, number> = {};
  for (const candidate of candidates) {
    byPriority[candidate.priority] = (byPriority[candidate.priority] ?? 0) + 1;
  }
  const designNeeded = candidates.filter((candidate) => candidate.risk === "design-needed").length;
  const fixReady = candidates.filter((candidate) => candidate.readiness === "fix-ready").length;
  const reasons: string[] = [];
  let level: ReviewPrContext["riskSummary"]["level"] = "low";
  if ((byPriority["P0"] ?? 0) > 0) {
    level = "critical";
    reasons.push(`${byPriority["P0"]} P0 related finding${byPriority["P0"] === 1 ? "" : "s"}`);
  } else if ((byPriority["P1"] ?? 0) > 0 || designNeeded > 0) {
    level = "high";
    if ((byPriority["P1"] ?? 0) > 0) {
      reasons.push(`${byPriority["P1"]} P1 related finding${byPriority["P1"] === 1 ? "" : "s"}`);
    }
    if (designNeeded > 0) {
      reasons.push(`${designNeeded} design-needed finding${designNeeded === 1 ? "" : "s"}`);
    }
  } else if ((byPriority["P2"] ?? 0) > 0 || candidates.length > 3) {
    level = "medium";
    reasons.push(`${candidates.length} related finding${candidates.length === 1 ? "" : "s"}`);
  }
  if (reasons.length === 0) {
    reasons.push(candidates.length === 0 ? "No related Deepclean findings in PR scope." : "Only low-priority related findings in PR scope.");
  }
  return { level, reasons, byPriority, designNeeded, fixReady };
}

function renderReviewPromptContext(options: {
  base: string;
  head: string;
  changedFiles: string[];
  relatedCandidates: ReviewPrContext["relatedCandidates"];
  neighborhoods: ReviewPrContext["architectureNeighborhoods"];
  riskSummary: ReviewPrContext["riskSummary"];
  suggestedVerificationCommands: string[];
}): string {
  return [
    "# Deepclean PR Context",
    "",
    `Base: ${options.base}`,
    `Head: ${options.head}`,
    `Risk: ${options.riskSummary.level} (${options.riskSummary.reasons.join("; ")})`,
    "",
    "## Changed Files",
    ...listOrNone(options.changedFiles),
    "",
    "## Related Findings",
    ...listOrNone(options.relatedCandidates.map((candidate) => (
      `${candidate.priority} ${candidate.id}: ${candidate.title} [${candidate.category}, ${candidate.risk}]`
    ))),
    "",
    "## Architecture Neighborhoods",
    ...listOrNone(options.neighborhoods.map((neighborhood) => (
      `${neighborhood.path}: candidates=${neighborhood.candidateIds.join(",") || "none"} related=${neighborhood.relatedFiles.slice(0, 8).join(",") || "none"}`
    ))),
    "",
    "## Suggested Verification",
    ...listOrNone(options.suggestedVerificationCommands),
  ].join("\n");
}

function candidateTouchesPath(candidate: CandidateRecord, changedPath: string): boolean {
  return [
    ...candidate.files.map((file) => file.path),
    ...(candidate.ownedFiles ?? []).map((file) => file.path),
    ...(candidate.contextFiles ?? []).map((file) => file.path),
  ].some((file) => pathTouchesChangedFiles(file, [changedPath]));
}

function featureTouchesPath(feature: FeatureRecord, changedPath: string): boolean {
  return [
    ...feature.entrypoints.map((file) => file.path),
    ...feature.ownedFiles.map((file) => file.path),
    ...feature.contextFiles.map((file) => file.path),
    ...feature.testFiles.map((file) => file.path),
  ].some((file) => pathTouchesChangedFiles(file, [changedPath]));
}

function pathTouchesChangedFiles(filePath: string, changedFiles: string[]): boolean {
  return changedFiles.some((changed) => (
    filePath === changed
    || filePath.startsWith(`${changed}/`)
    || changed.startsWith(`${filePath}/`)
  ));
}

function listOrNone(values: string[]): string[] {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ["- none"];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
