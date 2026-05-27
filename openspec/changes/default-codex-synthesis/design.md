## Approach

Deepclean should treat synthesis as the normal product path and deterministic scanning as the evidence layer. The implementation keeps the ordering intact:

1. Discover and scope files.
2. Map semantic features and collect local evidence.
3. Run Codex synthesis over the evidence bundle by default.
4. Rank candidates, attach durable finding IDs, build themes, and write artifacts.

## CLI Behavior

- `deepclean scan` requests synthesis by default through `reviewSynthesis.enabled`.
- `deepclean ci` uses the same scan default so PR workflows produce synthesized artifacts unless explicitly disabled.
- `--synthesize` remains accepted for backward compatibility and explicitness.
- `--evidence-only` is added as product language for deterministic-only analysis.
- `--offline` and `--local-only` continue to disable provider execution.

## Privacy

The default remains metadata-only. Synthesis receives structured evidence and redacted data by default; source excerpts still require `--allow-source-in-model` with a positive excerpt budget or `privacyMode: source-ok`.

## Failure Handling

Provider failures remain non-destructive for ordinary scans: Deepclean persists local evidence and diagnostics so the run can be inspected. CI policy can still require synthesis explicitly when a workflow wants provider failure to block.

## Compatibility

Existing users who already pass `--synthesize` see the same behavior. Users who relied on local-only default scans can use `--evidence-only`, `--offline`, `--local-only`, or config-level `reviewSynthesis.offline`.
