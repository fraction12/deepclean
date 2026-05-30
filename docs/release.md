# Release

Deepclean deploys by publishing the npm package `@fraction12/deepclean`.

## Required GitHub Setup

Configure npm trusted publishing for `@fraction12/deepclean`:

- Publisher: GitHub Actions
- Repository: `fraction12/deepclean`
- Workflow: `.github/workflows/release.yml`
- Environment: `npm`

The release workflow uses GitHub OIDC for `npm publish` and should not use a long-lived token for normal package publishing or beta latest-tag updates.

## One-Command Release Prep

Use the GitHub Actions `Prepare Release` workflow for normal releases.

Inputs:

- `bump`: `alpha`, `patch`, `minor`, or `major`
- `exact_version`: optional exact version, such as `1.0.0-rc.1`

The workflow:

1. Runs `npm run release:prepare`.
2. Updates `package.json`, `package-lock.json`, and `CHANGELOG.md`.
3. Runs `npm run release:check`.
4. Opens a release PR named `release: v<version>`.
5. Dispatches CI for the generated release branch.

After the release PR is reviewed and merged, the `Tag Release PR` workflow creates the matching `v<version>` tag and dispatches the `Release` workflow against that tag. The existing `Release` workflow publishes to npm with provenance.

For the GA release-candidate path, use an exact version first. The normal target is `1.0.0-rc.1`, then `1.0.0` after dogfooding Deepclean, LightningITB, and OctoCheck.

From the CLI:

```bash
gh workflow run prepare-release.yml --ref main -f bump=patch -f exact_version=1.0.0-rc.1
```

For an exact version:

```bash
gh workflow run prepare-release.yml --ref main -f bump=patch -f exact_version=1.0.0
```

## Manual Release

1. Update `package.json` version.
2. Move relevant `CHANGELOG.md` entries from `Unreleased` into that version.
3. Run:

```bash
npm run release:check
```

4. For operating-loop changes, run or cite the latest dogfood scorecard in `docs/`.
5. For beta releases, complete `docs/beta-release-checklist.md` and ensure the source-safe scorecards in `docs/beta-dogfood/scorecards/` cover every required matrix slot from `docs/beta-dogfood/matrix.md`.
6. For GA releases, verify `deepclean schemas --json`, `deepclean review-pr --json`, and at least one `deepclean fix --mode guarded` proof run on real repos before tagging.
7. Commit and push.
8. Tag the exact package version:

```bash
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

The tag must match `package.json` exactly.

Dist-tag behavior:

- Alpha prereleases publish under `alpha`.
- Beta prereleases publish under `latest` so default installs update through trusted publishing.
- Stable versions publish under `latest`.

Do not maintain a separate `beta` dist-tag. Beta releases publish under `latest` so the default install path stays current without a second registry pointer.

## Beta Dogfood Gate

Beta releases are blocked unless dogfood scorecards pass for Deepclean, LightningITB, two additional codebases, and a generated/noisy fixture. `npm run release:check` enforces that gate when the package version includes `-beta`, `DEEPCLEAN_RELEASE_CHANNEL=beta`, or `DEEPCLEAN_REQUIRE_BETA_DOGFOOD=1`.

Committed scorecards must be source-safe: counts, timings, diagnostics, quality scores, and residual risks are allowed; source excerpts, prompts, provider payloads, private absolute paths, and private report prose are not.

## Manual Publish Retry

Use the GitHub Actions `Release` workflow dispatch when a tag release needs to be retried or when publishing from the current branch deliberately.

Set `npm_tag` only when overriding the default tag is intentional.

## Token Hygiene

Rotate npm tokens after any accidental exposure. The normal release path should not require `NPM_TOKEN`; keep npm write tokens out of GitHub secrets unless there is a temporary, explicit registry repair.
