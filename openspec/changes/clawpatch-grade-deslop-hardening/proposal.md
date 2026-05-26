## Why

Deepclean is useful as a report-and-plan tool, but the latest dogfood run exposed trust gaps that keep it below the Clawpatch bar. Clawpatch works because it maps the repository first, keeps evidence durable, validates model claims, and gives agents explicit next actions. Deepclean needs the same discipline for cleanup work: a trustworthy code graph, optional analyzer orchestration, cleaner ranking, and plans that do not hand agents repetitive noise.

This change hardens the "deslop" loop without introducing source mutation, automated fixing, naming changes, publishing, or PR automation.

## What Changes

- Fix TypeScript/JavaScript import graph resolution for emitted ESM import specifiers such as `./types.js` that point at `.ts` source files.
- Collect more complete TS/JS import relationships, including re-exports, dynamic imports, and CommonJS `require(...)` calls.
- Add optional Semgrep SARIF orchestration so Deepclean can run an established analyzer when configured, not only ingest files users created separately.
- Improve agent recommendations so model-synthesized findings and bounded themes lead the queue over weak one-metric local findings.
- Dedupe and cap file references in plans and handoffs so generated packets stay focused.
- Add tests and OpenSpec requirements for mapper trust, analyzer orchestration, and agent-ready signal quality.

## Impact

- Evidence adapters and config schema.
- Candidate/report recommendation ranking.
- Plan rendering and file reference handling.
- README, changelog, and OpenSpec deltas.

No source-code fix loop, branch creation, publishing, external posting, or PR automation is introduced.
