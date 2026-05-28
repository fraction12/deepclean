## 1. Spec And Schema

- [ ] 1.1 Add decomposition metadata to candidate and finding schemas.
- [ ] 1.2 Add OpenSpec coverage for parent/child candidate decomposition.

## 2. Split Command

- [ ] 2.1 Add `deepclean split <candidate-or-finding-id>`.
- [ ] 2.2 Generate deterministic child candidates for large functions, large files, dependency hotspots, and shallow-wrapper clusters.
- [ ] 2.3 Persist child candidates, updated parent status, findings, observations, and lifecycle events.

## 3. Fix Routing

- [ ] 3.1 Make fix/work refuse broad splittable parent candidates with a split-first instruction.
- [ ] 3.2 Treat generated child candidates as approved fix slices.

## 4. Tests And Verification

- [ ] 4.1 Add CLI tests for split output and persisted parent/child state.
- [ ] 4.2 Add a regression that work refuses a broad parent and points to split.
- [ ] 4.3 Run `npm run typecheck`, `npm test`, `openspec validate split-broad-candidates`, `npm run spec:validate`, and `npm run release:check`.
