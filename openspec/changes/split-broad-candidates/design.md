# Design

## Parent And Child Candidates

A decomposed candidate gets explicit relationship metadata:

- parent candidates store `childCandidateIds`
- child candidates store `parentCandidateId`, `sequence`, `total`, and `strategy`
- both parent and child keep the same evidence trail so the generated slice remains auditable

The parent is marked `superseded` after children are written. This does not mean the smell is fixed; it means the active work queue has been replaced by smaller children.

## Split Strategies

Initial deterministic strategies:

- `large-function-slices`: split a large function into line-bounded responsibility slices.
- `large-file-slices`: split a large file around existing local evidence in that file.
- `dependency-hotspot-slices`: split a dependency hotspot into incoming and outgoing dependency review slices.
- `wrapper-slices`: split shallow-wrapper clusters into bounded wrapper groups.

Each child candidate should be small enough for one branch and one PR.

## Fix Routing

`deepclean fix` and `deepclean work` should refuse broad splittable parents before invoking the worker. The error should tell the user to run `deepclean split <candidate>` and then target one child candidate.

Child candidates are treated as approved slices. They still require:

- clean or explicitly allowed dirty worktree
- allowed file scope
- verification
- revalidation
- PR proof gates

## Revalidation

Generated child candidates are slice targets. They may not be rediscovered by raw metric scans after code changes. For child findings, absence of the exact child candidate after a fresh scan is acceptable evidence that the slice is no longer current. The parent may remain open or reappear as a broader follow-up.

## State

The split command updates the latest candidates file, findings, observations, and lifecycle events. It does not create a new scan run.

This keeps the split auditable while preserving the latest evidence snapshot that justified the parent.
