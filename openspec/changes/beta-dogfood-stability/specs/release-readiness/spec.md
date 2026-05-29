## ADDED Requirements

### Requirement: Beta dogfood matrix
The system SHALL define and pass a beta dogfood matrix before a beta release.

#### Scenario: Maintainer prepares beta
- **WHEN** maintainers prepare a beta release
- **THEN** Deepclean has source-safe dogfood scorecards for Deepclean itself, LightningITB, at least two additional repos, and one generated/noisy repo or fixture

### Requirement: Beta stability scorecard
The system SHALL record source-safe scores for workflow completion, evidence strength, ranking quality, false positives, diagnostics, stale-state handling, generated-file handling, provider failure handling, and report usability.

#### Scenario: Dogfood run completes
- **WHEN** a dogfood repo run finishes
- **THEN** maintainers record a scorecard without private source excerpts or private absolute paths

### Requirement: Beta release gate
The system SHALL block beta release when required dogfood scorecards are missing or failing.

#### Scenario: Scorecard fails core workflow
- **WHEN** a required dogfood repo cannot complete doctor, status, scan, report, next/show, plan/handoff, prune dry-run, and final status
- **THEN** the beta release checklist marks the release blocked
