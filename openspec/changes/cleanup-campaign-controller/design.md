# Design

## Existing Pieces To Reuse

Deepclean already has most of the raw material:

- `src/candidates.ts` and `src/candidate-scoring.ts` rank local and synthesized candidates.
- `src/clusters.ts` groups related candidates and marks overly broad clusters.
- `src/features.ts` provides feature ownership, entrypoints, context/shared files, tests, and verification commands.
- `src/candidate-types.ts` already has `readiness`, `risk`, `fixReadiness`, `ownedFiles`, `contextFiles`, `proofRequired`, `nonGoals`, `doNotTouch`, and split child metadata.
- `src/finding-types.ts`, `src/identity.ts`, and lifecycle events provide stable finding identity and history.
- `src/plans.ts` already renders PR-sized constraints and stop-line style guidance, but only after a candidate/cluster is chosen.
- `src/revalidation.ts` and `src/fitness.ts` can detect whether a finding resolved, partially resolved, or improved a metric.
- `src/review-pr.ts` already builds a source-safe PR context for changed files.
- `src/fix-workflow-policy.ts` already refuses low-confidence, stale, ambiguous, or design-needed fix targets.
- `src/evidence-external.ts` already normalizes Semgrep/SARIF and jscpd output into evidence, but those findings are currently treated mostly as generic candidates.
- `ciCommand`, `ciRunRecordSchema`, and `renderCiSarif` already provide a CI lane, but it is a thin threshold gate over candidate counts rather than a quality profile system.

The change is to promote these scattered signals into one durable decision object: `pr_opportunity`.

The quality-gate change is similar: promote scattered CI, analyzer, and profile signals into durable `quality_profile` and `quality_gate_result` records rather than leaving them as command flags and generic diagnostic candidates.

Quality gates must not depend on users already having scanners wired in. Deepclean's built-in evidence remains the day-one quality signal. External analyzers are optional assurance inputs that make specific gates stronger and more defensible.

## PR Opportunity Record

Add a record schema in a new module such as `src/opportunity-types.ts`:

- `schemaVersion`
- `recordType: "pr_opportunity"`
- `id`
- `runId`
- `targetCandidateIds`
- `targetFindingIds`
- `targetClusterIds`
- `classification`
- `status`
- `title`
- `oneSentenceChange`
- `rationale`
- `score`
- `confidence`
- `risk`
- `ownedFiles`
- `contextFiles`
- `doNotTouch`
- `behaviorInvariants`
- `validationPlan`
- `testsRequiredFirst`
- `expectedReviewerConcern`
- `stopLine`
- `expectedPayoff`
- `refusalReason`
- `sourceSignals`
- `createdAt`
- `updatedAt`

Initial classifications:

- `safe-narrow-pr`
- `tests-first`
- `spec-design-first`
- `bad-target`
- `duplicate`
- `backlog-design-debt`
- `do-not-automate`
- `stop-campaign`

Initial statuses:

- `recommended`
- `available`
- `blocked`
- `rejected`
- `completed`
- `superseded`

## Code Quality Gate Records

Add schemas in a new module such as `src/quality-types.ts`.

### `quality_profile`

- `schemaVersion`
- `recordType: "quality_profile"`
- `id`
- `name`
- `mode: "advisory" | "blocking"`
- `scope: "repo" | "pr"`
- `extends`
- `gates`
- `analyzerInputs`
- `requiredAnalyzerClasses`
- `recommendedAnalyzerClasses`
- `baselineRef`
- `createdAt`
- `updatedAt`

Initial gate families:

- `maintainability`: priority/readiness/risk/category/new-regression thresholds over Deepclean candidates and findings.
- `security`: SARIF/Semgrep/CodeQL/npm-audit style findings by level, rule, confidence, and new-vs-existing status.
- `bug-risk`: static analyzer correctness findings, high-risk churn/test gaps, and PR review target verdicts.
- `dependency-risk`: dependency cycles, architecture policy violations, stale/vulnerable dependency evidence when supplied by external analyzers.
- `duplication`: local duplicate blocks, jscpd clusters, and conceptual duplication from synthesis.
- `test-proof`: nearby tests, changed test coverage/proof commands, required verification, and tests-first classifications.
- `policy`: configured architectural layers, sensitive-scope guardrails, source-safety/privacy policy, and do-not-automate classes.

Gate families can be evaluated from three evidence classes:

- `built-in`: Deepclean scan/review evidence that exists without external setup.
- `configured-analyzer`: evidence from tools the repository already runs.
- `recommended-analyzer`: optional scanner classes Deepclean recommends for better assurance but cannot assume are present.

Profiles must distinguish these classes so a missing optional analyzer does not look like a pass, and a missing required analyzer can fail only when the profile explicitly says that assurance is mandatory.

### `quality_gate_result`

- `schemaVersion`
- `recordType: "quality_gate_result"`
- `id`
- `runId`
- `profileId`
- `baselineRef`
- `headRef`
- `status: "passed" | "failed" | "advisory" | "error"`
- `blockers`
- `advisories`
- `regressions`
- `improvements`
- `analyzerProvenance`
- `coverageStatus`
- `artifactPaths`
- `diagnostics`
- `createdAt`

The gate result should cite evidence IDs, candidate IDs, finding IDs, and analyzer rule IDs instead of duplicating raw tool output.

## Selection Engine

Add `src/opportunities.ts` to build opportunities from the latest run:

```ts
buildPrOpportunities({
  runId,
  candidates,
  clusters,
  evidence,
  features,
  findings,
  lifecycleEvents,
  revalidations,
  fixAttempts,
}): PrOpportunityRecord[]
```

Selection should prefer targets with:

- one clear subsystem or feature,
- owned files distinct from context/shared files,
- nearby tests or clear verification,
- low behavior risk,
- small review surface,
- import/API compatibility path,
- one-sentence change description,
- meaningful hotspot or locality payoff,
- no product/security/auth/payment/public-API ambiguity,
- and no unresolved broadness that requires decomposition first.

Targets should be refused or classified away when:

- ownership boundary is unclear,
- many unrelated callers would be touched,
- tests are absent and behavior is inferred,
- the finding describes architecture direction rather than an implementation step,
- payoff is mostly aesthetic,
- product/security/auth/payment/public API decisions are involved,
- the work would create a huge low-confidence PR,
- or the candidate duplicates a better opportunity.

## Quality Gate Engine

Add `src/quality-gates.ts` to evaluate profile gates from a scan, baseline, optional PR target, and analyzer evidence:

```ts
evaluateQualityProfile({
  profile,
  scan,
  baselineScan,
  targetOpportunity,
  reviewPrContext,
}): QualityGateResult
```

Gate evaluation should:

- normalize Deepclean candidates, SARIF findings, jscpd/external duplicate evidence, dependency graph evidence, test discovery, lifecycle state, baseline status, revalidation, and PR target verdicts into one result;
- evaluate built-in Deepclean evidence even when no external analyzer evidence exists;
- distinguish hard blockers from advisory cleanup opportunities;
- treat new high-severity security/correctness findings as blockers when a blocking profile asks for it;
- treat existing debt as backlog unless the profile explicitly blocks existing issues;
- require a cited evidence source and analyzer provenance for every blocker;
- mark specialized assurance gaps, such as security scanning, vulnerability scanning, or coverage, as missing/partial/not-configured instead of treating them as passed;
- include analyzer setup recommendations when missing analyzer evidence would materially improve confidence;
- support baseline comparison so "no new P1 security/bug/test regressions" is possible without forcing legacy cleanup to zero;
- and preserve source safety by storing file locations, rule IDs, summaries, and evidence IDs rather than private source excerpts.

Initial built-in profiles:

- `advisory`: never fails; reports quality state for humans and agents.
- `balanced`: blocks new P0/P1 maintainability, high-confidence security/correctness SARIF findings, target PR scope violations, and missing required verification.
- `strict`: blocks more categories and existing severe unresolved findings.
- `maintainability-only`: approximates today's behavior for backward compatibility.

Existing candidate-count flags such as `--max-new-p1`, `--max-stale`, `--fail-category`, and `--min-confidence` should compile into an ad hoc profile so existing CI users are not broken.

## Analyzer Setup

Add `src/analyzer-setup.ts` to discover project tooling and produce optional setup recommendations:

```ts
buildAnalyzerSetupPlan({
  repoRoot,
  packageManifests,
  existingScripts,
  ciFiles,
  deepcleanConfig,
}): AnalyzerSetupPlan
```

The setup plan should detect:

- language/ecosystem signals;
- package manager and available script commands;
- existing test/typecheck/lint/coverage commands;
- existing CI workflow files;
- existing Semgrep, CodeQL, npm audit, jscpd, coverage, or SARIF producers;
- and missing analyzer classes that would strengthen the selected profile.

The default command should be dry-run:

```bash
deepclean setup analyzers --json
```

For JavaScript and TypeScript repositories, starter recommendations should prefer:

- existing `typecheck`, `test`, `lint`, and coverage commands when present;
- `npm audit` or the matching package-manager audit command for dependency risk;
- Semgrep as an optional security/correctness scanner;
- duplication detection only when it can be run source-safely and without noisy generated directories;
- and Deepclean's own scan/review signals as the always-on fallback.

Deepclean should not silently mutate CI or package files during analyzer setup. A write/apply mode can be added later, but this change only requires a source-safe setup plan and diagnostics that quality gates can cite.

## Relationship To Existing Commands

### `deepclean next`

Rework `nextCommand` in `src/cli.ts`:

- read candidates, clusters, features, findings, lifecycle events, revalidations, and fix attempts;
- build opportunities;
- persist the latest opportunity records;
- return the best `recommended` opportunity;
- include backward-compatible `candidate` and `proofStatus` fields when the opportunity maps to one primary candidate.

If no safe PR opportunity exists, return a structured stop result:

- `opportunity.classification = "stop-campaign"`
- rationale explains remaining buckets: tests-first, spec/design, backlog/design debt, bad target, duplicate, do-not-automate.

### `deepclean report`

Rework report recommendations in `src/reporting.ts`:

- show "Next PR Opportunity" before "Agent Queue";
- explain classification counts instead of just candidate counts;
- include raw candidates as appendix only;
- include warnings when the report is metric-only or synthesis failed.

### `deepclean plan` and `deepclean handoff`

Allow `plan` and `handoff` to accept an opportunity ID:

- target type expands to `candidate | cluster | opportunity`;
- opportunity plans include exact files to touch, do-not-touch files, behavior invariants, tests-first requirement, expected reviewer concern, validation plan, expected payoff, and stop line;
- opportunity handoffs are what agents should receive by default.

### `deepclean review-pr`

Add `--target <opportunity-or-candidate-or-finding-id>`.

When a target is supplied, the review context should include:

- whether changed files are within opportunity-owned scope,
- whether do-not-touch files were changed,
- whether required tests/verification were touched or run,
- related current findings after a follow-up scan when available,
- and a verdict: `addresses-target`, `partially-addresses-target`, `wrong-target`, `too-broad`, or `needs-human`.

This is review context, not GitHub publishing.

When `--target` is supplied, the target verdict should also feed quality gates:

- `wrong-target`, `too-broad`, changed do-not-touch files, or skipped required verification are PR quality blockers under `balanced` and `strict` profiles;
- `partially-addresses-target` is advisory unless the profile requires full target resolution;
- `addresses-target` can count as a campaign improvement only when verification and scope checks also pass.

### `deepclean ci`

Rework `ciCommand` in `src/cli.ts`:

- accept `--profile <advisory|balanced|strict|maintainability-only|path>`;
- keep legacy threshold flags and translate them into an ad hoc profile;
- run scan and optional baseline scan when `--baseline` or `--since` is provided;
- evaluate quality gates rather than only counting candidates;
- persist a `quality_gate_result` alongside the existing CI run record;
- emit Markdown/JSON/SARIF artifacts that identify blockers, advisories, regressions, improvements, profile, baseline, and analyzer provenance;
- include analyzer coverage/missing-assurance diagnostics and setup recommendations when useful;
- return `3` only for blocking profile failures, not for advisory results.

### `deepclean setup analyzers`

Add a dry-run-first helper command:

- detect project ecosystem, scripts, CI files, and existing analyzers;
- report which gate families are covered by built-in Deepclean evidence, existing analyzers, or missing optional analyzers;
- recommend starter commands and output paths for analyzers that would strengthen the selected or default profile;
- avoid changing package files, CI workflows, or config unless a future explicit write/apply flag is introduced.

### `deepclean campaign`

Add a read-only summary command:

- current run,
- opportunity counts by classification/status,
- recommended next opportunity or stop-campaign rationale,
- known fix attempts/PR URLs from Deepclean-owned guarded work,
- revalidation progress,
- hotspots improved,
- tests-first/spec-design/backlog debt remaining.

The command should not require GitHub access. If external PR information is unavailable, it reports only Deepclean-known artifacts.

## State Layout

Extend `src/state-paths.ts`, `src/state-read.ts`, and `src/state-write.ts`:

- `.deepclean/opportunities/opportunities-<runId>.json`
- `.deepclean/campaigns/campaign-<timestamp>.json`
- `.deepclean/quality/profiles/<profile-id>.json` for user-defined profiles when imported into state
- `.deepclean/quality/results/quality-<timestamp>.json`
- `.deepclean/quality/setup/analyzers-<timestamp>.json` for analyzer setup plan artifacts

Opportunity records should validate against schemas before write. Campaign summaries are derived artifacts, not source of truth.

Quality profiles, gate results, and analyzer setup plans should validate before write. Gate results and setup plans are derived artifacts; analyzer evidence, candidates, findings, lifecycle events, and PR review records remain the source of truth.

## Scoreboard

Reports and campaign summaries should reduce emphasis on raw candidate count and surface:

- safe PR opportunities available,
- opportunities completed or superseded,
- hotspot severity reduced,
- fan-in/fan-out or graph pressure reduced when evidence supports it,
- large-file/function responsibility split,
- tests added or required,
- ambiguous candidates classified,
- remaining design/spec/test-first debt,
- and stop-campaign rationale.

CI and PR review output should reduce emphasis on raw candidate count and surface:

- blocking quality regressions,
- advisory cleanup opportunities,
- new-vs-existing debt,
- analyzer provenance,
- target opportunity verdict,
- required verification status,
- SARIF rule IDs and source-safe file locations,
- and profile-specific pass/fail rationale.

## Rework, Not Rewrite

Do not replace evidence, candidates, clusters, findings, or plans. Rework them into layers:

1. Evidence says what is true.
2. Candidates say what smells.
3. Clusters say what is related.
4. Findings/lifecycle say what persisted over time.
5. PR opportunities say what is safe and worthwhile to do next.
6. Campaign summaries say whether to continue or stop.
7. Quality profiles say which quality signals are advisory or blocking.
8. Analyzer setup plans say how to strengthen missing assurance when users want more than built-in evidence.
9. Quality gate results say whether a repo or PR passes the selected profile and which assurance was actually present.
