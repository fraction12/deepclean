# Publish Beta As Latest

## Why

The beta release smoke test proved that npm trusted publishing can publish the package, but post-publish `npm dist-tag add` requires interactive 2FA or a long-lived bypass token. Since the desired default install path is `latest`, beta releases should move `latest` during `npm publish` itself and avoid token-dependent tag mutation.

## What Changes

- Publish beta versions directly under the `latest` npm dist-tag through trusted publishing.
- Remove the automatic post-publish `latest` promotion step and its npm token preflight.
- Keep alpha releases publishing under `alpha` and stable releases under `latest`.
- Document that `beta` is not automatically maintained by the tokenless release path.

## Non-Goals

- No long-lived npm token for release automation.
- No automated maintenance of two npm dist-tags for the same beta version.
- No change to version preparation, release PR tagging, or GitHub trusted publisher setup.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `release-readiness`: beta release automation must use trusted publishing to move `latest` during publish instead of relying on post-publish dist-tag mutation.

## Impact

- `.github/workflows/release.yml`
- `scripts/release-metadata.mjs`
- `scripts/release-metadata.test.mjs`
- `docs/release.md`
- `openspec/specs/release-readiness`
