## Context

`0.1.0-beta.6` verified the current release path: trusted publishing succeeded for `npm publish`, but the follow-up `npm dist-tag add ... latest` failed with `EOTP`. npm documentation states OIDC authentication is limited to `npm publish` and `npm stage publish`, while `dist-tag add` remains an authenticated write command.

## Goals / Non-Goals

**Goals:**

- Move the default install tag during `npm publish` using trusted publishing.
- Remove the need for `NPM_TOKEN` in normal releases.
- Keep release verification that checks the resulting npm dist-tag.

**Non-Goals:**

- Do not maintain both `beta` and `latest` automatically for beta releases.
- Do not introduce a bypass-2FA npm token.
- Do not change alpha or stable release semantics beyond removing the promotion path.

## Decisions

1. Resolve beta releases to `npm_tag=latest`.

   This uses npm's built-in publish tag behavior under trusted publishing. It satisfies the default-install requirement without a second registry mutation.

2. Remove post-publish promotion.

   A separate `npm dist-tag add` cannot use OIDC today and either needs OTP or a long-lived bypass token. Removing it is the safer release path.

3. Verify only the publish tag.

   The workflow will still verify that the dist-tag used for publish points at the released version. For beta releases, that tag is `latest`.

## Risks / Trade-offs

- `@fraction12/deepclean@beta` may lag behind `latest` -> Accept this while beta is the default install channel, or update `beta` manually when useful.
- Users expecting `@beta` to be the freshest beta may see an older tag -> Document the behavior and prefer default install/update guidance.
- Existing `NPM_TOKEN` environment secret becomes unnecessary -> Delete it after the workflow change lands.

## Migration Plan

1. Update metadata resolution, workflow, tests, and docs.
2. Merge the release-path fix.
3. Delete the no-longer-used GitHub `npm` environment `NPM_TOKEN`.
4. Cut a beta release to prove trusted publishing advances `latest`.
