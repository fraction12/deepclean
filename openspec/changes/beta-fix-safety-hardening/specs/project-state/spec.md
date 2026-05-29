## ADDED Requirements

### Requirement: Fix attempt records
The system SHALL persist fix attempts with target finding, branch, dirty-state provenance, allowed files, changed files, worker output summary, verification results, and outcome.

#### Scenario: Applied fix finishes
- **WHEN** a fix attempt completes
- **THEN** Deepclean writes a fix attempt record that explains what changed, what verification ran, and why the attempt passed or failed

### Requirement: Fix lifecycle events
The system SHALL append lifecycle events for fix refusal, patch start, patch application, scope failure, verification pass, verification failure, and unverified completion.

#### Scenario: Verification fails
- **WHEN** an applied fix command exits with failing verification
- **THEN** Deepclean records the failed verification and appends a lifecycle event without marking the finding resolved
