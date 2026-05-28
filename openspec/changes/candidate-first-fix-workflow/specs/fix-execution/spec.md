## ADDED Requirements

### Requirement: Fix execution config gate
The system SHALL refuse all `fix` and `work` workflows unless `fixExecution.enabled` is true in the project Deepclean config.

#### Scenario: Fix execution disabled
- **WHEN** an agent runs `deepclean fix candidate-003 --dry-run --json` while `fixExecution.enabled` is false
- **THEN** Deepclean refuses before planning, patching, branch creation, or PR side effects and returns a structured `fix_execution_disabled` diagnostic

### Requirement: Candidate-first fix execution
The system SHALL execute fixes against exactly one selected candidate, stable finding, or approved bounded slice.

#### Scenario: User fixes one candidate
- **WHEN** an agent runs `deepclean fix candidate-003 --apply --verification "make test" --json`
- **THEN** Deepclean creates one fix attempt for `candidate-003`, applies at most one bounded patch, and records the selected candidate in the attempt state

#### Scenario: User tries to batch unrelated candidates
- **WHEN** an agent requests a fix workflow for multiple unrelated candidates
- **THEN** Deepclean refuses and instructs the agent to run separate candidate-first attempts

### Requirement: Fix plan before patch
The system SHALL require a fix plan before source mutation.

#### Scenario: Applied fix starts
- **WHEN** an agent runs `deepclean fix candidate-003 --apply`
- **THEN** Deepclean loads or generates a plan containing owned files, expected behavior, non-goals, verification commands, refusal conditions, and a why-this-is-safe note before invoking a patch worker

### Requirement: Candidate-owned write scope
The system SHALL restrict patch writes to candidate-owned files, feature-owned files, attached tests, or explicitly approved expanded files.

#### Scenario: Patch edits out-of-scope file
- **WHEN** the patch worker modifies a file outside the allowed write scope
- **THEN** Deepclean records a scope failure, blocks PR-ready output, and marks the attempt `needs_human` unless the file was explicitly approved

### Requirement: Verification command required
The system SHALL require verification for applied fixes and PR workflows.

#### Scenario: Verification is missing
- **WHEN** an agent runs `deepclean fix candidate-003 --apply --json` without a verification command and the current plan has no approved verification command
- **THEN** Deepclean refuses before source mutation and returns a structured missing-verification diagnostic

### Requirement: Before and after evidence
The system SHALL store before and after evidence for each applied fix attempt.

#### Scenario: Fix attempt completes
- **WHEN** Deepclean applies a patch and runs revalidation
- **THEN** it persists the pre-fix candidate evidence, post-fix evidence or revalidation result, changed files, verification results, and lifecycle events

### Requirement: Revalidation after patch
The system SHALL revalidate the selected candidate after patching when requested by `--revalidate` or required by the `work --pr` workflow.

#### Scenario: PR workflow runs
- **WHEN** an agent runs `deepclean work candidate-003 --apply --branch chore/deepclean-candidate-003 --pr --verification "make test"`
- **THEN** Deepclean runs candidate revalidation after the patch and before PR creation

### Requirement: Fix outcome classification
The system SHALL classify fix attempts as `resolved`, `partially-resolved`, `still-open`, `superseded`, or `needs_human`.

#### Scenario: Candidate evidence disappears
- **WHEN** verification passes and revalidation no longer finds current evidence for the selected candidate
- **THEN** Deepclean records the outcome as `resolved`

#### Scenario: Verification passes but candidate remains
- **WHEN** verification passes but revalidation reports the selected candidate still exists
- **THEN** Deepclean records the outcome as `still-open` and blocks PR-ready success output

#### Scenario: Candidate is improved but not gone
- **WHEN** verification passes and revalidation reports the selected candidate has narrowed or split but not fully disappeared
- **THEN** Deepclean records `partially-resolved` and includes remaining risk and follow-up guidance

### Requirement: Broad candidate refusal
The system SHALL refuse applied fixes for broad or ambiguous architecture candidates unless a clean bounded slice is available.

#### Scenario: Architecture candidate is too broad
- **WHEN** an agent runs `deepclean fix candidate-architecture-broad --apply`
- **THEN** Deepclean refuses source mutation and produces a plan-only or slice-selection diagnostic

### Requirement: Bounded retry with remaining evidence
The system SHALL support bounded automated retries that feed verification failures or remaining candidate evidence back into the same fix branch.

#### Scenario: First patch fails verification
- **WHEN** the first patch stays in scope but verification fails
- **THEN** Deepclean may run another attempt, up to `fixExecution.maxAttempts`, with the verification failure output included in the worker context and records every attempt

#### Scenario: First patch leaves candidate still open
- **WHEN** the first patch stays in scope, passes verification, but revalidation reports `still-open` or `partially-resolved`
- **THEN** Deepclean may run another attempt in the same branch with prior attempt results and remaining revalidation evidence included in the worker context

#### Scenario: Retry limit is exhausted
- **WHEN** retries reach `fixExecution.maxAttempts` and the candidate is still not resolved
- **THEN** Deepclean marks the workflow `needs_human`

### Requirement: Patch worker progress watchdog
The system SHALL monitor local patch workers with an idle-progress watchdog and a hard execution ceiling.

#### Scenario: Worker keeps making meaningful progress
- **WHEN** a local patch worker reaches its idle timeout but Deepclean observes changed repo state since the previous check
- **THEN** Deepclean resets the idle clock and lets the worker continue until completion or the hard ceiling

#### Scenario: Worker is chatty after landing an in-scope patch
- **WHEN** a local patch worker emits output after Deepclean has already observed repo-state progress but does not make further repo-state progress before the idle timeout
- **THEN** Deepclean terminates the worker through the idle watchdog instead of treating output-only chatter as meaningful progress

#### Scenario: Worker idles after landing an in-scope patch
- **WHEN** a local patch worker reaches its idle timeout without new progress after modifying only candidate-owned files
- **THEN** Deepclean terminates the worker, records a recoverable timeout diagnostic, and continues with Deepclean-owned verification and revalidation

#### Scenario: Worker idles without landing work
- **WHEN** a local patch worker reaches its idle timeout without new progress and no candidate-owned file changes exist
- **THEN** Deepclean terminates the worker and marks the attempt failed

#### Scenario: Worker exceeds hard ceiling
- **WHEN** a local patch worker runs longer than the configured hard ceiling, which defaults to 30 minutes
- **THEN** Deepclean terminates the worker and classifies the current repo state through the same timeout recovery rules

### Requirement: PR gate
The system SHALL create or prepare a pull request only after candidate scope, verification, and revalidation gates pass.

#### Scenario: PR requested with passing proof
- **WHEN** `deepclean work candidate-003 --pr` has passed verification, in-scope changes, and revalidation outcome `resolved`
- **THEN** Deepclean may prepare or open a PR according to explicit user flags and persists a PR-ready summary

#### Scenario: PR requested with failing proof
- **WHEN** verification fails, revalidation is missing, revalidation says `still-open`, or changed files exceed scope
- **THEN** Deepclean blocks PR creation and records the blocking reason
