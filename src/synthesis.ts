import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { uniqueFileReferences } from "./file-references.js";
import { candidateId } from "./ids.js";
import { commandsForFiles, mergeVerificationCommands, type VerificationProfile } from "./verification.js";
import { confidenceAfterValidation, sourceTextForDrafts, stableIdentity, uniqueStrings, validationId, validateDraftCandidate } from "./synthesis-candidate-validation.js";
import { buildAttemptBase, buildPrompt, promptVersion } from "./synthesis-prompt.js";
import { codexFailureMessage, runProcessWithRetries } from "./synthesis-process.js";
import { jsonSchema, parseSynthesisOutput, type SynthesisOutput } from "./synthesis-schema.js";
import { resolveReviewerPack, reviewerRubricVersions } from "./synthesis-reviewers.js";
import {
  schemaVersion,
  type CandidateRecord,
  type DeepcleanConfig,
  type Diagnostic,
  type EvidenceRecord,
  type FeatureRecord,
  type SynthesisAttemptRecord,
} from "./types.js";

export interface SynthesisResult {
  candidates: CandidateRecord[];
  diagnostics: Diagnostic[];
  attempt?: SynthesisAttemptRecord | undefined;
}

type SynthesizeWithCodexOptions = {
  root: string;
  runId: string;
  createdAt: string;
  evidence: EvidenceRecord[];
  features?: FeatureRecord[] | undefined;
  config: DeepcleanConfig;
  existingCandidates: CandidateRecord[];
  includeSource: boolean;
  runtime: {
    provider: "codex";
    command: string;
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
  verificationProfile?: VerificationProfile | undefined;
};

export async function synthesizeWithCodex(options: SynthesizeWithCodexOptions): Promise<SynthesisResult> {
  const diagnostics: Diagnostic[] = [];
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "deepclean-codex-"));
  let attemptBase: ReturnType<typeof buildAttemptBase> | undefined;

  try {
    const invocation = await prepareCodexSynthesisInvocation(options, tempDir, diagnostics);
    attemptBase = invocation.attemptBase;
    const { args, model, prompt, reviewerPack, workspace } = invocation;

    const result = await runProcessWithRetries(
      options.runtime.command,
      args,
      prompt,
      options.runtime.timeoutMs,
      options.runtime.retries,
    );

    if (result.exitCode !== 0) {
      return buildCodexFailureSynthesisResult(result, diagnostics, attemptBase);
    }

    const raw = await readFile(workspace.outputPath, "utf8");
    const parsed = parseSynthesisOutput(raw);
    const builtCandidates = await buildValidatedSynthesisCandidates({
      parsed,
      synthesisOptions: options,
      model,
      reviewerPack,
      attemptBase,
    });
    diagnostics.push(...builtCandidates.diagnostics);
    const { candidates, validations } = builtCandidates;

    if (parsed.notes.length > 0) {
      diagnostics.push(...parsed.notes.map((note) => ({
        level: "info" as const,
        code: "codex_synthesis_note",
        message: note,
        adapter: "codex-synthesis",
      })));
    }

    const attempt: SynthesisAttemptRecord = {
      ...attemptBase,
      rawCandidateCount: parsed.candidates.length,
      acceptedCandidateCount: candidates.length,
      rejectedCandidateCount: validations.filter((validation) => validation.status === "rejected").length,
      rejectedEvidenceIds: parsed.rejectedEvidenceIds,
      notes: parsed.notes,
      validations,
      diagnostics,
    };

    return { candidates, diagnostics, attempt };
  } catch (error) {
    const failureDiagnostics = [{
      level: "warning" as const,
      code: "codex_synthesis_error",
      message: error instanceof Error ? error.message : String(error),
      adapter: "codex-synthesis",
    }, ...diagnostics];
    return {
      candidates: [],
      diagnostics: failureDiagnostics,
      attempt: attemptBase
        ? {
          ...attemptBase,
          rawCandidateCount: 0,
          acceptedCandidateCount: 0,
          rejectedCandidateCount: 0,
          rejectedEvidenceIds: [],
          notes: [],
          validations: [],
          diagnostics: failureDiagnostics,
        }
        : undefined,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function buildValidatedSynthesisCandidates(options: {
  parsed: SynthesisOutput;
  synthesisOptions: SynthesizeWithCodexOptions;
  model: string | undefined;
  reviewerPack: Awaited<ReturnType<typeof resolveReviewerPack>>;
  attemptBase: ReturnType<typeof buildAttemptBase>;
}): Promise<{
  candidates: CandidateRecord[];
  validations: SynthesisAttemptRecord["validations"];
  diagnostics: Diagnostic[];
}> {
  const { parsed, synthesisOptions, model, reviewerPack, attemptBase } = options;
  const maxCandidates = synthesisOptions.config.reviewSynthesis.maxCandidates;
  const sourceText = await sourceTextForDrafts(synthesisOptions.root, parsed.candidates);
  const candidates: CandidateRecord[] = [];
  const validations: SynthesisAttemptRecord["validations"] = [];
  const diagnostics: Diagnostic[] = [];
  const seenStableIdentities = new Set(synthesisOptions.existingCandidates.map((candidate) => stableIdentity({
    title: candidate.title,
    category: candidate.category,
    files: candidate.files,
  })));

  for (const draft of parsed.candidates) {
    const validation = recordSynthesisDraftValidation({
      draft,
      evidence: synthesisOptions.evidence,
      sourceText,
      seenStableIdentities,
      validations,
      diagnostics,
    });
    if (validation.status === "rejected") {
      continue;
    }

    recordAcceptedSynthesisDraft({
      draft,
      validation,
      synthesisOptions,
      model,
      reviewerPack,
      attemptBase,
      candidates,
      validations,
    });
    if (candidates.length >= maxCandidates) {
      break;
    }
  }

  return { candidates, validations, diagnostics };
}

function recordAcceptedSynthesisDraft(options: {
  draft: SynthesisOutput["candidates"][number];
  validation: SynthesisAttemptRecord["validations"][number];
  synthesisOptions: SynthesizeWithCodexOptions;
  model: string | undefined;
  reviewerPack: Awaited<ReturnType<typeof resolveReviewerPack>>;
  attemptBase: ReturnType<typeof buildAttemptBase>;
  candidates: CandidateRecord[];
  validations: SynthesisAttemptRecord["validations"];
}): void {
  const candidate = buildAcceptedSynthesisCandidate({
    draft: options.draft,
    validation: options.validation,
    synthesisOptions: options.synthesisOptions,
    model: options.model,
    reviewerPack: options.reviewerPack,
    attemptBase: options.attemptBase,
    candidateOffset: options.candidates.length,
  });
  options.candidates.push(candidate);
  options.validations[options.validations.length - 1] = {
    ...options.validation,
    candidateId: candidate.id,
  };
}

function buildAcceptedSynthesisCandidate(options: {
  draft: SynthesisOutput["candidates"][number];
  validation: SynthesisAttemptRecord["validations"][number];
  synthesisOptions: SynthesizeWithCodexOptions;
  model: string | undefined;
  reviewerPack: Awaited<ReturnType<typeof resolveReviewerPack>>;
  attemptBase: ReturnType<typeof buildAttemptBase>;
  candidateOffset: number;
}): CandidateRecord {
  const { draft, validation, synthesisOptions, model, reviewerPack, attemptBase, candidateOffset } = options;
  const verification = commandsForFiles(synthesisOptions.verificationProfile ?? {
    defaultCommands: [],
    pythonCommands: [],
    frontendCommands: [],
    adminCommands: [],
  }, draft.files, draft.verification);
  const confidenceDowngradeReasons = uniqueStrings([
    ...draft.confidenceDowngradeReasons,
    ...draft.fixReadiness.confidenceDowngradeReasons,
    ...(validation.confidenceDowngradeReasons ?? []),
  ]);
  const readiness = validation.readiness ?? draft.readiness;

  return {
    schemaVersion,
    recordType: "candidate",
    id: candidateId(synthesisOptions.existingCandidates.length + candidateOffset),
    runId: synthesisOptions.runId,
    title: draft.title,
    category: draft.category,
    status: "open",
    priority: draft.priority,
    confidence: confidenceAfterValidation(draft.confidence, confidenceDowngradeReasons),
    impact: draft.impact,
    effort: draft.effort,
    risk: readiness === "design-needed" ? "design-needed" : draft.risk,
    readiness,
    files: draft.files,
    ownedFiles: uniqueFileReferences(draft.ownedFiles),
    contextFiles: uniqueFileReferences(draft.contextFiles),
    evidenceIds: validation.evidenceIds,
    affectedFeatureIds: [],
    featureScope: "unmapped",
    whyItMatters: draft.whyItMatters,
    likelyRootCause: draft.likelyRootCause,
    suggestedDirection: draft.suggestedDirection,
    expectedBehavior: draft.expectedBehavior,
    proofRequired: draft.proofRequired,
    nonGoals: draft.nonGoals,
    doNotTouch: draft.doNotTouch,
    splitChildren: draft.splitChildren.map((child) => ({
      ...child,
      ownedFiles: uniqueFileReferences(child.ownedFiles),
      contextFiles: uniqueFileReferences(child.contextFiles),
    })),
    confidenceDowngradeReasons,
    verification: mergeVerificationCommands(verification, draft.verification),
    fixReadiness: {
      ...draft.fixReadiness,
      confidenceDowngradeReasons,
    },
    provenance: {
      source: "model-synthesis",
      provider: "codex",
      model,
      promptVersion,
      synthesisAttemptId: attemptBase.id,
      validationId: validation.id,
      reviewers: reviewerPack.rubrics.map((rubric) => rubric.id),
      reviewerRubricVersions: reviewerRubricVersions(reviewerPack.rubrics),
      runtime: {
        effort: synthesisOptions.runtime.effort,
        timeoutMs: synthesisOptions.runtime.timeoutMs,
        retries: synthesisOptions.runtime.retries,
        rpm: synthesisOptions.runtime.rpm,
        concurrency: synthesisOptions.runtime.concurrency,
        tokenBudget: synthesisOptions.runtime.tokenBudget,
        excerptBudget: synthesisOptions.runtime.excerptBudget,
        privacyMode: synthesisOptions.runtime.privacyMode,
        allowSourceInModel: synthesisOptions.runtime.allowSourceInModel,
      },
    },
    createdAt: synthesisOptions.createdAt,
    updatedAt: synthesisOptions.createdAt,
  };
}

function recordSynthesisDraftValidation(options: {
  draft: SynthesisOutput["candidates"][number];
  evidence: EvidenceRecord[];
  sourceText: Map<string, string>;
  seenStableIdentities: Set<string>;
  validations: SynthesisAttemptRecord["validations"];
  diagnostics: Diagnostic[];
}): SynthesisAttemptRecord["validations"][number] {
  const validation = validateDraftCandidate({
    id: validationId(options.validations.length),
    draft: options.draft,
    evidence: options.evidence,
    sourceText: options.sourceText,
    seenStableIdentities: options.seenStableIdentities,
  });
  options.validations.push(validation);
  options.diagnostics.push(...validation.diagnostics);

  if (validation.status === "accepted") {
    options.seenStableIdentities.add(stableIdentity({
      title: options.draft.title,
      category: options.draft.category,
      files: options.draft.files,
    }));
  }

  return validation;
}

function buildCodexFailureSynthesisResult(
  result: Awaited<ReturnType<typeof runProcessWithRetries>>,
  diagnostics: Diagnostic[],
  attemptBase: ReturnType<typeof buildAttemptBase>,
): SynthesisResult {
  const failureDiagnostics = [{
    level: "warning" as const,
    code: result.timedOut
      ? "codex_synthesis_timeout"
      : result.providerUnavailable
        ? "codex_provider_unavailable"
        : "codex_synthesis_failed",
    message: codexFailureMessage(result),
    adapter: "codex-synthesis",
  }, ...diagnostics];

  return {
    candidates: [],
    diagnostics: failureDiagnostics,
    attempt: {
      ...attemptBase,
      rawCandidateCount: 0,
      acceptedCandidateCount: 0,
      rejectedCandidateCount: 0,
      rejectedEvidenceIds: [],
      notes: [],
      validations: [],
      diagnostics: failureDiagnostics,
    },
  };
}

async function prepareCodexSynthesisInvocation(
  options: SynthesizeWithCodexOptions,
  tempDir: string,
  diagnostics: Diagnostic[],
): Promise<{
  args: string[];
  attemptBase: ReturnType<typeof buildAttemptBase>;
  model: string | undefined;
  prompt: string;
  reviewerPack: Awaited<ReturnType<typeof resolveReviewerPack>>;
  workspace: Awaited<ReturnType<typeof prepareSynthesisWorkspace>>;
}> {
  const workspace = await prepareSynthesisWorkspace(tempDir);
  const reviewerPack = await resolveReviewerPack(options.root, options.config);
  diagnostics.push(...reviewerPack.diagnostics);
  const prompt = buildPrompt(options, reviewerPack.rubrics);
  const attemptBase = buildAttemptBase({
    runId: options.runId,
    createdAt: options.createdAt,
    evidence: options.evidence,
    includeSource: options.includeSource,
    runtime: options.runtime,
    promptBytes: Buffer.byteLength(prompt, "utf8"),
    reviewerIds: reviewerPack.rubrics.map((rubric) => rubric.id),
    reviewerRubricVersions: reviewerRubricVersions(reviewerPack.rubrics),
  });
  const args = [
    "exec",
    "-C",
    options.root,
    "-s",
    "read-only",
    "--skip-git-repo-check",
    "--output-schema",
    workspace.schemaPath,
    "-o",
    workspace.outputPath,
  ];

  const model = options.runtime.model;
  if (model) {
    args.push("-m", model);
  }
  args.push("-");

  return { args, attemptBase, model, prompt, reviewerPack, workspace };
}

async function prepareSynthesisWorkspace(tempDir: string): Promise<{ outputPath: string; schemaPath: string }> {
  const outputPath = path.join(tempDir, "codex-output.json");
  const schemaPath = path.join(tempDir, "synthesis.schema.json");
  await writeFile(schemaPath, JSON.stringify(jsonSchema(), null, 2), "utf8");
  return { outputPath, schemaPath };
}






