# Privacy And Trust

Deepclean public alpha is report-first. It does not edit application source code.

## Writes

Deepclean writes state and artifacts under `.deepclean/` in the target repository:

- `.deepclean/config.json`
- `.deepclean/runs/`
- `.deepclean/evidence/`
- `.deepclean/candidates/`
- `.deepclean/clusters/`
- `.deepclean/reports/`
- `.deepclean/plans/`
- `.deepclean/handoffs/`
- `.deepclean/triage/`

Add `.deepclean/` to `.gitignore` unless a repo deliberately wants to share reports.

## Local Evidence

`deepclean scan` reads source files and repository metadata locally. It records structured evidence such as file metrics, duplicate windows, import graph summaries, TypeScript/Python structure, git churn, and test-discovery signals.

## Codex Synthesis

`deepclean scan --synthesize` invokes the local `codex` command in read-only mode. By default the prompt includes structured evidence and redacts source samples. It does not dynamically load OpenClaw skills or arbitrary local agent instructions; the built-in reviewer pack is recorded in candidate provenance.

Use `--allow-source-in-model` only when the target repo and configured provider are allowed to receive source excerpts. This may include snippets from files that triggered local evidence.

## Network

Deepclean does not do web research in public alpha. `privacy.allowWebResearch` is reserved for a future explicit feature and defaults to `false`.
