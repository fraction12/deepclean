## ADDED Requirements

### Requirement: Scriptable command surface
The system SHALL provide an agent-first CLI workflow with `init`, `scan`, `report`, `next`, `show`, `triage`, and `handoff` or `export` commands.

#### Scenario: Agent runs the core workflow
- **WHEN** an agent runs `deepclean init`, `deepclean scan`, `deepclean report`, `deepclean next`, and `deepclean show <id>`
- **THEN** each command completes without requiring an interactive UI and reads or writes project-local Deepclean state as appropriate

### Requirement: Canonical JSON output
The system SHALL provide machine-readable JSON output for every core command that an agent would automate.

#### Scenario: Agent requests JSON output
- **WHEN** an agent runs a core command with `--json`
- **THEN** the command emits a valid JSON document matching the command's documented schema

### Requirement: Human output remains secondary
The system SHALL provide concise human-readable output by default while preserving JSON as the canonical automation interface.

#### Scenario: Human runs report without JSON
- **WHEN** a user runs `deepclean report` without `--json`
- **THEN** the command prints a ranked, concise summary and persists the full report in state

### Requirement: Non-interactive execution
The system SHALL support non-interactive execution for agents through `--no-input` and non-TTY-safe behavior.

#### Scenario: Agent disables prompts
- **WHEN** an agent runs a command with `--no-input`
- **THEN** the command never waits for user input and fails with a structured diagnostic if required information is missing

### Requirement: Root and state controls
The system SHALL allow agents to explicitly set the target repository root, state directory, and config file.

#### Scenario: Agent scans a specific repository
- **WHEN** an agent runs `deepclean scan --root <repo> --state-dir <dir> --config <file> --json`
- **THEN** the command uses those paths rather than relying on the current working directory alone

### Requirement: Stable IDs for drill-down
The system SHALL assign stable IDs to candidates, evidence records, clusters, runs, reports, and handoff packets.

#### Scenario: Agent drills into a candidate
- **WHEN** `deepclean report --json` returns candidate ID `candidate-014`
- **THEN** `deepclean show candidate-014 --json` resolves the same candidate from persisted state

### Requirement: Predictable exit behavior
The system SHALL use predictable exit codes and structured diagnostics for success, partial success, validation failure, configuration failure, and unexpected errors.

#### Scenario: Optional analyzer is unavailable
- **WHEN** `deepclean scan --json` cannot run an optional evidence adapter
- **THEN** the command records an adapter diagnostic and exits successfully if enough evidence was collected to produce a valid partial scan
