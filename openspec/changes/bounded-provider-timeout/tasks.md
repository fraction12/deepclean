## 1. Timeout Recovery

- [x] 1.1 Add a regression test for a synthesis provider process that ignores `SIGTERM`.
- [x] 1.2 Escalate provider timeout termination so the scan resolves boundedly.
- [x] 1.3 Short-circuit provider retries after timeout and preserve timeout status for zero-exit grace-period exits.

## 2. Verification

- [x] 2.1 Run targeted timeout recovery tests.
- [x] 2.2 Run `npm run ci`.
- [x] 2.3 Run `openspec validate bounded-provider-timeout` and `npm run spec:validate`.
