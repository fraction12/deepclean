## ADDED Requirements

### Requirement: Explicit fix opt-in
The system SHALL only modify source code through an explicit fix command and configuration that permits source mutation.

#### Scenario: User runs report workflow
- **WHEN** an agent runs scan, report, show, list, plan, handoff, status, doctor, prune, or revalidate commands
- **THEN** Deepclean does not modify application source files

### Requirement: One finding at a time
The system SHALL limit fix execution to one stable finding or one bounded theme slice at a time.

#### Scenario: User targets a broad theme
- **WHEN** an agent runs `deepclean fix <broad-theme-id>`
- **THEN** Deepclean refuses or requires the user to select a bounded finding or generated theme slice

### Requirement: Fresh validation before fix
The system SHALL require current revalidation before applying a fix.

#### Scenario: Finding has stale evidence
- **WHEN** an agent runs `deepclean fix finding_<id>` and the finding has stale or inconclusive revalidation state
- **THEN** Deepclean refuses the fix and instructs the agent to run revalidation first

### Requirement: Clean working tree guard
The system SHALL protect user work before source mutation.

#### Scenario: Working tree has unrelated changes
- **WHEN** an agent runs `deepclean fix finding_<id>` and git has dirty files outside the target scope
- **THEN** Deepclean refuses unless an explicit allow-dirty flag is provided and records the dirty state in the fix attempt

### Requirement: Patch preview
The system SHALL support previewing proposed changes before applying them.

#### Scenario: Agent requests dry run
- **WHEN** an agent runs `deepclean fix finding_<id> --dry-run --json`
- **THEN** Deepclean returns the planned patch, changed files, assumptions, and verification commands without changing source files

### Requirement: Verification required
The system SHALL require verification evidence for every applied fix attempt.

#### Scenario: Fix applies
- **WHEN** Deepclean applies a patch
- **THEN** it runs configured or inferred verification commands, persists results, and marks the fix attempt as passed, failed, or unverified

### Requirement: No external side effects
The system MUST NOT push branches, open pull requests, publish packages, or perform public/external actions during fix execution.

#### Scenario: Fix succeeds
- **WHEN** a fix attempt passes verification
- **THEN** Deepclean records local artifacts and next-step guidance only
