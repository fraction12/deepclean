## Design

Dogfood should be repeatable enough to run before beta releases but source-safe enough for public repo artifacts.

### Matrix

Required beta matrix:

- Deepclean itself.
- LightningITB.
- At least two additional codebases with different shapes.
- One generated/noisy repo or fixture with build artifacts, vendored files, and ignored directories.

### Workflow

Each repo should run:

- doctor/status before scan;
- scan with synthesis where safe;
- report;
- next/show for top candidate;
- plan/handoff for at least one candidate;
- revalidate where state exists;
- prune dry-run;
- status after work.

### Scorecard

Scorecards must avoid private source excerpts. They should record counts, timings, diagnostics, false-positive notes, evidence quality, ranking quality, report usability, and follow-up risks.

### Stability Scenarios

Add fixtures or dogfood cases for stale artifacts, malformed provider output, provider timeout, duplicate IDs, partial writes, generated-file noise, dirty tree provenance, and old alpha state.
