# Architecture Policy, Cycles, And Progress

## Why

Deepclean now has a shared architecture graph and fitness helper, but it still lacks the next product layer: repo-defined architecture policy, deterministic cycle evidence, and progress output that says which architecture metric moved.

This change builds that layer without turning Deepclean into a broad rewrite engine.

## What Changes

- Add architecture policy configuration for layers and allowed imports.
- Annotate graph nodes and edges with layer ownership when policy exists.
- Detect local dependency cycles from the architecture graph.
- Emit evidence for dependency cycles and architecture boundary violations.
- Generate local candidates for those new evidence kinds.
- Surface revalidation fitness deltas in status progress summaries.

## Non-Goals

- No auto-generation of policy files.
- No blocking CI gate for policy violations yet.
- No visual graph renderer.
- No multi-candidate autonomous migration.

## Success Bar

A repository can configure architecture layers and import rules, run `deepclean scan`, and receive deterministic evidence/candidates for cycles and policy violations. If fixes reduce line, dependency, cycle, or forbidden-edge pressure, `deepclean status` reports the metric movement.

## Capabilities

### Modified Capabilities

- `evidence-engine-ingestion`: graph cycle and architecture policy evidence.
- `maintainability-candidates`: candidates for cycles and policy violations.
- `project-state`: architecture policy config.
- `reporting-and-handoff`: progress output includes fitness deltas.

## Impact

- Config schema/defaults.
- Architecture graph policy and cycle helpers.
- Evidence and candidate generation.
- Progress summary and tests.
