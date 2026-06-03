## 1. Spec

- [x] 1.1 Add OpenSpec coverage for slop taxonomy, fixability, reporting, synthesis, guarded fix, and CI actionability.

## 2. Contracts

- [x] 2.1 Add slop and fixability enums.
- [x] 2.2 Add compatibility-safe slop/fixability fields to candidate and opportunity records.
- [x] 2.3 Add actionability/fixability fields to quality gate findings.

## 3. Derivation

- [x] 3.1 Add a small slop classification helper.
- [x] 3.2 Add a small fixability derivation helper based on existing readiness/risk/verification/opportunity classification.

## 4. Output

- [x] 4.1 Surface fixability in opportunities.
- [x] 4.2 Add slop/fixability grouping to report records and Markdown.
- [x] 4.3 Surface actionability in CI/SARIF properties without changing existing gate behaviour.

## 5. Verification

- [x] 5.1 Add focused schema, opportunity, report, and CI tests.
- [x] 5.2 Run `openspec validate align-slop-cleanup-loop`, `npm run typecheck`, and focused tests.

## 6. Execution Routing

- [x] 6.1 Make `deepclean next --json` expose the next auto-fixable target and non-mutating follow-up lanes.
- [x] 6.2 Make guarded `fix`/`work` refuse non-auto-fixable candidate and opportunity targets before mutation.
- [x] 6.3 Add focused CLI tests proving fixability controls execution.

## 7. Report Brief

- [x] 7.1 Make Markdown reports lead with the slop cleanup brief instead of internal queues.
- [x] 7.2 Group top report targets by auto-fixable, agent-fixable, human-design-needed, review-only, and noise lanes.
- [x] 7.3 Move opportunity, theme, feature, and raw candidate detail behind appendices while keeping JSON complete.
