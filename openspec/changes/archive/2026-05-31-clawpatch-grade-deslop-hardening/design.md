## Approach

Deepclean should copy the Clawpatch posture, not its bug domain:

1. Map first: local repository structure has to be represented accurately enough that model synthesis can trust graph evidence.
2. Evidence first: model candidates must cite durable evidence IDs and local analyzer facts.
3. Queue second: reports should make the next agent action obvious and suppress low-signal metric clutter from the top queue.
4. Explicit handoff: plans should be scoped, deduped, and verification-led.

## Non-Goals

- No automated source mutation.
- No `fix`, `recheck`, `open-pr`, package rename, or npm publish work.
- No remote code upload or web research over private source.

## Implementation Notes

- TS projects often use NodeNext-style imports that end in `.js` in source but resolve to `.ts`, `.tsx`, `.mts`, or `.cts` files. The mapper must resolve those source equivalents before declaring graph evidence weak.
- Semgrep is optional and disabled by default. If enabled and unavailable, Deepclean records a diagnostic and continues.
- Report recommendations may reorder the agent queue without deleting raw candidates from the durable record.
- Plan file references should be unique by path and line range, then capped so theme plans remain bounded.
