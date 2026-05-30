import { readFile } from "node:fs/promises";
import path from "node:path";
import { uniqueFileReferences } from "./file-references.js";
import { isRejectingDiagnostic } from "./synthesis-validation.js";
import type { SynthesisOutput } from "./synthesis-schema.js";
import type { Diagnostic, EvidenceRecord, FileReference, SynthesisAttemptRecord } from "./types.js";

function validateDraftCandidateAnchors(options: {
  draft: SynthesisOutput["candidates"][number];
  evidence: EvidenceRecord[];
  seenStableIdentities: Set<string>;
}): {
  supportedIds: string[];
  citedPaths: Set<string>;
  diagnostics: Diagnostic[];
} {
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

  if (options.seenStableIdentities.has(stableIdentity({
    title: options.draft.title,
    category: options.draft.category,
    files: options.draft.files,
  }))) {
    diagnostics.push({
      level: "warning",
      code: "synthesis_duplicate_candidate",
      message: `Rejected duplicate or superseded model candidate: ${options.draft.title}`,
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

  return { supportedIds, citedPaths, diagnostics };
}

export function validateDraftCandidate(options: {
  id: string;
  draft: SynthesisOutput["candidates"][number];
  evidence: EvidenceRecord[];
  sourceText: Map<string, string>;
  seenStableIdentities: Set<string>;
}): SynthesisAttemptRecord["validations"][number] {
  const anchorValidation = validateDraftCandidateAnchors({
    draft: options.draft,
    evidence: options.evidence,
    seenStableIdentities: options.seenStableIdentities,
  });
  const diagnostics: Diagnostic[] = [...anchorValidation.diagnostics];
  const supportedIds = anchorValidation.supportedIds;
  const citedPaths = anchorValidation.citedPaths;
  const confidenceDowngradeReasons: string[] = [];
  let readiness = options.draft.readiness;

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

  if (isBroadDraft(options.draft) && options.draft.splitChildren.length === 0) {
    readiness = "design-needed";
    confidenceDowngradeReasons.push("Candidate is too broad for a safe one-PR handoff and did not include bounded child slices.");
    diagnostics.push({
      level: "warning",
      code: "synthesis_broad_candidate_needs_design",
      message: `Downgraded broad model candidate to design-needed because it lacks safe split children: ${options.draft.title}`,
      adapter: "codex-synthesis",
    });
  }

  if (options.draft.readiness === "split-needed" && options.draft.splitChildren.length === 0) {
    readiness = "design-needed";
    confidenceDowngradeReasons.push("Candidate requested splitting but did not provide bounded child recommendations.");
    diagnostics.push({
      level: "warning",
      code: "synthesis_split_candidate_without_children",
      message: `Marked split-needed candidate design-needed because no child slices were provided: ${options.draft.title}`,
      adapter: "codex-synthesis",
    });
  }

  if (readiness === "fix-ready" && options.draft.proofRequired.length === 0) {
    diagnostics.push({
      level: "warning",
      code: "synthesis_candidate_without_proof",
      message: `Rejected fix-ready model candidate without proof requirements: ${options.draft.title}`,
      adapter: "codex-synthesis",
    });
  }

  return {
    id: options.id,
    status: diagnostics.some(isRejectingDiagnostic) ? "rejected" : "accepted",
    draftTitle: options.draft.title,
    evidenceIds: supportedIds,
    fileRefs: options.draft.files,
    diagnostics,
    readiness,
    confidenceDowngradeReasons: uniqueStrings(confidenceDowngradeReasons),
    fixReadiness: options.draft.fixReadiness,
  };
}

function isBroadDraft(draft: SynthesisOutput["candidates"][number]): boolean {
  const fileAreas = new Set(draft.files.map((file) => {
    const parts = file.path.split("/");
    return parts.length <= 1 ? file.path : parts.slice(0, 2).join("/");
  }));

  return draft.readiness === "split-needed"
    || draft.impact === "cross-cutting"
    || draft.effort === "large"
    || fileAreas.size > 2
    || draft.files.length > 4;
}

export function confidenceAfterValidation(
  confidence: SynthesisOutput["candidates"][number]["confidence"],
  downgradeReasons: string[],
): SynthesisOutput["candidates"][number]["confidence"] {
  if (downgradeReasons.length === 0) {
    return confidence;
  }
  if (confidence === "high") {
    return "medium";
  }
  return confidence === "medium" ? "low" : "low";
}

export function stableIdentity(values: { title: string; category: string; files: FileReference[] }): string {
  const normalizedTitle = values.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const paths = uniqueStrings(values.files.map((file) => file.path)).sort().slice(0, 6).join(",");
  return `${values.category}:${normalizedTitle}:${paths}`;
}


export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

export async function sourceTextForDrafts(root: string, drafts: SynthesisOutput["candidates"]): Promise<Map<string, string>> {
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

export function validationId(index: number): string {
  return `validation-${String(index + 1).padStart(3, "0")}`;
}

function lineCount(source: string): number {
  if (source.length === 0) {
    return 0;
  }
  return source.split(/\r?\n/).length;
}

