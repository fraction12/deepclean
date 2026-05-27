# Add Semantic Feature Mapping

## Why

Deepclean can already gather evidence, produce maintainability candidates, and write agent-ready plans. The next gap versus ClawPatch is the repository mental model: Deepclean needs durable feature/work-unit records so reports and future synthesis can reason about boundaries instead of loose file metrics alone.

## What Changes

- Add first-class semantic feature records under `.deepclean/features/`.
- Map TypeScript, JavaScript, Python, package script, route/component/module, test-suite, and config work units from local files.
- Attach owned files, context/test files, tags, confidence, and inferred verification commands to each feature.
- Add `deepclean map` for refreshing feature records without producing candidates.
- Include feature counts in scan/run/status JSON so automation can detect whether the map is useful.

## Non-Goals

- Do not port every ClawPatch language mapper in this change.
- Do not use a provider/agent to enrich feature maps yet.
- Do not change source code or create PRs from feature records.
