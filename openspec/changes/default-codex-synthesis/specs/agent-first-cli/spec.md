## MODIFIED Requirements

### Requirement: Scriptable command surface
The system SHALL provide an agent-first CLI workflow with `init`, `scan`, `report`, `next`, `show`, `triage`, and `handoff` or `export` commands. The `scan` workflow SHALL default to evidence-grounded synthesis and SHALL provide an explicit flag for deterministic evidence-only analysis.

#### Scenario: Agent runs the core workflow
- **WHEN** an agent runs `deepclean init`, `deepclean scan`, `deepclean report`, `deepclean next`, and `deepclean show <id>`
- **THEN** each command completes without requiring an interactive UI and reads or writes project-local Deepclean state as appropriate

#### Scenario: Agent requests evidence-only scan
- **WHEN** an agent runs `deepclean scan --evidence-only --json`
- **THEN** the command emits a scan result from local evidence without invoking model synthesis

### Requirement: Codex provider diagnostics
The system SHALL emit clear diagnostics when default or explicitly requested local Codex synthesis cannot run.

#### Scenario: Codex is unavailable
- **WHEN** `deepclean scan --json` cannot execute the configured Codex command and synthesis has not been disabled
- **THEN** the scan still persists local evidence and returns a diagnostic explaining the provider failure
