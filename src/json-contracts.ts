import { schemaVersion } from "./defaults.js";

export interface StableJsonContract {
  command: string;
  status: "stable" | "guarded";
  since: string;
  description: string;
  envelope: {
    ok: true;
    command: string;
    dataSchema: string;
    diagnostics: "Diagnostic[]";
  };
  requiredFields: string[];
  notes: string[];
}

export function buildJsonContractCatalog(packageVersion: string): {
  schemaVersion: typeof schemaVersion;
  packageVersion: string;
  stability: "ga-candidate";
  contracts: StableJsonContract[];
} {
  return {
    schemaVersion,
    packageVersion,
    stability: "ga-candidate",
    contracts: [
      {
        command: "review-pr",
        status: "stable",
        since: "1.0.0-rc.1",
        description: "Source-safe PR architecture context for review agents. GitHub publishing remains owned by the caller.",
        envelope: {
          ok: true,
          command: "review-pr",
          dataSchema: "ReviewPrContext",
          diagnostics: "Diagnostic[]",
        },
        requiredFields: [
          "schemaVersion",
          "recordType",
          "id",
          "runId",
          "root",
          "stateDir",
          "base",
          "head",
          "changedFiles",
          "relatedCandidates",
          "architectureNeighborhoods",
          "riskSummary",
          "suggestedVerificationCommands",
          "promptContext",
          "createdAt",
        ],
        notes: [
          "The command runs without provider synthesis and is safe for OctoCheck scratch state.",
          "Consumers should treat promptContext as convenience text and data fields as canonical.",
        ],
      },
      {
        command: "fix --mode guarded",
        status: "guarded",
        since: "1.0.0-rc.1",
        description: "Conservative autofix lane for one fix-ready candidate with verification and optional PR proof.",
        envelope: {
          ok: true,
          command: "fix",
          dataSchema: "FixWorkflowResult.data",
          diagnostics: "Diagnostic[]",
        },
        requiredFields: [
          "attempt",
          "attemptPath",
          "attempts",
          "attemptPaths",
          "planPath",
          "changedFiles",
          "outOfScopeFiles",
          "allowedWriteScope",
          "externalSideEffects",
          "next",
        ],
        notes: [
          "Only guarded mode is supported for GA autofix.",
          "PR mode requires in-scope changes, passing verification, and resolved or measurable revalidation progress.",
          "Broad architecture redesign remains outside the GA autofix contract.",
        ],
      },
    ],
  };
}
