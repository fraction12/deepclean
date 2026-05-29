## Design

The reviewer pack should remain vendored, reproducible, and evidence-bound. The improvement is sharper operational pressure, not access to private local skills.

### Candidate Readiness

Accepted synthesized candidates should include:

- readiness: `fix-ready`, `split-needed`, `design-needed`, `needs-human`, or `defer`;
- owned files and context files;
- expected behavior;
- proof required;
- verification command hints;
- non-goals;
- boundaries the next agent should not touch;
- split children when the parent is too broad;
- confidence downgrade reasons.

### Rejection And Downgrade

The validator should reject or downgrade candidates that are unsupported by evidence, duplicate an existing finding, too broad for a PR, not locally verifiable, or unsafe to hand to a patch worker.

### Provenance

Each synthesis attempt should record reviewer IDs, reviewer rubric versions, prompt template version, evidence manifest, accepted/rejected counts, and validation diagnostics.

### Verification

Quality fixtures should test vague model output, unsupported candidates, broad candidates that need splits, duplicate candidates, and PR-sized candidates with usable proof.
