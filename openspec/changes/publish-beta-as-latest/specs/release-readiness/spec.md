## ADDED Requirements

### Requirement: Beta releases publish as latest through trusted publishing
The release workflow SHALL publish beta package versions under the `latest` npm dist-tag using the trusted publishing `npm publish` operation.

#### Scenario: Beta release publishes from GitHub
- **WHEN** the GitHub release workflow publishes a package version whose prerelease label is `beta`
- **THEN** npm dist-tag `latest` resolves to that package version before the workflow succeeds

#### Scenario: Alpha release publishes from GitHub
- **WHEN** the GitHub release workflow publishes a package version whose prerelease label is `alpha`
- **THEN** the workflow publishes under the `alpha` npm dist-tag

### Requirement: Release path avoids post-publish tag tokens
The release workflow SHALL NOT require a long-lived npm token for normal beta release automation.

#### Scenario: Beta release completes
- **WHEN** the GitHub release workflow publishes a beta package version
- **THEN** the workflow does not run `npm dist-tag add` as part of the normal release path
