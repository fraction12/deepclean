import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { candidateId } from "./ids.js";
import { buildCleanupSurfaces, reviewerRubrics } from "./reviewers.js";
import { commandsForFiles, mergeVerificationCommands, type VerificationProfile } from "./verification.js";
import {
  candidateCategories,
  confidenceLevels,
  effortLevels,
  impactLevels,
  priorities,
  riskLevels,
  schemaVersion,
  type CandidateRecord,
  type DeepcleanConfig,
  type Diagnostic,
  type EvidenceRecord,
  type FeatureRecord,
  type FileReference,
  type SynthesisAttemptRecord,
} from "./types.js";

const promptVersion = "codex-synthesis-v4-proof-backed-slices";

const synthesisOutputSchema = z.object({
  candidates: z.array(z.object({
    title: z.string().min(1),
    category: z.enum(candidateCategories),
    priority: z.enum(priorities),
    confidence: z.enum(confidenceLevels),
    impact: z.enum(impactLevels),
    effort: z.enum(effortLevels),
    risk: z.enum(riskLevels),
    files: z.array(z.object({
      path: z.string(),
      startLine: z.number().int().positive().optional(),
      endLine: z.number().int().positive().optional(),
    })).min(1),
    evidenceIds: z.array(z.string()).min(1),
    whyItMatters: z.string().min(1),
    likelyRootCause: z.string().min(1),
    suggestedDirection: z.string().min(1),
    verification: z.array(z.string()).min(1),
    fixReadiness: z.object({
      minimumFixScope: z.string().min(1),
      suggestedRegressionTest: z.string().min(1),
      whyCurrentTestsMissIt: z.string().min(1),
      confidenceDowngradeReasons: z.array(z.string()),
    }),
    supportingQuotes: z.array(z.object({
      path: z.string(),
      text: z.string().min(1),
    })).default([]),
  })),
  rejectedEvidenceIds: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

type SynthesisOutput = z.infer<typeof synthesisOutputSchema>;

export interface SynthesisResult {
  candidates: CandidateRecord[];
  diagnostics: Diagnostic[];
  attempt?: SynthesisAttemptRecord | undefined;
}

export async function synthesizeWithCodex(options: {
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
}): Promise<SynthesisResult> {
  const diagnostics: Diagnostic[] = [];
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "deepclean-codex-"));
  const outputPath = path.join(tempDir, "codex-output.json");
  const schemaPath = path.join(tempDir, "synthesis.schema.json");
  let attemptBase: ReturnType<typeof buildAttemptBase> | undefined;

  try {
    await writeFile(schemaPath, JSON.stringify(jsonSchema(), null, 2), "utf8");
    const reviewerPack = await resolveReviewerPack(options.root, options.config);
    diagnostics.push(...reviewerPack.diagnostics);
    const prompt = buildPrompt(options, reviewerPack.rubrics);
    attemptBase = buildAttemptBase({
      runId: options.runId,
      createdAt: options.createdAt,
      evidence: options.evidence,
      includeSource: options.includeSource,
      runtime: options.runtime,
      promptBytes: Buffer.byteLength(prompt, "utf8"),
      reviewerIds: reviewerPack.rubrics.map((rubric) => rubric.id),
    });
    const args = [
      "exec",
      "-C",
      options.root,
      "-s",
      "read-only",
      "--skip-git-repo-check",
      "--output-schema",
      schemaPath,
      "-o",
      outputPath,
    ];

    const model = options.runtime.model;
    if (model) {
      args.push("-m", model);
    }
    args.push("-");

    const result = await runProcessWithRetries(
      options.runtime.command,
      args,
      prompt,
      options.runtime.timeoutMs,
      options.runtime.retries,
    );

    if (result.exitCode !== 0) {
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

    const raw = await readFile(outputPath, "utf8");
    const parsed = parseSynthesisOutput(raw);
    const maxCandidates = options.config.reviewSynthesis.maxCandidates;
    const sourceText = await sourceTextForDrafts(options.root, parsed.candidates);
    const candidates: CandidateRecord[] = [];
    const validations: SynthesisAttemptRecord["validations"] = [];

    for (const draft of parsed.candidates.slice(0, maxCandidates)) {
      const validation = validateDraftCandidate({
        id: validationId(validations.length),
        draft,
        evidence: options.evidence,
        sourceText,
      });
      validations.push(validation);
      diagnostics.push(...validation.diagnostics);
      if (validation.status === "rejected") {
        continue;
      }

      const verification = commandsForFiles(options.verificationProfile ?? {
        defaultCommands: [],
        pythonCommands: [],
        frontendCommands: [],
        adminCommands: [],
      }, draft.files, draft.verification);

      candidates.push({
        schemaVersion,
        recordType: "candidate",
        id: candidateId(options.existingCandidates.length + candidates.length),
        runId: options.runId,
        title: draft.title,
        category: draft.category,
        status: "open",
        priority: draft.priority,
        confidence: draft.confidence,
        impact: draft.impact,
        effort: draft.effort,
        risk: draft.risk,
        files: draft.files,
        evidenceIds: validation.evidenceIds,
        affectedFeatureIds: [],
        featureScope: "unmapped",
        whyItMatters: draft.whyItMatters,
        likelyRootCause: draft.likelyRootCause,
        suggestedDirection: draft.suggestedDirection,
        verification: mergeVerificationCommands(verification, draft.verification),
        fixReadiness: draft.fixReadiness,
        provenance: {
          source: "model-synthesis",
          provider: "codex",
          model,
          promptVersion,
          synthesisAttemptId: attemptBase.id,
          validationId: validation.id,
          reviewers: reviewerPack.rubrics.map((rubric) => rubric.id),
          runtime: {
            effort: options.runtime.effort,
            timeoutMs: options.runtime.timeoutMs,
            retries: options.runtime.retries,
            rpm: options.runtime.rpm,
            concurrency: options.runtime.concurrency,
            tokenBudget: options.runtime.tokenBudget,
            excerptBudget: options.runtime.excerptBudget,
            privacyMode: options.runtime.privacyMode,
            allowSourceInModel: options.runtime.allowSourceInModel,
          },
        },
        createdAt: options.createdAt,
        updatedAt: options.createdAt,
      });
      validations[validations.length - 1] = {
        ...validation,
        candidateId: candidates.at(-1)?.id,
      };
    }

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

function buildPrompt(options: {
  evidence: EvidenceRecord[];
  features?: FeatureRecord[] | undefined;
  existingCandidates: CandidateRecord[];
  includeSource: boolean;
  verificationProfile?: VerificationProfile | undefined;
}, rubrics: typeof reviewerRubrics): string {
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
${JSON.stringify(rubrics, null, 2)}

Project verification commands:
${JSON.stringify(options.verificationProfile ?? {}, null, 2)}

Cleanup surfaces:
${JSON.stringify(cleanupSurfaces, null, 2)}

Feature map:
${JSON.stringify(featureBundle, null, 2)}

Hard rules:
- every candidate MUST cite one or more provided evidenceIds
- every file reference MUST include path, startLine, and endLine; use startLine 1 and endLine 1 when exact line evidence is unavailable
- use the feature map as the bounded review surface; do not invent feature ownership outside listed feature IDs, paths, imports, tests, commands, or reasons
- do not suggest modifying code as part of this response
- no security claims unless directly supported by evidence
- verification commands should be practical for a future agent, usually npm test and npm run typecheck
- every candidate should be traceable to one or more cleanup surfaces when possible
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

function buildAttemptBase(options: {
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
}): Omit<SynthesisAttemptRecord, "rawCandidateCount" | "acceptedCandidateCount" | "rejectedCandidateCount" | "rejectedEvidenceIds" | "notes" | "validations" | "diagnostics"> {
  return {
    schemaVersion,
    recordType: "synthesis_attempt",
    id: `synthesis-${options.runId.replace(/^run-/, "")}`,
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
    },
    reviewerIds: options.reviewerIds,
    evidenceManifest: {
      evidenceCount: options.evidence.length,
      includedEvidenceIds: options.evidence.map((record) => record.id),
      includedFileRefs: dedupeFileRefs(options.evidence.flatMap((record) => record.files)),
      omittedEvidenceIds: [],
      includeSource: options.includeSource,
      tokenBudget: options.runtime.tokenBudget,
      excerptBudget: options.runtime.excerptBudget,
    },
    createdAt: options.createdAt,
  };
}

function validateDraftCandidate(options: {
  id: string;
  draft: SynthesisOutput["candidates"][number];
  evidence: EvidenceRecord[];
  sourceText: Map<string, string>;
}): SynthesisAttemptRecord["validations"][number] {
  const diagnostics: Diagnostic[] = [];
  const evidenceById = new Map(options.evidence.map((record) => [record.id, record]));
  const supportedIds = [...new Set(options.draft.evidenceIds.filter((id) => evidenceById.has(id)))];
  if (supportedIds.length === 0) {
    diagnostics.push({
      level: "warning",
      code: "synthesis_candidate_without_evidence",
      message: `Rejected model candidate without valid evidence IDs: ${options.draft.title}`,
      adapter: "codex-synthesis",
    });
  }

  const citedFileRefs = supportedIds.flatMap((id) => evidenceById.get(id)?.files ?? []);
  const citedPaths = new Set(citedFileRefs.map((file) => file.path));
  if (options.draft.files.length === 0) {
    diagnostics.push({
      level: "warning",
      code: "synthesis_candidate_without_files",
      message: `Rejected model candidate without file anchors: ${options.draft.title}`,
      adapter: "codex-synthesis",
    });
  }

  for (const file of options.draft.files) {
    if (!citedPaths.has(file.path)) {
      diagnostics.push({
        level: "warning",
        code: "synthesis_file_not_in_cited_evidence",
        message: `Rejected model candidate ${options.draft.title}: ${file.path} is not anchored by the cited evidence IDs.`,
        adapter: "codex-synthesis",
      });
    }
    if (file.startLine !== undefined && file.endLine !== undefined && file.endLine < file.startLine) {
      diagnostics.push({
        level: "warning",
        code: "synthesis_invalid_line_range",
        message: `Rejected model candidate ${options.draft.title}: ${file.path}:${file.startLine}-${file.endLine} is invalid.`,
        adapter: "codex-synthesis",
      });
    }
    const source = options.sourceText.get(file.path);
    if (source && file.endLine !== undefined && file.endLine > lineCount(source)) {
      diagnostics.push({
        level: "warning",
        code: "synthesis_line_range_out_of_bounds",
        message: `Rejected model candidate ${options.draft.title}: ${file.path}:${file.endLine} exceeds file length.`,
        adapter: "codex-synthesis",
      });
    }
  }

  for (const quote of options.draft.supportingQuotes) {
    const source = options.sourceText.get(quote.path);
    if (!source || !source.includes(quote.text)) {
      diagnostics.push({
        level: "warning",
        code: "synthesis_quote_not_found",
        message: `Rejected model candidate ${options.draft.title}: quote did not match ${quote.path}.`,
        adapter: "codex-synthesis",
      });
    }
  }

  return {
    id: options.id,
    status: diagnostics.length === 0 ? "accepted" : "rejected",
    draftTitle: options.draft.title,
    evidenceIds: supportedIds,
    fileRefs: options.draft.files,
    diagnostics,
    fixReadiness: options.draft.fixReadiness,
  };
}

async function sourceTextForDrafts(root: string, drafts: SynthesisOutput["candidates"]): Promise<Map<string, string>> {
  const paths = [...new Set(drafts.flatMap((draft) => [
    ...draft.files.map((file) => file.path),
    ...draft.supportingQuotes.map((quote) => quote.path),
  ]))];
  const result = new Map<string, string>();
  for (const relativePath of paths) {
    try {
      result.set(relativePath, await readFile(path.resolve(root, relativePath), "utf8"));
    } catch {
      // Missing source is reported only when a draft relies on it for a line or quote check.
    }
  }
  return result;
}

function validationId(index: number): string {
  return `validation-${String(index + 1).padStart(3, "0")}`;
}

function dedupeFileRefs(files: FileReference[]): FileReference[] {
  const seen = new Set<string>();
  const result: FileReference[] = [];
  for (const file of files) {
    const key = `${file.path}:${file.startLine ?? ""}:${file.endLine ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(file);
  }
  return result;
}

function lineCount(source: string): number {
  if (source.length === 0) {
    return 0;
  }
  return source.split(/\r?\n/).length;
}

function parseSynthesisOutput(raw: string): SynthesisOutput {
  const trimmed = raw.trim();
  const direct = tryParseJson(trimmed);
  if (direct) {
    return synthesisOutputSchema.parse(direct);
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Codex did not return JSON");
  }
  return synthesisOutputSchema.parse(JSON.parse(match[0]));
}

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

async function runProcess(
  command: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; providerUnavailable: boolean }> {
  return new Promise((resolve) => {
    let timedOut = false;
    let providerUnavailable = false;
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      providerUnavailable = typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
      resolve({ exitCode: 1, stdout, stderr: error.message, timedOut, providerUnavailable });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode, stdout, stderr, timedOut, providerUnavailable });
    });
    child.stdin.end(stdin);
  });
}

async function runProcessWithRetries(
  command: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
  retries: number,
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; providerUnavailable: boolean; attempts: number }> {
  let last = await runProcess(command, args, stdin, timeoutMs);
  let attempts = 1;
  while (last.exitCode !== 0 && attempts <= retries && !last.providerUnavailable) {
    attempts += 1;
    last = await runProcess(command, args, stdin, timeoutMs);
  }
  return { ...last, attempts };
}

async function resolveReviewerPack(
  root: string,
  config: DeepcleanConfig,
): Promise<{ rubrics: typeof reviewerRubrics; diagnostics: Diagnostic[] }> {
  const diagnostics: Diagnostic[] = [];
  const enabled = new Set(config.reviewers.enabled);
  const builtIn = reviewerRubrics.filter((rubric) => enabled.size === 0 || enabled.has(rubric.id));

  for (const id of enabled) {
    if (!reviewerRubrics.some((rubric) => rubric.id === id)) {
      diagnostics.push({
        level: "warning",
        code: "reviewer_not_found",
        message: `Configured reviewer is not built in and was ignored: ${id}`,
        adapter: "codex-synthesis",
      });
    }
  }

  const custom = [];
  for (const reviewerPath of config.reviewers.customPaths) {
    const resolved = path.resolve(root, reviewerPath);
    try {
      const body = await readFile(resolved, "utf8");
      custom.push({
        id: `custom:${path.basename(reviewerPath).replace(/\.[^.]+$/, "")}`,
        title: `Custom reviewer: ${reviewerPath}`,
        purpose: body.slice(0, 4000),
        lookFor: ["Follow the custom reviewer instructions."],
        reject: ["Reject findings not supported by evidence IDs."],
        output: ["Return bounded, agent-ready cleanup candidates."],
      });
    } catch (error) {
      diagnostics.push({
        level: "warning",
        code: "custom_reviewer_unavailable",
        message: `Could not load custom reviewer ${reviewerPath}: ${error instanceof Error ? error.message : String(error)}`,
        adapter: "codex-synthesis",
      });
    }
  }

  return { rubrics: [...builtIn, ...custom], diagnostics };
}

function codexFailureMessage(result: { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; attempts?: number | undefined }): string {
  if (result.timedOut) {
    return `Codex synthesis timed out before returning schema-valid JSON after ${result.attempts ?? 1} attempt(s).`;
  }
  const text = result.stderr || result.stdout || `Codex exited with code ${result.exitCode}`;
  if (/not found|ENOENT/i.test(text)) {
    return `Codex command was unavailable: ${text}`;
  }
  if (/auth|login|unauthori[sz]ed|api key/i.test(text)) {
    return `Codex appears unauthenticated: ${text}`;
  }
  return text;
}

function jsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["candidates", "rejectedEvidenceIds", "notes"],
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "category",
            "priority",
            "confidence",
            "impact",
            "effort",
            "risk",
            "files",
            "evidenceIds",
            "whyItMatters",
            "likelyRootCause",
            "suggestedDirection",
            "verification",
            "fixReadiness",
            "supportingQuotes",
          ],
          properties: {
            title: { type: "string" },
            category: { enum: [...candidateCategories] },
            priority: { enum: [...priorities] },
            confidence: { enum: [...confidenceLevels] },
            impact: { enum: [...impactLevels] },
            effort: { enum: [...effortLevels] },
            risk: { enum: [...riskLevels] },
            files: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["path", "startLine", "endLine"],
                properties: {
                  path: { type: "string" },
                  startLine: { type: "integer", minimum: 1 },
                  endLine: { type: "integer", minimum: 1 },
                },
              },
            },
            evidenceIds: { type: "array", items: { type: "string" }, minItems: 1 },
            whyItMatters: { type: "string" },
            likelyRootCause: { type: "string" },
            suggestedDirection: { type: "string" },
            verification: { type: "array", items: { type: "string" }, minItems: 1 },
            fixReadiness: {
              type: "object",
              additionalProperties: false,
              required: [
                "minimumFixScope",
                "suggestedRegressionTest",
                "whyCurrentTestsMissIt",
                "confidenceDowngradeReasons",
              ],
              properties: {
                minimumFixScope: { type: "string" },
                suggestedRegressionTest: { type: "string" },
                whyCurrentTestsMissIt: { type: "string" },
                confidenceDowngradeReasons: { type: "array", items: { type: "string" } },
              },
            },
            supportingQuotes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["path", "text"],
                properties: {
                  path: { type: "string" },
                  text: { type: "string" },
                },
              },
            },
          },
        },
      },
      rejectedEvidenceIds: { type: "array", items: { type: "string" } },
      notes: { type: "array", items: { type: "string" } },
    },
  };
}
