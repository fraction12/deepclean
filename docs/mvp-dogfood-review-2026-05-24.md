# MVP Dogfood Review - 2026-05-24

Deepclean was dogfooded against two local repositories after the report-first MVP shipped.

## Runs

### LightningITB

- Report: `/Volumes/MacSSD/Projects/LightningITB/.deepclean/reports/report-20260524140809-447ba8c8.md`
- JSON: `/Volumes/MacSSD/Projects/LightningITB/.deepclean/reports/report-20260524140809-447ba8c8.json`
- Result: 341 evidence records, 128 candidates, 4 themes, 8 Codex-synthesized candidates.
- Top candidate: `dc-001 Backend job orchestration needs a named service boundary`.
- Useful plan: `/Volumes/MacSSD/Projects/LightningITB/.deepclean/plans/plan-20260524140827-55dd4183.json`
- Notes: This run exposed noisy raw local evidence outranking stronger synthesized findings. Candidate ranking was tightened so model-synthesized findings with strong evidence rank ahead of raw metric findings at the same priority.

### Relay

- Report: `/Volumes/MacSSD/Projects/Relay/.deepclean/reports/report-20260524143952-f3f23d72.md`
- JSON: `/Volumes/MacSSD/Projects/Relay/.deepclean/reports/report-20260524143952-f3f23d72.json`
- Result: 35 evidence records, 32 candidates, 3 themes, 3 Codex-synthesized candidates.
- Top candidate: `candidate-001 Shell UI, pilot, formatter, and index code lack a stable CLI presentation boundary`.
- Useful plans:
  - `/Volumes/MacSSD/Projects/Relay/.deepclean/plans/plan-20260524143952-72391a07.json`
  - `/Volumes/MacSSD/Projects/Relay/.deepclean/plans/plan-20260524143952-00264b77.json`
- Notes: This run verified the readable ID change: candidates now use `candidate-001` and themes use `theme-001`. Relay is not currently a git repository, so git history evidence was unavailable, but file metrics, duplication, graph, structure, test discovery, and synthesis still produced actionable output.

## Review

- False positives: acceptable for MVP. Local metric candidates are still noisier than synthesized candidates, but ranking now puts the strongest model-backed findings first.
- Missing evidence: no blocking gaps. Both useful top findings cite multiple evidence IDs and concrete files.
- Ranking quality: good enough for private MVP. Lightning exposed a ranking issue; the rerun on Relay confirms synthesized architecture findings now lead the report.
- Handoff quality: usable. Generated plans include task framing, ordered steps, constraints, and verification commands.
- Agent usability: sufficient. Reports and plans are persisted as JSON and markdown, and IDs are now readable enough for command use.

## Requirement Gaps Found

The remaining gaps are public-alpha hardening, not MVP blockers:

- installable CLI packaging and smoke tests
- global flag ergonomics before command names
- report start-here UX
- configurable reviewer packs
- privacy/trust documentation
- dogfood scorecard and release checklist

Those items are tracked separately in `openspec/changes/prepare-public-alpha/`.
