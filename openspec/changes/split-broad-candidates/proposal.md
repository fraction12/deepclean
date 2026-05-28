# Split Broad Candidates

## Why

Deepclean can now run bounded fix attempts, retry them, verify them, and block PRs when proof is weak. Dogfooding exposed the next failure mode: broad candidates such as large functions, large files, dependency hotspots, and shallow-wrapper clusters are not always PR-sized. A worker can improve the code, but revalidation still sees the broader parent smell and correctly blocks the PR.

Deepclean needs an explicit decomposition layer so broad candidates become smaller child candidates before patch execution.

## What Changes

- Add `deepclean split <candidate-or-finding-id>` to decompose a broad parent candidate into bounded child candidates.
- Persist parent/child candidate relationships in candidate and finding state.
- Mark split parents as replaced by child candidates so reports and work queues do not keep sending agents at the same broad parent.
- Generate child candidates with owned line ranges, clear scope, expected direction, and normal verification commands.
- Make `deepclean work` refuse broad splittable parent candidates with a direct instruction to run `deepclean split` first.
- Treat child candidates as approved slices during fix execution and revalidation.

## Non-Goals

- No automatic repo-wide cleanup.
- No claim that resolving one child fully resolves the parent.
- No model-only decomposition in the first pass; local deterministic slices are enough.
- No changes outside existing candidate/finding lifecycle storage.

## Success Bar

After a scan finds a broad candidate, this works:

```bash
deepclean split candidate-004
deepclean work candidate-057 --branch chore/deepclean-candidate-057 --apply --verification "npm test" --pr
```

The split command should produce child candidates small enough for one PR each. The parent candidate remains traceable, but fix execution targets the child.

## Capabilities

### New Capabilities

- `candidate-decomposition`: split broad candidates into parent/child candidate graphs.

### Modified Capabilities

- `agent-first-cli`: add the `split` command and route broad fix targets toward decomposition.
- `maintainability-candidates`: persist decomposition metadata on candidates and findings.
- `project-state`: preserve child candidate identity, observations, and lifecycle events.
- `fix-execution`: permit child candidates as approved fix slices.

## Impact

- CLI help and command routing.
- Candidate and finding schemas.
- Latest candidate state updates.
- Report/fix queues through parent status changes.
- Tests and OpenSpec validation.
