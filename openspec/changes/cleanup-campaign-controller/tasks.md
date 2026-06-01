## 1. Spec And Schema

- [ ] 1.1 Add OpenSpec coverage for cleanup campaign control, opportunity-aware CLI behavior, candidate classification, state persistence, reports/handoffs, review-pr target checks, and fix/work refusal.
- [ ] 1.2 Add opportunity classification/status enums and `prOpportunityRecordSchema`.
- [ ] 1.3 Add campaign summary schema.
- [ ] 1.4 Add quality profile and quality gate result schemas.
- [ ] 1.5 Add analyzer setup plan schema.
- [ ] 1.6 Add schemas to the public `schemas --json` catalog once the command contracts stabilize.

## 2. State

- [ ] 2.1 Add opportunity and campaign directories to state paths/init/doctor/prune/scrub handling.
- [ ] 2.2 Add quality profile/result directories to state paths/init/doctor/prune/scrub handling.
- [ ] 2.3 Add read/write helpers for latest opportunity records, campaign summaries, quality profiles, quality gate results, and analyzer setup plans.
- [ ] 2.4 Validate opportunity, campaign, quality profile, quality gate, and analyzer setup records before write.

## 3. Opportunity Selection

- [ ] 3.1 Add `src/opportunities.ts` to build PR opportunities from candidates, clusters, evidence, features, findings, lifecycle events, revalidations, and fix attempts.
- [ ] 3.2 Score safe PR opportunities using ownership clarity, behavior risk, nearby tests, review surface, compatibility, CI/verification cost, and hotspot payoff.
- [ ] 3.3 Classify non-PR targets as tests-first, spec-design-first, bad-target, duplicate, backlog-design-debt, do-not-automate, or stop-campaign.
- [ ] 3.4 Generate stop lines, do-not-touch files, behavior invariants, validation plans, expected reviewer concerns, and expected payoff.

## 4. CLI And Reports

- [ ] 4.1 Rework `deepclean next` to return the best PR opportunity while preserving candidate compatibility fields.
- [ ] 4.2 Add read-only `deepclean campaign`.
- [ ] 4.3 Rework `deepclean report` to show opportunity recommendations and classification counts before raw candidates.
- [ ] 4.4 Allow `deepclean plan <opportunity-id>` and `deepclean handoff <opportunity-id>`.
- [ ] 4.5 Update help text and human output to explain opportunities, classifications, metric-only reports, and stop-campaign results.
- [ ] 4.6 Rework `deepclean ci` to evaluate quality profiles while preserving legacy threshold flags as ad hoc profiles.
- [ ] 4.7 Emit quality gate JSON/Markdown/SARIF artifacts with blockers, advisories, regressions, improvements, baseline delta, profile, and analyzer provenance.
- [ ] 4.8 Add dry-run-first `deepclean setup analyzers` to detect project tooling, existing analyzers, missing assurance, and recommended starter analyzer commands.

## 5. Review And Guarded Work

- [ ] 5.1 Add `deepclean review-pr --target <id>` support.
- [ ] 5.2 Emit review verdicts for target addressed, partially addressed, wrong target, too broad, and needs-human.
- [ ] 5.3 Feed target verdicts, do-not-touch changes, and missing required verification into quality gate results.
- [ ] 5.4 Make `deepclean fix` and `deepclean work` refuse targets that are not `safe-narrow-pr` opportunities unless explicitly operating in dry-run/inspection mode.

## 6. Tests And Verification

- [ ] 6.1 Add unit tests for opportunity scoring and target classification.
- [ ] 6.2 Add CLI tests for `next`, `campaign`, opportunity plan/handoff, and review-pr target verdicts.
- [ ] 6.3 Add regressions for bad targets such as shared transport/auth/security/public API candidates.
- [ ] 6.4 Add unit tests for built-in quality profiles, built-in evidence behavior when no analyzer output exists, baseline comparison, SARIF blocker mapping, advisory-vs-blocking behavior, missing-assurance diagnostics, and legacy CI flag compatibility.
- [ ] 6.5 Add tests for analyzer setup discovery/recommendations in JavaScript/TypeScript repos with no scanners, partial scanners, and existing scripts.
- [ ] 6.6 Run `npm run typecheck`, `npm test`, `openspec validate cleanup-campaign-controller`, `npm run spec:validate`, and `npm run release:check`.
