import { uniqueFileReferences } from "./file-references.js";
import { buildCleanupSurfaces } from "./reviewers.js";
import { reviewerRubricVersion, type ReviewerRubric } from "./synthesis-reviewers.js";
import type { VerificationProfile } from "./verification.js";
import { schemaVersion, type CandidateRecord, type EvidenceRecord, type FeatureRecord, type SynthesisAttemptRecord } from "./types.js";

export const promptVersion = "codex-synthesis-v5-readiness-boundaries";

export function buildPrompt(options: {
  evidence: EvidenceRecord[];
  features?: FeatureRecord[] | undefined;
  existingCandidates: CandidateRecord[];
  includeSource: boolean;
  verificationProfile?: VerificationProfile | undefined;
  synthesisScope?: {
    id: string;
    title: string;
    reason: string;
    fileRefs: Array<{ path: string; startLine?: number | undefined; endLine?: number | undefined }>;
  } | undefined;
}, rubrics: ReviewerRubric[]): string {
  const cleanupSurfaces = buildCleanupSurfaces(options.evidence, options.existingCandidates);
  const evidenceBundle = options.evidence.map((record) => ({
    id: record.id,
    adapter: record.adapter,
    kind: record.kind,
    title: record.title,
    summary: record.summary,
    files: record.files,
    confidence: record.confidence,
    data: redactedData(record.data, options.includeSource),
  }));
  const featureBundle = (options.features ?? []).map((feature) => ({
    featureId: feature.featureId,
    title: feature.title,
    kind: feature.kind,
    confidence: feature.confidence,
    entrypoints: feature.entrypoints,
    ownedFiles: feature.ownedFiles,
    contextFiles: feature.contextFiles,
    testFiles: feature.testFiles,
    fileRoles: feature.fileRoles,
    reasons: feature.reasons,
    verification: feature.verification,
  }));
  const existing = options.existingCandidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    category: candidate.category,
    priority: candidate.priority,
    confidence: candidate.confidence,
    evidenceIds: candidate.evidenceIds,
    affectedFeatureIds: candidate.affectedFeatureIds,
    featureScope: candidate.featureScope,
  }));

  return `You are Deepclean's maintainability synthesis reviewer.

Use only the evidence bundle below. Do not invent file paths, line numbers, commands, or evidence IDs.
Return only JSON matching the provided schema.

Goal:
- synthesize higher-quality maintainability cleanup candidates from local evidence
- prefer cross-evidence architectural/testability/duplication issues over one metric in isolation
- reject weak or noisy evidence rather than forcing findings
- produce proof-backed, PR-sized cleanup slices, not code patches or broad themes

Cleanup-surface review flow:
- Treat local evidence as the source of truth.
- Review mapped cleanup surfaces the way a bug finder reviews semantic feature slices.
- Produce findings only when the surface shows a durable maintainability issue, not just an ugly file.
- Think like a senior maintainer preparing bounded work for a future coding agent.
- Prefer issues that explain how the codebase got sloppy and how to make it harder to re-slop.
- Rank by sturdiness gained: state consistency, contract safety, data/service boundaries, auth/data-loading reliability, test fixture leverage, and behavior pinned by tests beat generic cleanliness.
- A "large function" or "large file" is not enough. Only promote it when the evidence also supports change pressure, bug/test proximity, feature blockage, a natural extraction boundary, or a safe one-PR slice.
- Big themes belong in notes unless you can express the next safe slice with touched files, tests first, stop line, minimal fix, and non-goals.

Matt Pocock skills influence:
- The built-in reviewer pack includes distilled guidance from the MIT-licensed Matt Pocock skills snapshot vendored in this repo for reference.
- Apply those principles as engineering discipline, not as a reason to create unsupported findings.
- Favor deep modules with small interfaces, behavior-level feedback loops, domain vocabulary, and independently grabbable agent slices.

Reviewer pack:
${JSON.stringify(rubrics.map((rubric) => ({
  ...rubric,
  version: rubric.version ?? reviewerRubricVersion,
})), null, 2)}

Project verification commands:
${JSON.stringify(options.verificationProfile ?? {}, null, 2)}

Synthesis scope:
${JSON.stringify(options.synthesisScope ?? {
  id: "whole-repo",
  title: "Whole repository",
  reason: "Single synthesis packet for all current scan evidence.",
  fileRefs: [],
}, null, 2)}

Cleanup surfaces:
${JSON.stringify(cleanupSurfaces, null, 2)}

Feature map:
${JSON.stringify(featureBundle, null, 2)}

Hard rules:
- every candidate MUST cite one or more provided evidenceIds
- stay inside the synthesis scope unless cited evidence explicitly requires a context file
- every file reference MUST include path, startLine, and endLine; use startLine 1 and endLine 1 when exact line evidence is unavailable
- use the feature map as the bounded review surface; do not invent feature ownership outside listed feature IDs, paths, imports, tests, commands, or reasons
- do not suggest modifying code as part of this response
- no security claims unless directly supported by evidence
- verification commands should be practical for a future agent, usually npm test and npm run typecheck
- every candidate should be traceable to one or more cleanup surfaces when possible
- classify readiness as fix-ready, split-needed, design-needed, needs-human, or defer
- use fix-ready only for one-PR work with owned files, context files, expected behavior, proof required, non-goals, and do-not-touch boundaries
- use split-needed when the concern is real and broad but has safe child slices; include splitChildren with bounded owned files and proof for each child
- use design-needed when safe child slices are missing, product/domain decisions are unresolved, or proof cannot be made local and deterministic
- use needs-human for candidates blocked on owner judgment; use defer for valid but low-value or low-confidence cleanup
- include confidenceDowngradeReasons whenever evidence is thin, local verification is unclear, or the candidate is broader than a small patch
- include fixReadiness for each candidate: minimum fix scope, suggested regression test, why current tests may miss it, and confidence downgrade reasons
- fixReadiness.minimumFixScope must read like a small work order, not a theme: name the boundary to extract/rename/consolidate, the likely files, and the stop line
- suggestedDirection must include non-goals when broad nearby cleanup is tempting
- supportingQuotes are optional; if used, quote text must appear verbatim in the referenced source file
- do not create a candidate that the critic-pass reviewer would reject
- use notes for promising but under-supported themes instead of forcing weak candidates

Existing local candidates:
${JSON.stringify(existing, null, 2)}

Evidence bundle:
${JSON.stringify(evidenceBundle, null, 2)}
`;
}

function redactedData(data: Record<string, unknown>, includeSource: boolean): Record<string, unknown> {
  if (includeSource) {
    return data;
  }
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key.toLowerCase().includes("sample") || key.toLowerCase().includes("source")) {
      continue;
    }
    copy[key] = value;
  }
  return copy;
}

export function buildAttemptBase(options: {
  runId: string;
  createdAt: string;
  evidence: EvidenceRecord[];
  includeSource: boolean;
  runtime: {
    provider: "codex";
    model?: string | undefined;
    effort?: string | undefined;
    timeoutMs: number;
    retries: number;
    rpm: number;
    concurrency: number;
    tokenBudget: number;
    excerptBudget: number;
    privacyMode: "local-only" | "metadata" | "source-ok";
    allowSourceInModel: boolean;
  };
  promptBytes: number;
  reviewerIds: string[];
  reviewerRubricVersions?: Record<string, string> | undefined;
  synthesisScope?: {
    id: string;
    title: string;
    reason: string;
    fileRefs: Array<{ path: string; startLine?: number | undefined; endLine?: number | undefined }>;
  } | undefined;
  attemptIdSuffix?: string | undefined;
}): Omit<SynthesisAttemptRecord, "rawCandidateCount" | "acceptedCandidateCount" | "rejectedCandidateCount" | "rejectedEvidenceIds" | "notes" | "validations" | "diagnostics"> {
  const baseId = `synthesis-${options.runId.replace(/^run-/, "")}`;
  return {
    schemaVersion,
    recordType: "synthesis_attempt",
    id: options.attemptIdSuffix ? `${baseId}-${options.attemptIdSuffix}` : baseId,
    runId: options.runId,
    provider: options.runtime.provider,
    model: options.runtime.model,
    promptVersion,
    promptBytes: options.promptBytes,
    runtime: {
      model: options.runtime.model,
      effort: options.runtime.effort,
      timeoutMs: options.runtime.timeoutMs,
      retries: options.runtime.retries,
      rpm: options.runtime.rpm,
      concurrency: options.runtime.concurrency,
      tokenBudget: options.runtime.tokenBudget,
      excerptBudget: options.runtime.excerptBudget,
      privacyMode: options.runtime.privacyMode,
      allowSourceInModel: options.runtime.allowSourceInModel,
      synthesisScope: options.synthesisScope,
    },
    reviewerIds: options.reviewerIds,
    reviewerRubricVersions: options.reviewerRubricVersions,
    evidenceManifest: {
      evidenceCount: options.evidence.length,
      includedEvidenceIds: options.evidence.map((record) => record.id),
      includedFileRefs: uniqueFileReferences(options.evidence.flatMap((record) => record.files)),
      omittedEvidenceIds: [],
      includeSource: options.includeSource,
      tokenBudget: options.runtime.tokenBudget,
      excerptBudget: options.runtime.excerptBudget,
    },
    createdAt: options.createdAt,
  };
}
