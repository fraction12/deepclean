## 1. Helper Extraction

- [x] 1.1 Add shared internal construction for synthesis attempt runtime controls and evidence manifests.
- [x] 1.2 Use the shared construction from single-attempt and aggregate chunked-attempt paths.

## 2. Verification

- [x] 2.1 Run targeted synthesis tests.
- [x] 2.2 Run `npm run ci`.
- [x] 2.3 Run `openspec validate share-synthesis-attempt-fields` and `npm run spec:validate`.
- [x] 2.4 Run `node dist/cli.js revalidate candidate-019 --json`.
