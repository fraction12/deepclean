## 1. Status Contract

- [x] 1.1 Define `status --json` schema with latest run, latest report, queue counts, active items, blocked items, stale artifacts, recent progress, and next action.
- [x] 1.2 Define compact human output with the same sections.
- [x] 1.3 Add diagnostic codes for no state, stale state, invalid state, stale lock, and missing latest artifacts.

## 2. Progress Derivation

- [x] 2.1 Derive progress events from run, report, lifecycle, split, plan, handoff, revalidation, and fix-attempt records.
- [x] 2.2 Add artifact freshness checks for plans, handoffs, reports, and fix attempts.
- [x] 2.3 Keep stale, suppressed, fixed, superseded, and blocked items out of the default next-action queue.

## 3. CLI And Docs

- [x] 3.1 Update `deepclean status` help and examples.
- [x] 3.2 Add troubleshooting docs for status diagnostics.
- [x] 3.3 Add agent-oriented docs for using status before choosing work.

## 4. Tests

- [x] 4.1 Test status for empty state and initialized state.
- [x] 4.2 Test status with open, stale, blocked, superseded, and resolved findings.
- [x] 4.3 Test status with stale plans and handoffs.
- [x] 4.4 Run `npm run typecheck`, `npm test`, `openspec validate beta-status-progress-surface`, and `npm run spec:validate`.
