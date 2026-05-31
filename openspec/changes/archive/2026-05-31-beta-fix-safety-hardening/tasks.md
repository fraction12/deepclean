## 1. Fix Command Safety

- [x] 1.1 Add `deepclean fix <id>` safety gates for clean tree, current plan, owned files, confidence, freshness, and verification.
- [x] 1.2 Add `--dry-run`, `--apply`, `--verification`, `--allow-files`, `--allow-dirty`, `--branch`, and `--json` behavior.
- [x] 1.3 Refuse broad, stale, suppressed, fixed, superseded, low-confidence, and ambiguous targets.

## 2. Scope And Verification

- [x] 2.1 Capture pre-patch and post-patch changed files.
- [x] 2.2 Fail or mark `needs-human` when changed files exceed allowed scope.
- [x] 2.3 Run required verification and persist command, exit code, duration, summary, and output artifact path.
- [x] 2.4 Record no-external-side-effect guarantees in fix attempt metadata.

## 3. State

- [x] 3.1 Add fix attempt schema with branch, dirty state, allowed scope, changed files, worker output, verification, and outcome.
- [x] 3.2 Add lifecycle events for refused, patch-started, patch-applied, scope-failed, verification-passed, verification-failed, and unverified.

## 4. Tests

- [x] 4.1 Test dry-run makes no source changes.
- [x] 4.2 Test dirty worktree refusal.
- [x] 4.3 Test out-of-scope edit detection.
- [x] 4.4 Test verification pass and fail capture.
- [x] 4.5 Test no push, PR, publish, or external action during fix.
- [x] 4.6 Run `npm run typecheck`, `npm test`, `openspec validate beta-fix-safety-hardening`, and `npm run spec:validate`.
