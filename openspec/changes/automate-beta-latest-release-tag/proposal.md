# Automate Beta Latest Release Tag

## Why

Beta releases currently publish to npm under the `beta` dist-tag, leaving the default `latest` tag stale unless a maintainer manually promotes it. Now that beta is the intended default install path, GitHub-driven releases should advance `latest` without a manual npm follow-up.

## What Changes

- Update the GitHub release workflow so beta releases publish under `beta` and then promote the same version to `latest`.
- Require the existing npm token only when automatic promotion is needed, preferably stored as a protected `npm` environment secret, while keeping package publishing on trusted publishing/OIDC.
- Fail beta releases before publishing when the dist-tag token is missing, so releases do not silently publish without updating `latest`.
- Document the required GitHub secret and the beta/latest dist-tag behavior.

## Non-Goals

- No autonomous version bumping beyond the existing release prep flow.
- No change to alpha release behavior.
- No replacement of npm trusted publishing for the package publish step.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `release-readiness`: beta release automation must update npm dist-tags predictably and verify the existing npm token before publish.

## Impact

- `.github/workflows/release.yml`
- Release metadata/promotion helper scripts and tests
- `docs/release.md`
- `openspec/specs/release-readiness`
