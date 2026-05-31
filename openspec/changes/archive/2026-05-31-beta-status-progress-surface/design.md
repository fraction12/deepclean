## Design

`deepclean status` should be read-only and derived. It should not create a separate source of truth that can drift from lifecycle records.

### Sections

Human output should be compact:

- Latest run and report.
- Queue counts by lifecycle state.
- Active candidates ready for work.
- Blocked candidates and blocker reason.
- Recent progress events.
- Stale artifacts and revalidation needs.
- Suggested next command.

JSON output should include stable IDs and artifact paths.

### Progress Event Sources

Progress events are derived from:

- run records;
- report records;
- split/decomposition records;
- plan records;
- handoff records;
- lifecycle events;
- revalidation records;
- fix attempt and verification records when available.

### Freshness

Status should warn when a plan, handoff, or report was generated from stale evidence or from a candidate whose lifecycle state no longer permits work.

### Verification

Tests should cover fresh state, no state, stale lock/state, candidate split, attempted fix, failed verification, and resolved finding examples.
