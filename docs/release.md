# Release

Deepclean deploys by publishing the npm package `@fraction12/deepclean`.

## Required GitHub Setup

Add this repository secret:

```text
NPM_TOKEN
```

Use an npm automation token with publish access to `@fraction12/deepclean`.

The release workflow also requests GitHub OIDC so npm can attach provenance when the token and npm account allow it.

## Normal Release

1. Update `package.json` version.
2. Move relevant `CHANGELOG.md` entries from `Unreleased` into that version.
3. Run:

```bash
npm run release:check
```

4. Commit and push.
5. Tag the exact package version:

```bash
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

The tag must match `package.json` exactly. For prereleases, the workflow publishes under the prerelease label, such as `alpha`. Stable versions publish under `latest`.

## Manual Release

Use the GitHub Actions `Release` workflow dispatch when a tag release needs to be retried or when publishing from the current branch deliberately.

Set `npm_tag` only when overriding the default tag is intentional.

## Promoting A Version

To promote an already-published alpha to latest:

```bash
npm dist-tag add @fraction12/deepclean@0.1.0-alpha.0 latest
```

## Token Hygiene

Rotate npm tokens after any accidental exposure. If a token is rotated, update the `NPM_TOKEN` repository secret before the next release.
