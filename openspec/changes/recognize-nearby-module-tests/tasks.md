## 1. Test Discovery

- [x] 1.1 Add regression coverage for scoped source files with nearby tests in full-repo context.
- [x] 1.2 Update test discovery to match nearby tests from full discovered files.

## 2. Verification

- [x] 2.1 Run targeted evidence/test-gap tests.
- [x] 2.2 Run `node dist/cli.js revalidate candidate-030 --json`.
- [x] 2.3 Run `npm run ci`.
- [x] 2.4 Run `openspec validate recognize-nearby-module-tests` and `npm run spec:validate`.
