## MODIFIED Requirements

### Requirement: Root and state controls
The system SHALL allow agents to explicitly set the target repository root, state directory, and config file, with global flags accepted before or after the command.

#### Scenario: Agent places global flags after command
- **WHEN** an agent runs `deepclean scan --root <repo> --state-dir <dir> --config <file> --json`
- **THEN** the command uses those paths rather than relying on the current working directory alone

#### Scenario: Agent places global flags before command
- **WHEN** an agent runs `deepclean --root <repo> --state-dir <dir> --config <file> scan --json`
- **THEN** the command uses the same effective paths as the after-command form

## ADDED Requirements

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
- **WHEN** `deepclean scan --synthesize --json` cannot execute the configured Codex command
- **THEN** the scan still persists local evidence and returns a diagnostic explaining the provider failure
