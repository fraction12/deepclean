## 1. Dogfood Matrix

- [x] 1.1 Define beta dogfood repositories and source-safe reporting rules.
- [x] 1.2 Add dogfood commands for doctor, status, scan, report, next, show, plan, handoff, revalidate, and prune dry-run.
- [x] 1.3 Add scorecard template with counts, timings, diagnostics, evidence quality, ranking quality, and risks.

## 2. Stability Fixtures

- [x] 2.1 Add fixture coverage for stale artifacts and old alpha state.
- [x] 2.2 Add malformed provider output and timeout recovery tests.
- [x] 2.3 Add generated-file and ignored-directory noise tests.
- [x] 2.4 Add duplicate ID and partial-write recovery tests.

## 3. Release Gate

- [x] 3.1 Add beta release checklist entries for dogfood matrix pass/fail.
- [x] 3.2 Block beta release when required dogfood scorecards are missing or failing.
- [x] 3.3 Document residual risks allowed for beta.

## 4. Verification

- [x] 4.1 Run local full verification on Deepclean.
- [x] 4.2 Run source-safe dogfood on the beta matrix.
- [x] 4.3 Run `npm run typecheck`, `npm test`, `openspec validate beta-dogfood-stability`, `npm run spec:validate`, and `npm run release:check`.
