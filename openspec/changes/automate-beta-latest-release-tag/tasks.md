## 1. Release Metadata

- [x] 1.1 Add a testable release metadata helper for publish tag and promotion tag resolution.
- [x] 1.2 Cover beta, alpha, stable, explicit override, and tag/version mismatch cases with tests.

## 2. GitHub Workflow

- [x] 2.1 Update `release.yml` to use metadata helper outputs.
- [x] 2.2 Add pre-publish npm dist-tag credential preflight for beta promotion.
- [x] 2.3 Add post-publish promotion and dist-tag verification.

## 3. Docs And Verification

- [x] 3.1 Document beta/latest automation and the required `NPM_TOKEN` secret.
- [x] 3.2 Run OpenSpec validation and relevant test/check commands.
