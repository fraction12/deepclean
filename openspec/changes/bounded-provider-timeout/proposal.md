# Bounded Provider Timeout

## Why

Dogfooding `node dist/cli.js scan --json --timeout 180` on Deepclean showed the scan could remain silent beyond the configured provider timeout and leave only a stale writer lock after interruption. The existing timeout recovery path handles cooperative providers, but a provider process that ignores termination can keep the scan from finishing and prevent local evidence from being persisted.

## What Changes

- Make synthesis provider timeout handling bounded even when the provider child process ignores the first termination signal.
- Preserve the existing partial-success behavior: local evidence and candidates are still written, model candidates are skipped, and `codex_synthesis_timeout` is recorded.
- Add regression coverage for an uncooperative provider process.

## Non-Goals

- No change to synthesis prompts, candidate ranking, reviewer packs, or privacy policy.
- No streaming progress output in this slice.
- No change to default timeout values.

## Success Bar

`deepclean scan --synthesize --timeout 1 --json` exits successfully against a provider fixture that ignores `SIGTERM`, persists local scan artifacts, and emits a `codex_synthesis_timeout` diagnostic.

## Capabilities

### Modified Capabilities

- `review-synthesis`: provider timeouts must complete boundedly while preserving local evidence.

## Impact

- Synthesis subprocess timeout handling.
- CLI regression tests for provider timeout recovery.
