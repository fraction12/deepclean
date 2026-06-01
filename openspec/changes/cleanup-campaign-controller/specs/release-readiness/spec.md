## MODIFIED Requirements

### Requirement: CI verification
The project SHALL include CI that runs typecheck, tests, build, package smoke checks, OpenSpec validation, and Deepclean quality gates on supported Node versions.

#### Scenario: Pull request opens
- **WHEN** CI runs on a pull request
- **THEN** it verifies the package can build, test, smoke-test from a packed tarball, and pass the selected Deepclean quality profile

### Requirement: Release artifact hygiene
The project SHALL reject release packages that include private state, local agent folders, dependencies, source-only development files, dogfood reports, or generated quality-gate state.

#### Scenario: Release check runs
- **WHEN** maintainers run `npm run release:check`
- **THEN** the packed tarball is inspected for required public files and forbidden local artifacts including `.deepclean/quality/` results

## ADDED Requirements

### Requirement: Quality gate release profile
The project SHALL define the quality profile required before release.

#### Scenario: Release is evaluated
- **WHEN** maintainers prepare a release
- **THEN** the release checklist records the selected Deepclean quality profile, gate status, blocker count, advisory count, and artifact paths
- **AND** a blocking quality gate failure prevents release until fixed or explicitly waived with rationale
