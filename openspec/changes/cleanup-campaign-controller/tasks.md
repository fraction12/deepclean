## 1. Spec And Schema

- [x] 1.1 Add OpenSpec coverage for cleanup campaign control, opportunity-aware CLI behavior, candidate classification, state persistence, reports/handoffs, review-pr target checks, and fix/work refusal.
- [x] 1.2 Add opportunity classification/status enums and `prOpportunityRecordSchema`.
- [x] 1.3 Add campaign summary schema.
- [x] 1.4 Add quality profile and quality gate result schemas.
- [x] 1.5 Add analyzer setup plan schema.
- [x] 1.6 Add schemas to the public `schemas --json` catalog once the command contracts stabilize.

## 2. State

- [x] 2.1 Add opportunity and campaign directories to state paths/init/doctor/prune/scrub handling.
- [x] 2.2 Add quality profile/result directories to state paths/init/doctor/prune/scrub handling.
- [x] 2.3 Add read/write helpers for latest opportunity records, campaign summaries, quality profiles, quality gate results, and analyzer setup plans.
- [x] 2.4 Validate opportunity, campaign, quality profile, quality gate, and analyzer setup records before write.

## 3. Opportunity Selection

- [x] 3.1 Add `src/opportunities.ts` to build PR opportunities from candidates, clusters, evidence, features, findings, lifecycle events, revalidations, and fix attempts.
- [x] 3.2 Score safe PR opportunities using ownership clarity, behavior risk, nearby tests, review surface, compatibility, CI/verification cost, and hotspot payoff.
- [x] 3.3 Classify non-PR targets as tests-first, spec-design-first, bad-target, duplicate, backlog-design-debt, do-not-automate, or stop-campaign.
- [x] 3.4 Generate stop lines, do-not-touch files, behavior invariants, validation plans, expected reviewer concerns, and expected payoff.

## 4. CLI And Reports

- [x] 4.1 Rework `deepclean next` to return the best PR opportunity while preserving candidate compatibility fields.
- [x] 4.2 Add read-only `deepclean campaign`.
- [x] 4.3 Rework `deepclean report` to show opportunity recommendations and classification counts before raw candidates.
- [x] 4.4 Allow `deepclean plan <opportunity-id>` and `deepclean handoff <opportunity-id>`.
- [x] 4.5 Update help text and human output to explain opportunities, classifications, metric-only reports, and stop-campaign results.
- [x] 4.6 Rework `deepclean ci` to evaluate quality profiles while preserving legacy threshold flags as ad hoc profiles.
- [x] 4.7 Emit quality gate JSON/Markdown/SARIF artifacts with blockers, advisories, regressions, improvements, baseline delta, profile, and analyzer provenance.
- [x] 4.8 Add dry-run-first `deepclean setup analyzers` to detect project tooling, existing analyzers, missing assurance, and recommended starter analyzer commands.

## 5. Review And Guarded Work

- [x] 5.1 Add `deepclean review-pr --target <id>` support.
- [x] 5.2 Emit review verdicts for target addressed, partially addressed, wrong target, too broad, and needs-human.
- [x] 5.3 Feed target verdicts, do-not-touch changes, and missing required verification into quality gate results.
- [x] 5.4 Make `deepclean fix` and `deepclean work` refuse targets that are not `safe-narrow-pr` opportunities unless explicitly operating in dry-run/inspection mode.

## 6. Tests And Verification

- [x] 6.1 Add unit tests for opportunity scoring and target classification.
- [x] 6.2 Add CLI tests for `next`, `campaign`, opportunity plan/handoff, and review-pr target verdicts.
- [x] 6.3 Add regressions for bad targets such as shared transport/auth/security/public API candidates.
- [x] 6.4 Add unit tests for built-in quality profiles, built-in evidence behavior when no analyzer output exists, baseline comparison, SARIF blocker mapping, advisory-vs-blocking behavior, missing-assurance diagnostics, and legacy CI flag compatibility.
- [x] 6.5 Add tests for analyzer setup discovery/recommendations in JavaScript/TypeScript repos with no scanners, partial scanners, and existing scripts.
- [x] 6.6 Run `npm run typecheck`, `npm test`, `openspec validate cleanup-campaign-controller`, `npm run spec:validate`, and `npm run release:check`.
