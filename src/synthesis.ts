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
} from "./types.js";

const promptVersion = "codex-synthesis-v3-matt-pocock-reviewers";

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
    })),
    evidenceIds: z.array(z.string()).min(1),
    whyItMatters: z.string().min(1),
    likelyRootCause: z.string().min(1),
    suggestedDirection: z.string().min(1),
    verification: z.array(z.string()).min(1),
  })),
  rejectedEvidenceIds: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});

type SynthesisOutput = z.infer<typeof synthesisOutputSchema>;

export interface SynthesisResult {
  candidates: CandidateRecord[];
  diagnostics: Diagnostic[];
}

export async function synthesizeWithCodex(options: {
  root: string;
  runId: string;
  createdAt: string;
  evidence: EvidenceRecord[];
  config: DeepcleanConfig;
  existingCandidates: CandidateRecord[];
  includeSource: boolean;
  model?: string | undefined;
  verificationProfile?: VerificationProfile | undefined;
}): Promise<SynthesisResult> {
  const diagnostics: Diagnostic[] = [];
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "deepclean-codex-"));
  const outputPath = path.join(tempDir, "codex-output.json");
  const schemaPath = path.join(tempDir, "synthesis.schema.json");

  try {
    await writeFile(schemaPath, JSON.stringify(jsonSchema(), null, 2), "utf8");
    const reviewerPack = await resolveReviewerPack(options.root, options.config);
    diagnostics.push(...reviewerPack.diagnostics);
    const prompt = buildPrompt(options, reviewerPack.rubrics);
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

    const model = options.model ?? options.config.reviewSynthesis.model;
    if (model) {
      args.push("-m", model);
    }
    args.push("-");

    const result = await runProcess(
      options.config.reviewSynthesis.command,
      args,
      prompt,
      options.config.reviewSynthesis.timeoutMs,
    );

    if (result.exitCode !== 0) {
      return {
        candidates: [],
        diagnostics: [{
          level: "warning",
          code: result.timedOut ? "codex_synthesis_timeout" : "codex_synthesis_failed",
          message: codexFailureMessage(result),
          adapter: "codex-synthesis",
        }, ...diagnostics],
      };
    }

    const raw = await readFile(outputPath, "utf8");
    const parsed = parseSynthesisOutput(raw);
    const evidenceIds = new Set(options.evidence.map((item) => item.id));
    const maxCandidates = options.config.reviewSynthesis.maxCandidates;
    const candidates: CandidateRecord[] = [];

    for (const draft of parsed.candidates.slice(0, maxCandidates)) {
      const supportedIds = draft.evidenceIds.filter((id) => evidenceIds.has(id));
      if (supportedIds.length === 0) {
        diagnostics.push({
          level: "warning",
          code: "synthesis_candidate_without_evidence",
          message: `Rejected model candidate without valid evidence IDs: ${draft.title}`,
          adapter: "codex-synthesis",
        });
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
        evidenceIds: supportedIds,
        whyItMatters: draft.whyItMatters,
        likelyRootCause: draft.likelyRootCause,
        suggestedDirection: draft.suggestedDirection,
        verification: mergeVerificationCommands(verification, draft.verification),
        provenance: {
          source: "model-synthesis",
          provider: "codex",
          model,
          promptVersion,
          reviewers: reviewerPack.rubrics.map((rubric) => rubric.id),
        },
        createdAt: options.createdAt,
        updatedAt: options.createdAt,
      });
    }

    if (parsed.notes.length > 0) {
      diagnostics.push(...parsed.notes.map((note) => ({
        level: "info" as const,
        code: "codex_synthesis_note",
        message: note,
        adapter: "codex-synthesis",
      })));
    }

    return { candidates, diagnostics };
  } catch (error) {
    return {
      candidates: [],
      diagnostics: [{
        level: "warning",
        code: "codex_synthesis_error",
        message: error instanceof Error ? error.message : String(error),
        adapter: "codex-synthesis",
      }],
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildPrompt(options: {
  evidence: EvidenceRecord[];
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
  const existing = options.existingCandidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    category: candidate.category,
    priority: candidate.priority,
    confidence: candidate.confidence,
    evidenceIds: candidate.evidenceIds,
  }));

  return `You are Deepclean's maintainability synthesis reviewer.

Use only the evidence bundle below. Do not invent file paths, line numbers, commands, or evidence IDs.
Return only JSON matching the provided schema.

Goal:
- synthesize higher-quality maintainability cleanup candidates from local evidence
- prefer cross-evidence architectural/testability/duplication issues over one metric in isolation
- reject weak or noisy evidence rather than forcing findings
- produce agent-ready cleanup directions, not code patches

Cleanup-surface review flow:
- Treat local evidence as the source of truth.
- Review mapped cleanup surfaces the way a bug finder reviews semantic feature slices.
- Produce findings only when the surface shows a durable maintainability issue, not just an ugly file.
- Think like a senior maintainer preparing bounded work for a future coding agent.
- Prefer issues that explain how the codebase got sloppy and how to make it harder to re-slop.

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

Hard rules:
- every candidate MUST cite one or more provided evidenceIds
- every file reference MUST include path, startLine, and endLine; use startLine 1 and endLine 1 when exact line evidence is unavailable
- do not suggest modifying code as part of this response
- no security claims unless directly supported by evidence
- verification commands should be practical for a future agent, usually npm test and npm run typecheck
- every candidate should be traceable to one or more cleanup surfaces when possible
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
): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    let timedOut = false;
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
      resolve({ exitCode: 1, stdout, stderr: error.message, timedOut });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
    child.stdin.end(stdin);
  });
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

function codexFailureMessage(result: { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }): string {
  if (result.timedOut) {
    return "Codex synthesis timed out before returning schema-valid JSON.";
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
          },
        },
      },
      rejectedEvidenceIds: { type: "array", items: { type: "string" } },
      notes: { type: "array", items: { type: "string" } },
    },
  };
}
