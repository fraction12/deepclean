## MODIFIED Requirements

### Requirement: Scriptable command surface
The system SHALL provide an agent-first CLI workflow with `init`, `scan`, `report`, `next`, `show`, `triage`, `handoff` or `export`, `fix`, and `work` commands. Commands that can mutate source, branches, or pull requests SHALL require explicit flags and structured prerequisites.

#### Scenario: Agent runs the core workflow
- **WHEN** an agent runs `deepclean init`, `deepclean scan`, `deepclean report`, `deepclean next`, and `deepclean show <id>`
- **THEN** each command completes without requiring an interactive UI and reads or writes project-local Deepclean state as appropriate

#### Scenario: Agent requests a bounded fix
- **WHEN** an agent runs `deepclean fix candidate-003 --apply --revalidate --verification "make test" --json`
- **THEN** the command runs non-interactively, applies only the selected candidate workflow, and returns a structured fix attempt result

#### Scenario: Agent requests branch and PR workflow
- **WHEN** an agent runs `deepclean work candidate-003 --branch chore/deepclean-candidate-003 --pr --verification "make test" --json`
- **THEN** the command creates or uses the requested branch and only proceeds toward PR creation after local verification and revalidation gates pass

### Requirement: Predictable exit behavior
The system SHALL use predictable exit codes and structured diagnostics for success, partial success, validation failure, configuration failure, policy refusal, verification failure, and unexpected errors.

#### Scenario: Optional analyzer is unavailable
- **WHEN** `deepclean scan --json` cannot run an optional evidence adapter
- **THEN** the command records an adapter diagnostic and exits successfully if enough evidence was collected to produce a valid partial scan

#### Scenario: Fix is refused by policy
- **WHEN** fix execution is disabled, a fix command lacks verification, targets a broad candidate, or would edit out-of-scope files
- **THEN** Deepclean exits with a policy refusal code and emits a structured diagnostic explaining the blocked gate
