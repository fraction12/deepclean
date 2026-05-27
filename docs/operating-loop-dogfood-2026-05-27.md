# Operating Loop Dogfood - 2026-05-27

## Deepclean Self-Dogfood

- Synthesized scan: passed with local evidence preserved.
- Provider behavior: synthesis requested; provider timed out and emitted `codex_synthesis_timeout`.
- Local candidates: 47.
- Synthesized candidates: 0 because the provider timed out.
- Report generation: passed.
- Revalidation: passed with outcome `unchanged`.
- Prune dry-run: passed, 20 candidate deletions, 2 blocked paths.
- CI mode: passed, 0 blocking findings.

## Larger Private Repo Source-Safe Pass

- Mode: offline source-safe dogfood.
- Evidence records: 378.
- Candidates: 121.
- Cleanup themes: 17.
- Provider calls: disabled.
- Source-safe export: passed.
- Stored details: source-safe counts only; no source excerpts, absolute local paths, prompts, or private report contents are included here.

## Notes

- Provider timeout degraded correctly into diagnostics while preserving local findings.
- Retention dry-run produced a reviewable manifest before deletion.
- CI gate remained usable after the full operating-loop changes.
