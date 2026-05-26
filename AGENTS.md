# AGENTS.md

## Project

This repo is for `deepclean`, a Clawpatch-style CLI for improving working-but-sloppy AI-generated codebases.

Use OpenSpec for planning before implementation:

```bash
openspec list
openspec new change "<change-name>"
openspec status --change "<change-name>"
openspec validate "<change-name>"
```

## Product Direction

- Report-first cleanup system, not an autonomous repo-wide rewrite tool.
- Local codebase is the source of truth.
- Web research may inform framework/library best practices, but private source code must not be pasted into web search or public services.
- Every finding should have durable state, evidence, confidence, impact, effort, and an explicit handoff path.
- Fix execution is out of scope for the MVP; future fixes should be one candidate at a time with verification evidence.

## Engineering Rules

- TypeScript, ESM, strict mode.
- Prefer deterministic scans before model review.
- Keep provider execution behind adapters.
- Do not add network calls without an explicit privacy model.
- Do not implement product behavior before there is an OpenSpec change proposal.
