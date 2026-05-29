## Design

Revalidation should be narrower than a full scan. It starts from a stable finding, reads its current evidence anchors and graph neighborhood, recollects only what is needed, and decides whether the original claim remains true.

### Revalidation Record

Each record should include:

- target finding ID and optional observation ID;
- prior lifecycle state;
- evidence bundle ID;
- changed files or dirty-state provenance;
- verification run IDs when related;
- outcome;
- confidence;
- rationale;
- replacement finding ID when superseded;
- next recommended action.

### Outcomes

- `resolved`: original issue is no longer present.
- `partially-resolved`: part of the issue changed but meaningful debt remains.
- `still-open`: original issue remains.
- `superseded`: a more accurate finding now owns the concern.
- `stale`: evidence is too old or target cannot be checked.
- `inconclusive`: evidence was collected but the system cannot decide.
- `needs-human`: the system refuses to make a judgment.

### Proof Rules

A passed verification command is not enough to mark a finding resolved. Resolution requires revalidation evidence that addresses the original candidate.

### Verification

Fixtures should cover fixed, unchanged, partially fixed, superseded, missing file, stale evidence, and inconclusive model output cases.
