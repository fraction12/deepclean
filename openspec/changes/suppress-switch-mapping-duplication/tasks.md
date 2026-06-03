## 1. Evidence Filter

- [x] 1.1 Add regression coverage for switch-mapping windows across files.
- [x] 1.2 Suppress syntax-only switch mapping windows in the duplication adapter.

## 2. Verification

- [x] 2.1 Run targeted duplication evidence tests.
- [x] 2.2 Run `npm run ci`.
- [x] 2.3 Run `openspec validate suppress-switch-mapping-duplication` and `npm run spec:validate`.
- [x] 2.4 Run `node dist/cli.js revalidate candidate-001 --json`.
