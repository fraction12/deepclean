## 1. Extraction

- [x] 1.1 Extract area grouping and area chunk construction from `src/synthesis-chunks.ts`.
- [x] 1.2 Preserve public planner behavior and existing chunk metadata.

## 2. Verification

- [x] 2.1 Run targeted synthesis chunk planning tests.
- [x] 2.2 Run `npm run ci`.
- [x] 2.3 Run `npm run spec:validate` and `openspec validate extract-synthesis-chunk-areas`.
- [x] 2.4 Run `node dist/cli.js revalidate candidate-001 --json`.
