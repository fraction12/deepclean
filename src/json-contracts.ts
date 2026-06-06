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
        command: "next",
        status: "stable",
        since: "1.1.0",
        description: "Returns the best PR-sized cleanup opportunity and fixability routing while preserving legacy candidate fields.",
        envelope: {
          ok: true,
          command: "next",
          dataSchema: "{ opportunity, opportunities, opportunitiesPath, fixability, candidate, proofStatus }",
          diagnostics: "Diagnostic[]",
        },
        requiredFields: [
          "opportunity",
          "opportunities",
          "opportunitiesPath",
          "fixability",
          "candidate",
          "proofStatus",
        ],
        notes: [
          "candidate remains for backwards compatibility; opportunity is the campaign controller's preferred target.",
          "Opportunity records use recordType pr_opportunity.",
          "fixability.nextAutoFixableOpportunity is the only unattended guarded fix target; agent-fixable targets should become plan or handoff work.",
        ],
      },
      {
        command: "campaign",
        status: "stable",
        since: "1.1.0",
        description: "Summarizes the current cleanup campaign and opportunity classifications.",
        envelope: {
          ok: true,
          command: "campaign",
          dataSchema: "{ summary: CampaignSummaryRecord, opportunities: PrOpportunityRecord[] }",
          diagnostics: "Diagnostic[]",
        },
        requiredFields: [
          "summary",
          "opportunities",
          "recommendedOpportunity",
        ],
        notes: [
          "Campaign summaries use recordType campaign_summary.",
          "Classification counts are source-safe and suitable for dashboards or agent routing.",
        ],
      },
      {
        command: "ci --profile",
        status: "guarded",
        since: "1.1.0",
        description: "Evaluates a named or ad hoc quality profile and emits source-safe quality gate results.",
        envelope: {
          ok: true,
          command: "ci",
          dataSchema: "{ ciRun, qualityProfile, qualityGateResult, result, scan }",
          diagnostics: "Diagnostic[]",
        },
        requiredFields: [
          "ciRun",
          "qualityProfile",
          "qualityGateResult",
          "result",
          "scan",
        ],
        notes: [
          "Quality profiles use recordType quality_profile.",
          "Quality gate results use recordType quality_gate_result.",
          "ci --review-pr <path> can feed review-pr target verdicts into named profiles.",
        ],
      },
      {
        command: "setup analyzers",
        status: "guarded",
        since: "1.1.0",
        description: "Dry-run analyzer discovery and starter setup recommendations.",
        envelope: {
          ok: true,
          command: "setup",
          dataSchema: "{ plan: AnalyzerSetupPlanRecord, path }",
          diagnostics: "Diagnostic[]",
        },
        requiredFields: [
          "plan",
          "path",
        ],
        notes: [
          "Analyzer setup plans use recordType analyzer_setup_plan.",
          "The command is dry-run by default and does not mutate project files.",
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
          "Guarded fix/work refuses targets whose derived fixability is not auto-fixable.",
          "PR mode requires in-scope changes, passing verification, and resolved or measurable revalidation progress.",
          "Broad architecture redesign remains outside the GA autofix contract.",
        ],
      },
    ],
  };
}
