## ADDED Requirements

### Requirement: Latest artifact indexes
The system SHALL maintain indexes needed to resolve latest run, report, plan, handoff, split, revalidation, and fix-attempt artifacts.

#### Scenario: Status is generated
- **WHEN** `deepclean status --json` runs
- **THEN** Deepclean can identify the latest relevant artifacts without scanning unrelated historical files by hand

### Requirement: Progress event derivation
The system SHALL derive progress events from durable records rather than storing a competing progress ledger.

#### Scenario: Lifecycle event exists
- **WHEN** a finding is revalidated, split, attempted, or resolved
- **THEN** status can present that progress from the underlying durable records
