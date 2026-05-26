## ADDED Requirements

### Requirement: Package smoke test
The system SHALL include a release smoke test that verifies the packed package works in a fresh environment.

#### Scenario: Release candidate is packed
- **WHEN** maintainers run the package smoke test
- **THEN** it installs the packed artifact into a temp project and verifies version, init, scan, and report commands

### Requirement: Public-alpha release checklist
The system SHALL maintain a public-alpha release checklist with pass/fail status for tests, build, OpenSpec validation, package smoke test, docs, license, changelog, and dogfood scorecards.

#### Scenario: Release is evaluated
- **WHEN** maintainers prepare a public-alpha release
- **THEN** the release checklist records each gate and blocks release if a required gate fails

### Requirement: Dogfood scorecard
The system SHALL define and use a dogfood scorecard before public-alpha publication.

#### Scenario: Dogfood run completes
- **WHEN** Deepclean is run against a dogfood repository
- **THEN** maintainers record source-safe scores for false positives, evidence strength, ranking quality, cluster usability, report readability, privacy behavior, and handoff readiness

### Requirement: Source-safe dogfood artifacts
The system SHALL avoid committing private source excerpts or private repository details into public dogfood artifacts.

#### Scenario: Private repo is dogfooded
- **WHEN** a private repository is used for dogfood
- **THEN** only a source-safe summary scorecard may be committed or published

### Requirement: Release documentation
The system SHALL include public-alpha documentation for install, quickstart, privacy, troubleshooting, Codex setup, generated artifacts, and limitations.

#### Scenario: New user reads docs
- **WHEN** a new user follows the quickstart
- **THEN** they can run a local scan and understand what data Deepclean writes and what data synthesis may send to Codex
