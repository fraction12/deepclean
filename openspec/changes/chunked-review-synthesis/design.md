# Design

`deepclean scan` still collects evidence, features, and local candidates for the full repo first.

Before calling Codex, Deepclean estimates whether the full synthesis bundle is too large or broad. If it is, it groups evidence, local candidates, and features by repository area, then splits oversized groups into bounded packets.

Each packet receives:

- its own synthesis scope block in the prompt
- scoped evidence
- scoped feature map entries
- scoped local metric candidates as routing signals

The run persists a single aggregate synthesis attempt for the scan. That ledger records `runtime.synthesisMode = "chunked"`, `chunkCount`, per-chunk counts, aggregate prompt bytes, aggregate validation records, and diagnostics. Accepted candidates point back to the aggregate attempt so `deepclean explain` still works against the latest run-level synthesis file.

Metric candidates remain as fallback candidates. Chunked synthesis does not delete them; ranking continues to prefer evidence-backed model synthesis over weak local metrics.
