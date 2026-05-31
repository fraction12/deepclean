## 1. Spec

- [x] 1.1 Define doctor package update readiness diagnostics.
- [x] 1.2 Define offline/local-only skip behavior.
- [x] 1.3 Define beta install/update docs.

## 2. Implementation

- [x] 2.1 Add doctor update-check flags and structured package update data.
- [x] 2.2 Add npm beta version lookup with bounded timeout and no source/state leakage.
- [x] 2.3 Add semver prerelease comparison for current vs published version.
- [x] 2.4 Add human-readable doctor output for update availability.

## 3. Docs

- [x] 3.1 Update README install/update commands to use `@beta`.
- [x] 3.2 Update beta onboarding with update guidance and doctor stale-version warning.

## 4. Verification

- [x] 4.1 Test current, stale, skipped, and failed update checks.
- [x] 4.2 Run `npm run typecheck`, `npm test`, `openspec validate update-path-doctor-diagnostics`, and `npm run spec:validate`.
