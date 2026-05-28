## MODIFIED Requirements

### Requirement: Scriptable command surface
The system SHALL provide an agent-first CLI workflow with `init`, `scan`, `report`, `next`, `show`, `triage`, `handoff` or `export`, `fix`, `work`, and `split` commands. Commands that can mutate source, branches, pull requests, or candidate state SHALL require explicit command invocation and structured prerequisites.

#### Scenario: Agent runs candidate decomposition
- **WHEN** an agent runs `deepclean split candidate-004 --json`
- **THEN** the command runs non-interactively, updates project-local Deepclean state, and returns structured parent and child candidate data

#### Scenario: Agent targets a broad parent for work
- **WHEN** an agent runs `deepclean work candidate-004 --apply --verification "npm test" --json` for a broad splittable parent
- **THEN** Deepclean refuses before invoking a patch worker and instructs the agent to run `deepclean split candidate-004`

### Requirement: Predictable exit behavior
The system SHALL use predictable exit codes and structured diagnostics for success, partial success, validation failure, configuration failure, policy refusal, verification failure, and unexpected errors.

#### Scenario: Split target is not splittable
- **WHEN** `deepclean split <id> --json` targets a bounded candidate
- **THEN** Deepclean exits with a policy refusal and emits a structured `candidate_not_splittable` diagnostic
