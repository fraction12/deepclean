# Public Alpha Dogfood Scorecard - 2026-05-24

## Repos

- Deepclean: self-scan validates CLI behavior, local evidence, Codex-compatible synthesis, clusters, plans, and reports. Latest public-alpha self-run found 33 evidence records, 27 candidates, and 7 themes, with `theme-001` recommended first.
- Lightning ITB: large mixed app run validated Python, Next-style import resolution, noise control, and model-first ranking.
- Relay: backend/tooling repo run validated readable IDs, report generation, plan generation, and non-git fallback behavior.

## Scorecard

- False positives: pass for public alpha. Weak local metric findings are capped; model findings require evidence IDs.
- Evidence strength: pass. Reports cite local evidence and preserve `.deepclean/evidence` records.
- Ranking quality: pass. Model-synthesized findings rank ahead of raw local metric findings at the same priority.
- Theme usability: pass with caveat. Broad themes are now split where possible and marked `too-broad` when not agent-ready.
- Report readability: pass. Reports now include `Start Here`, top themes, warnings, and suggested plan targets.
- Privacy behavior: pass. Source samples are redacted by default; Codex synthesis is explicit.
- Handoff readiness: pass. Candidate and bounded theme plans generate Codex-ready packets.

## Public Alpha Caveats

- Package has not been published to npm yet.
- Deepclean remains report-first; no source mutation or autofix command is included.
- CodeQL/Semgrep integrations are still future work, not public-alpha scope.
