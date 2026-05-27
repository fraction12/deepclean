# Privacy And Trust

Deepclean public alpha is report-first. It does not edit application source code.

## Writes

Deepclean writes state and artifacts under `.deepclean/` in the target repository:

- `.deepclean/config.json`
- `.deepclean/runs/`
- `.deepclean/evidence/`
- `.deepclean/synthesis/`
- `.deepclean/candidates/`
- `.deepclean/clusters/`
- `.deepclean/reports/`
- `.deepclean/plans/`
- `.deepclean/handoffs/`
- `.deepclean/triage/`

The complete operating-loop state model also reserves these directories:

- `.deepclean/findings/` — stable finding records and current lifecycle state.
- `.deepclean/observations/` — run-specific observations linked to stable findings.
- `.deepclean/lifecycle/` — append-only lifecycle events.
- `.deepclean/revalidations/` — recheck decisions and supporting diagnostics.
- `.deepclean/ci/` — CI policy results and generated artifact references.
- `.deepclean/locks/` — local writer-lock records.
- `.deepclean/retention/` — prune dry-run and applied retention manifests.
- `.deepclean/fixes/` — future fix previews, verification records, and local patch metadata.

Add `.deepclean/` to `.gitignore` unless a repo deliberately wants to share reports.

## Local Evidence

`deepclean scan` reads source files and repository metadata locally. It records structured evidence such as file metrics, duplicate windows, import graph summaries, TypeScript/Python structure, git churn, and test-discovery signals.

## Codex Synthesis

`deepclean scan` invokes the local `codex` command in read-only mode by default after local evidence collection. By default the prompt includes structured evidence and redacts source samples. It does not dynamically load OpenClaw skills or arbitrary local agent instructions; the built-in reviewer pack is recorded in candidate provenance.

Each provider call writes a synthesis attempt ledger under `.deepclean/synthesis/`. The ledger records the prompt version, provider/runtime settings, reviewer IDs, evidence manifest, prompt size, accepted/rejected candidate counts, validation diagnostics, and rejected draft metadata. It does not store the full prompt text.

Model-generated candidates are validated before persistence. Deepclean rejects drafts that cite missing evidence IDs, reference files outside the cited evidence, use invalid or out-of-bounds line ranges, or include optional quotes that do not match local source.

Use `--allow-source-in-model` only when the target repo and configured provider are allowed to receive source excerpts. This may include snippets from files that triggered local evidence.

Provider execution is disabled by `--evidence-only`, `--offline`, `--local-only`, or `reviewSynthesis.offline`. `reviewSynthesis.privacyMode` may be `local-only`, `metadata`, or `source-ok`; `metadata` is the default and keeps source excerpts out unless the user explicitly allows source and sets a positive excerpt budget.

## Generated Record Sensitivity

Treat `.deepclean/` as private by default. Records may contain repository-relative paths, absolute state paths in diagnostics, source excerpts, analyzer summaries, model prompt metadata, verification output paths, patch previews, and notes written by humans or agents.

Use `deepclean scrub --json` or `deepclean export --source-safe --json` before producing a support artifact. The source-safe export keeps actionable IDs, categories, priorities, verification commands, evidence IDs, and repository-relative paths, while omitting source excerpts, provider prompts, absolute state paths, generated handoff prose, and generated plan prose.

## Network

Deepclean does not do web research in public alpha. `privacy.allowWebResearch` is reserved for a future explicit feature and defaults to `false`.
