## ADDED Requirements

### Requirement: Beta releases promote latest dist-tag
The release workflow SHALL publish beta package versions under the `beta` npm dist-tag and promote the same version to the `latest` npm dist-tag before reporting success.

#### Scenario: Beta release publishes from GitHub
- **WHEN** the GitHub release workflow publishes a package version whose prerelease label is `beta`
- **THEN** npm dist-tags `beta` and `latest` both resolve to that package version before the workflow succeeds

#### Scenario: Alpha release publishes from GitHub
- **WHEN** the GitHub release workflow publishes a package version whose prerelease label is `alpha`
- **THEN** the workflow publishes under the `alpha` npm dist-tag without promoting `latest`

### Requirement: Dist-tag promotion credential preflight
The release workflow SHALL verify npm dist-tag credentials before publishing any release that requires post-publish dist-tag promotion.

#### Scenario: Beta release lacks dist-tag token
- **WHEN** the GitHub release workflow prepares to publish a beta package version and the dist-tag token is unavailable
- **THEN** the workflow fails before `npm publish` runs with a diagnostic naming the missing configuration

#### Scenario: Manual npm tag override is provided
- **WHEN** the GitHub release workflow is run with an explicit `npm_tag` override
- **THEN** the workflow uses the override and does not infer additional dist-tag promotion
