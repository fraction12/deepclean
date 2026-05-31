## MODIFIED Requirements

### Requirement: Public-alpha plan guidance
The system SHALL recommend plans for top candidates and bounded clusters without executing fixes unless an explicit candidate-first fix command is invoked.

#### Scenario: Top candidate has no plan
- **WHEN** a report identifies a start-here candidate with no existing plan artifact
- **THEN** the report suggests the exact `deepclean plan <id>` command

#### Scenario: Candidate is fix-ready
- **WHEN** a candidate has a bounded plan, owned files, verification commands, and current evidence
- **THEN** the report or show output may suggest the exact `deepclean fix <id> --apply --revalidate --verification <cmd>` command

## ADDED Requirements

### Requirement: Fix readiness guidance
The system SHALL report whether a candidate is safe for automated bounded fix execution.

#### Scenario: Agent shows a candidate
- **WHEN** an agent runs `deepclean show candidate-003 --json`
- **THEN** the result includes fix readiness, owned write scope, required verification, broad-candidate warnings, and any refusal reasons

### Requirement: PR-ready summary output
The system SHALL generate PR-ready summaries after successful candidate-first fix workflows.

#### Scenario: Fix workflow succeeds
- **WHEN** a fix attempt passes verification and revalidation
- **THEN** Deepclean outputs a PR-ready summary with changed files, expected behavior, verification results, revalidation outcome, why-this-is-safe note, and remaining risk

### Requirement: Partial resolution handoff
The system SHALL make partial or failed fix outcomes actionable without pretending the candidate is resolved.

#### Scenario: Fix workflow is partially resolved
- **WHEN** a fix attempt is classified as `partially-resolved`
- **THEN** Deepclean reports what changed, what evidence remains, and which follow-up candidate or human decision is needed
