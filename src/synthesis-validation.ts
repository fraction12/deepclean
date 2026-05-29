import type { Diagnostic } from "./types.js";

const rejectingDiagnosticCodes = new Set([
  "synthesis_candidate_without_evidence",
  "synthesis_duplicate_candidate",
  "synthesis_candidate_without_files",
  "synthesis_file_not_in_cited_evidence",
  "synthesis_invalid_line_range",
  "synthesis_line_range_out_of_bounds",
  "synthesis_quote_not_found",
  "synthesis_candidate_without_proof",
]);

export function isRejectingDiagnostic(diagnostic: Diagnostic): boolean {
  return rejectingDiagnosticCodes.has(diagnostic.code);
}
