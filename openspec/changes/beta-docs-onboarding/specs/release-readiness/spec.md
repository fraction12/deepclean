## MODIFIED Requirements

### Requirement: Release documentation
The system SHALL include beta documentation for install, quickstart, privacy, troubleshooting, Codex setup, generated artifacts, status/report interpretation, guarded one-candidate workflows, revalidation proof, and limitations.

#### Scenario: New user reads docs
- **WHEN** a new user follows the beta quickstart
- **THEN** they can run a local scan, understand what data Deepclean writes, understand what synthesis may send to configured providers, and choose a safe next command

## ADDED Requirements

### Requirement: Beta onboarding docs
The system SHALL document the core beta workflow from install through first report, status inspection, candidate drill-down, plan, handoff, and optional guarded fix path.

#### Scenario: Developer tries Deepclean first time
- **WHEN** the developer follows the beta onboarding guide
- **THEN** they can complete the read-only workflow before attempting any source mutation

### Requirement: Recovery documentation
The system SHALL document recovery for provider failure, malformed provider output, privacy refusal, invalid state, dirty worktree refusal, stale artifacts, stale locks, failed verification, and inconclusive revalidation.

#### Scenario: Command refuses work
- **WHEN** a command returns a structured diagnostic
- **THEN** the docs explain what it means and the safest next command
