## ADDED Requirements

### Requirement: Doctor package update readiness
The system SHALL let `deepclean doctor` report whether the installed package is current for a selected npm release channel.

#### Scenario: Installed package is stale
- **WHEN** an agent runs `deepclean doctor --json` and the npm latest tag is newer than the installed package
- **THEN** Deepclean reports the installed version, latest package version, release channel, stale status, and update command
- **AND** Deepclean emits a `package_update_available` diagnostic

#### Scenario: Installed package is current
- **WHEN** an agent runs `deepclean doctor --json` and the installed package is current for the checked channel
- **THEN** Deepclean reports stale status as false without emitting an update-available diagnostic

#### Scenario: Network update check is skipped
- **WHEN** an agent runs `deepclean doctor --json --offline`, `--local-only`, or `--no-update-check`
- **THEN** Deepclean does not contact npm
- **AND** Deepclean reports the update check as skipped with a structured reason

#### Scenario: Network update check fails
- **WHEN** npm version lookup fails during `deepclean doctor --json`
- **THEN** Deepclean reports the failure as a warning diagnostic without failing doctor

### Requirement: Documented beta update path
The system SHALL document the package-manager update command for the public install channel.

#### Scenario: User updates global install
- **WHEN** a user follows README or beta onboarding update instructions
- **THEN** the documented command installs the current `@fraction12/deepclean` package and tells the user to verify with `deepclean --version`
