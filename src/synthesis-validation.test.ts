import { describe, expect, test } from "vitest";
import type { Diagnostic } from "./json.js";
import { isRejectingDiagnostic } from "./synthesis-validation.js";

function diagnostic(code: string): Diagnostic {
  return {
    level: "warning",
    code,
    message: code,
    adapter: "codex-synthesis",
  };
}

describe("synthesis validation", () => {
  test("classifies candidate acceptance failures as rejecting diagnostics", () => {
    expect(isRejectingDiagnostic(diagnostic("synthesis_candidate_without_evidence"))).toBe(true);
    expect(isRejectingDiagnostic(diagnostic("synthesis_duplicate_candidate"))).toBe(true);
    expect(isRejectingDiagnostic(diagnostic("synthesis_candidate_without_files"))).toBe(true);
    expect(isRejectingDiagnostic(diagnostic("synthesis_file_not_in_cited_evidence"))).toBe(true);
    expect(isRejectingDiagnostic(diagnostic("synthesis_invalid_line_range"))).toBe(true);
    expect(isRejectingDiagnostic(diagnostic("synthesis_line_range_out_of_bounds"))).toBe(true);
    expect(isRejectingDiagnostic(diagnostic("synthesis_quote_not_found"))).toBe(true);
    expect(isRejectingDiagnostic(diagnostic("synthesis_candidate_without_proof"))).toBe(true);
  });

  test("keeps non-acceptance diagnostics as non-rejecting", () => {
    expect(isRejectingDiagnostic(diagnostic("synthesis_broad_candidate_needs_design"))).toBe(false);
  });
});
