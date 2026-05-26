## 1. Mapper Trust

- [x] 1.1 Resolve TS/JS emitted ESM specifiers like `./foo.js` to local `.ts`, `.tsx`, `.mts`, and `.cts` source files.
- [x] 1.2 Include re-exports, dynamic imports, and CommonJS `require(...)` in TS/JS graph evidence.
- [x] 1.3 Add a regression test proving local graph edges are produced for TS source that imports `.js` specifiers.

## 2. Analyzer Orchestration

- [x] 2.1 Add optional Semgrep SARIF orchestration behind config.
- [x] 2.2 Normalize Semgrep output through the same SARIF evidence path as file ingestion.
- [x] 2.3 Record diagnostics when Semgrep is enabled but unavailable.

## 3. Agent Queue Quality

- [x] 3.1 Prefer model-synthesized candidates in report recommendations when they have valid evidence.
- [x] 3.2 Keep weak one-metric local findings out of the start-here slot when stronger findings exist.
- [x] 3.3 Add focused tests for report recommendation ranking.

## 4. Plan Quality

- [x] 4.1 Dedupe repeated file references in candidate and theme plans.
- [x] 4.2 Cap broad plan file lists so agent packets stay focused.
- [x] 4.3 Add a regression test for deduped plan output.

## 5. Verification

- [x] 5.1 Run typecheck, tests, build, release check, and OpenSpec validation.
- [x] 5.2 Dogfood Deepclean on itself and confirm graph evidence is no longer zero-edge.
