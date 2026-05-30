# Design

`deepclean doctor` remains a read-only readiness check. The version freshness check is best-effort and bounded.

## Version Check

- Current version comes from local package metadata.
- Latest version comes from `npm view @fraction12/deepclean@latest version`.
- The default channel is `latest`, because trusted publishing moves beta releases through the default npm install path.
- `--offline`, `--local-only`, or `--no-update-check` skips the network call.
- `--update-channel <tag>` may override the npm dist-tag for development, alpha users, or intentional `beta` dist-tag checks.

## Diagnostics

Doctor adds:

- `package_update_available` when latest is newer than current.
- `package_update_check_failed` when npm lookup fails.
- `package_update_check_skipped` when the user requests offline/local-only/no-update-check mode.

The JSON data includes the current version, checked package/tag, latest version when known, stale boolean, update command, and failure/skipped reason when applicable.

## Version Comparison

Use a small internal semver prerelease comparator rather than adding a dependency. It only needs to compare npm package versions already published for Deepclean, including `alpha` and `beta` prereleases.

## Privacy

The npm check sends only the package spec to npm. It does not include repository path, source files, generated state, config, evidence, or prompts.
