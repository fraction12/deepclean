# Release

Deepclean deploys by publishing the npm package `@fraction12/deepclean`.

## Required GitHub Setup

Configure npm trusted publishing for `@fraction12/deepclean`:

- Publisher: GitHub Actions
- Repository: `fraction12/deepclean`
- Workflow: `.github/workflows/release.yml`
- Environment: `npm`

The release workflow uses GitHub OIDC and does not require a long-lived npm token.

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

Rotate npm tokens after any accidental exposure. This repository release path should not need one going forward.
