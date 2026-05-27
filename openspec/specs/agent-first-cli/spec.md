# agent-first-cli Specification

## Purpose
TBD - created by archiving change define-deepclean-mvp. Update Purpose after archive.
## Requirements
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
The system SHALL allow agents to explicitly set the target repository root, state directory, and config file, with global flags accepted before or after the command.

#### Scenario: Agent places global flags after command
- **WHEN** an agent runs `deepclean scan --root <repo> --state-dir <dir> --config <file> --json`
- **THEN** the command uses those paths rather than relying on the current working directory alone

#### Scenario: Agent places global flags before command
- **WHEN** an agent runs `deepclean --root <repo> --state-dir <dir> --config <file> scan --json`
- **THEN** the command uses the same effective paths as the after-command form

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

### Requirement: Installable command
The system SHALL provide an installable `deepclean` executable through the package manager.

#### Scenario: User installs Deepclean
- **WHEN** a user installs the public-alpha package
- **THEN** `deepclean --help` and `deepclean --version` run without requiring a repository scan

### Requirement: Version output
The system SHALL expose the package version through the CLI.

#### Scenario: Agent checks version
- **WHEN** an agent runs `deepclean --version --json`
- **THEN** the command emits a JSON envelope containing the installed version

### Requirement: Codex provider diagnostics
The system SHALL emit clear diagnostics when local Codex synthesis cannot run.

#### Scenario: Codex is unavailable
- **WHEN** `deepclean scan --json` cannot execute the configured Codex command
- **THEN** the scan still persists local evidence and returns a diagnostic explaining the provider failure
