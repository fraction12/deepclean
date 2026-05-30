# Update Path Doctor Diagnostics

## Why

Beta users need a clear way to keep a globally installed `deepclean` current. Today the update path exists through npm, but the product does not surface it, and `doctor` cannot warn when the installed CLI is behind the published beta tag.

## What Changes

- Document default install and update commands as the primary public beta path.
- Add optional `doctor` version freshness diagnostics against the npm `latest` dist-tag.
- Keep version checks privacy-safe: no source code, repository paths, or generated state are sent to npm.
- Allow offline/local-only runs to skip network version checks cleanly.

## Non-Goals

- No self-updating command that mutates global packages.
- No automatic npm install from inside Deepclean.
- No source mutation and no provider/model calls.

## Success Bar

After this change, a user can run `deepclean doctor --json` and see local version, checked channel, latest published beta version when available, and a structured `package_update_available` diagnostic with the exact update command when their CLI is stale.

## Capabilities

### Modified Capabilities

- `agent-first-cli`: doctor reports package update readiness.

## Impact

- CLI doctor output contract.
- README and beta onboarding docs.
- Tests for stale, current, and offline version-check behavior.
