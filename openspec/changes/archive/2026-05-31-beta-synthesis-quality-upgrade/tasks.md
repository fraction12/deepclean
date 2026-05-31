## 1. Reviewer Pack

- [x] 1.1 Add reviewer rubric pressure for split vs fix vs design-needed.
- [x] 1.2 Add PR-sized actionability checks.
- [x] 1.3 Add proof-required, non-goals, and do-not-touch guidance.
- [x] 1.4 Version reviewer rubrics and record them in synthesis provenance.

## 2. Candidate Schema

- [x] 2.1 Extend synthesized candidates with readiness, owned files, context files, expected behavior, proof required, non-goals, and boundaries.
- [x] 2.2 Add child-slice fields for broad candidates that can be split.
- [x] 2.3 Add confidence downgrade reasons.

## 3. Validation

- [x] 3.1 Reject unsupported candidates without valid evidence IDs.
- [x] 3.2 Downgrade or mark design-needed for broad candidates without safe slices.
- [x] 3.3 Detect duplicate or superseded candidates using stable identity.
- [x] 3.4 Persist validation diagnostics in the synthesis attempt ledger.

## 4. Tests

- [x] 4.1 Add synthesis fixtures for fix-ready, split-needed, design-needed, duplicate, unsupported, and low-confidence output.
- [x] 4.2 Test report and handoff surfaces include the new readiness fields.
- [x] 4.3 Run `npm run typecheck`, `npm test`, `openspec validate beta-synthesis-quality-upgrade`, and `npm run spec:validate`.
