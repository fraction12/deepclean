## MODIFIED Requirements

### Requirement: Scriptable command surface
The system SHALL provide an agent-first CLI workflow with `init`, `scan`, `report`, `next`, `show`, `list` or `findings`, `history`, `triage`, `revalidate`, `plan`, `handoff`, `status`, `doctor`, `ci`, `prune`, `scrub` or `export`, and gated `fix` commands.

#### Scenario: Agent runs the core workflow
- **WHEN** an agent runs `deepclean init`, `deepclean scan`, `deepclean report`, `deepclean next`, `deepclean show <id>`, and `deepclean status`
- **THEN** each command completes without requiring an interactive UI and reads or writes project-local Deepclean state as appropriate

### Requirement: Predictable exit behavior
The system SHALL use predictable exit codes and structured diagnostics for success, partial success, validation failure, configuration failure, policy failure, lock contention, provider failure, and unexpected errors.

#### Scenario: Optional analyzer is unavailable
- **WHEN** `deepclean scan --json` cannot run an optional evidence adapter
- **THEN** the command records an adapter diagnostic and exits successfully if enough evidence was collected to produce a valid partial scan

## ADDED Requirements

### Requirement: Doctor command
The system SHALL provide `deepclean doctor` to validate environment readiness.

#### Scenario: Agent checks readiness
- **WHEN** an agent runs `deepclean doctor --json`
- **THEN** Deepclean reports package version, repository root, config validity, state validity, git availability, dirty state, analyzer availability, provider availability, privacy mode, and supported project surfaces

### Requirement: Status command
The system SHALL provide `deepclean status` to summarize current project-local Deepclean state.

#### Scenario: Agent checks project state
- **WHEN** an agent runs `deepclean status --json`
- **THEN** Deepclean reports latest run, latest report, open finding counts, stale finding counts, fixed finding counts, suppressed finding counts, active locks, artifact counts, and pending revalidation work

### Requirement: Query command
The system SHALL provide a scriptable query command for finding queues.

#### Scenario: Agent lists high-risk backend findings
- **WHEN** an agent runs `deepclean list --status open --risk high --path backend --json`
- **THEN** Deepclean returns matching findings using stable IDs and includes enough metadata to choose the next action

### Requirement: History command
The system SHALL provide `deepclean history <id>` for durable lifecycle inspection.

#### Scenario: Agent inspects lifecycle
- **WHEN** an agent runs `deepclean history finding_<id> --json`
- **THEN** Deepclean returns creation, observation, triage, revalidation, suppression, fix attempt, and verification events for that finding

### Requirement: Revalidation command
The system SHALL provide `deepclean revalidate` for candidates, findings, themes, and all open findings.

#### Scenario: Agent rechecks one finding
- **WHEN** an agent runs `deepclean revalidate finding_<id> --json`
- **THEN** Deepclean recollects the required evidence and records whether the finding is unchanged, changed, fixed, stale, superseded, or inconclusive

### Requirement: CI command
The system SHALL provide `deepclean ci` as a non-interactive policy-gated workflow.

#### Scenario: CI enforces no new critical findings
- **WHEN** CI runs `deepclean ci --since main --max-new-p0 0 --json`
- **THEN** Deepclean exits successfully or with a policy-failure code according to new findings relative to the baseline

### Requirement: Prune command
The system SHALL provide `deepclean prune` with dry-run support and safe retention behavior.

#### Scenario: Agent previews stale artifact cleanup
- **WHEN** an agent runs `deepclean prune --keep-runs 5 --dry-run --json`
- **THEN** Deepclean reports what would be deleted without touching config, active locks, latest artifacts, or referenced evidence

### Requirement: Scrub or export command
The system SHALL provide a source-safe sharing path for generated artifacts.

#### Scenario: User prepares a support artifact
- **WHEN** a user runs `deepclean export --source-safe --json` or `deepclean scrub --json`
- **THEN** Deepclean produces an artifact that omits source excerpts, private absolute paths when configured, provider prompts, and sensitive local metadata
