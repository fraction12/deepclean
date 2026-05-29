## 1. Spec

- [x] 1.1 Create OpenSpec proposal, design, tasks, and deltas.
- [x] 1.2 Validate the OpenSpec change.

## 2. Policy And Graph

- [x] 2.1 Add architecture policy config schema and defaults.
- [x] 2.2 Add graph layer matching, policy violation detection, and cycle detection.
- [x] 2.3 Include architecture fitness counts in graph summary evidence.

## 3. Evidence And Candidates

- [x] 3.1 Emit bounded dependency-cycle evidence.
- [x] 3.2 Emit bounded architecture-boundary-violation evidence.
- [x] 3.3 Generate local candidates for the new evidence kinds.

## 4. Progress

- [x] 4.1 Aggregate recent revalidation progress deltas.
- [x] 4.2 Render fitness movement in `deepclean status`.

## 5. Review And Release

- [x] 5.1 Add focused tests.
- [x] 5.2 Run typecheck, tests, OpenSpec validation, and repository spec validation.
- [x] 5.3 Open PR, run Clawpatch review, fix findings, and merge.
- [x] 5.4 Cut a new beta release after product PRs land.
