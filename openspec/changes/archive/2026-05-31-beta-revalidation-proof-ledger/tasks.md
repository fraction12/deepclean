## 1. Revalidation Command

- [x] 1.1 Add `deepclean revalidate <id|theme|all> --json`.
- [x] 1.2 Resolve stable finding IDs, current candidate IDs, old candidate IDs, and bounded theme slices.
- [x] 1.3 Refuse or mark needs-human for broad targets that cannot be checked safely.

## 2. Evidence And Decision

- [x] 2.1 Recollect minimum evidence for primary anchors, related graph neighborhood, and cited analyzer facts.
- [x] 2.2 Classify outcomes as resolved, partially-resolved, still-open, superseded, stale, inconclusive, or needs-human.
- [x] 2.3 Require evidence references and rationale for every non-stale outcome.
- [x] 2.4 Link verification runs to revalidation records when present.

## 3. State And Surfaces

- [x] 3.1 Add revalidation proof ledger schema.
- [x] 3.2 Append lifecycle events for revalidation outcomes.
- [x] 3.3 Surface proof status in `show`, `status`, `report`, `next`, and `handoff`.
- [x] 3.4 Ensure stale or inconclusive findings are not treated as resolved.

## 4. Tests

- [x] 4.1 Add fixtures for resolved, partial, still-open, superseded, stale, inconclusive, and needs-human outcomes.
- [x] 4.2 Test passed verification without revalidation does not mark resolved.
- [x] 4.3 Test superseded finding links to replacement.
- [x] 4.4 Run `npm run typecheck`, `npm test`, `openspec validate beta-revalidation-proof-ledger`, and `npm run spec:validate`.
