## MODIFIED Requirements

### Requirement: Versioned state records
The system SHALL version persisted state records so future releases can migrate or validate them.

#### Scenario: State record is written
- **WHEN** the system writes config, run, evidence, candidate, cluster, report, triage, handoff, fix plan, fix attempt, verification, revalidation, or PR summary records
- **THEN** each record includes a schema version and record type

## ADDED Requirements

### Requirement: Fix attempt ledger
The system SHALL persist a durable fix attempt ledger for candidate-first patch workflows.

#### Scenario: Fix attempt is created
- **WHEN** an agent runs `deepclean fix candidate-003 --apply --json`
- **THEN** Deepclean writes a fix attempt record with target candidate, plan ID, allowed write scope, worker metadata, changed files, verification results, revalidation result, outcome, and timestamps

### Requirement: Before and after evidence snapshots
The system SHALL preserve enough before and after state to audit why a fix was classified.

#### Scenario: Revalidated fix is classified
- **WHEN** a fix attempt is classified as resolved, partially-resolved, still-open, superseded, or needs_human
- **THEN** the attempt links to pre-fix candidate evidence and post-fix revalidation evidence or diagnostics

### Requirement: PR-ready summary record
The system SHALL persist PR-ready summaries separately from raw fix attempts.

#### Scenario: Fix proof passes
- **WHEN** a fix attempt passes scope, verification, and revalidation gates
- **THEN** Deepclean writes a PR-ready summary containing candidate ID, changed files, verification commands, revalidation outcome, why-this-is-safe note, and remaining risk
