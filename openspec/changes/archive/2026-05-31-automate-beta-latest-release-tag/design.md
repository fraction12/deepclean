## Context

`release.yml` currently derives the npm publish tag from the package prerelease label. For `0.1.0-beta.5`, that means `npm publish --tag beta`; npm correctly advances `beta`, but `latest` remains whatever a maintainer last promoted manually.

npm trusted publishing is the right path for `npm publish`, but current npm docs limit OIDC-backed trusted publishing to publish/staged-publish operations. `npm dist-tag add` still needs normal npm authentication, so automatic promotion must be explicit and separately credentialed.

## Goals / Non-Goals

**Goals:**

- Keep `npm publish` on GitHub OIDC/trusted publishing.
- Promote beta releases to `latest` automatically after a successful beta publish.
- Preserve alpha behavior.
- Fail before publish when a beta release cannot complete its required dist-tag promotion.
- Make the release metadata logic testable outside workflow YAML.

**Non-Goals:**

- Do not introduce long-lived publish credentials for the primary publish path.
- Do not change version preparation, changelog handling, or release PR tagging.
- Do not auto-promote alpha prereleases.

## Decisions

1. Use a helper script for release metadata.

   The workflow will call a Node script that reads `package.json`, validates tag/version consistency, and emits GitHub Actions outputs for package name, package version, publish tag, and promotion tags. This avoids growing fragile inline shell/Node logic in YAML and gives us direct test coverage for beta behavior.

2. Publish beta under `beta`, then promote `latest`.

   Publishing beta directly under `latest` would fix default installs but leave `@beta` stale. Keeping `beta` as the publish tag and adding `latest` after publish preserves both installation paths.

3. Require `NPM_TOKEN` only for promotion.

   The release job will preflight the existing npm token when promotion is required. The workflow references `secrets.NPM_TOKEN`; the safest setup is to store that secret in the protected `npm` environment so it is only released to this release job. The actual `npm publish` step continues to run without `NODE_AUTH_TOKEN`, using trusted publishing and provenance. The token is only exposed to `npm whoami` preflight and `npm dist-tag add`.

4. Treat explicit `npm_tag` overrides as manual intent.

   If maintainers dispatch the workflow with `npm_tag`, the workflow publishes under that tag and does not infer promotion tags. This keeps emergency/manual release behavior predictable.

## Risks / Trade-offs

- `NPM_TOKEN` is a long-lived secret -> Mitigate with a granular npm token scoped to `@fraction12/deepclean`, stored as an environment secret on the protected `npm` environment, and used only for dist-tag commands, not package publishing.
- The beta package may publish successfully while promotion fails -> Mitigate by preflighting token presence and npm identity before `npm publish`, then verifying dist-tags after promotion.
- Registry propagation can lag briefly -> Mitigate verification with a short retry loop.

## Migration Plan

1. Add and test the metadata helper.
2. Update `release.yml` to use helper outputs, preflight promotion credentials, run promotion, and verify tags.
3. Document the required `NPM_DIST_TAG_TOKEN` secret and updated beta/latest behavior.
4. Move or copy the existing GitHub `NPM_TOKEN` value into the `npm` environment secret and confirm it has permission to run `npm dist-tag add` before the next beta release.

## Open Questions

- None for implementation. The only external setup is confirming the existing token is stored in the protected `npm` environment and has dist-tag write permission before the next beta release.
