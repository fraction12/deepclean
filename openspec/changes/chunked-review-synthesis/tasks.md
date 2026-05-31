## 1. Chunk Planning

- [x] 1.1 Add a synthesis chunk planner based on feature map, evidence files, and local metric candidates.
- [x] 1.2 Trigger chunking when the full bundle exceeds token-budget-derived size or broadness thresholds.

## 2. Provider Orchestration

- [x] 2.1 Run Codex synthesis once per scoped packet.
- [x] 2.2 Include scope metadata in each prompt.
- [x] 2.3 Aggregate chunk results into one repo-wide candidate queue.

## 3. Ledger And Explain

- [x] 3.1 Persist chunk metadata in the run-level synthesis attempt.
- [x] 3.2 Rewrite validation IDs and provenance so `deepclean explain` can resolve chunked candidates.

## 4. Verification

- [x] 4.1 Add regression coverage for multi-packet synthesis.
- [x] 4.2 Run `npm run typecheck`, `npm test`, `openspec validate chunked-review-synthesis`, and `npm run spec:validate`.
