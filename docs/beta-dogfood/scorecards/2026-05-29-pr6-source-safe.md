# Beta Dogfood Scorecard - 2026-05-29 PR6

All runs used isolated scratch state under `/tmp` and evidence-only mode. The checked-in scorecard is source-safe: it records counts, timings, diagnostic codes, and quality notes only.

## Deepclean Self

- Matrix Slot: `deepclean`
- Gate: `pass`
- Source Safety: `pass`
- Mode: `evidence-only`
- State Location: `isolated-scratch`

### Command Results

- Doctor: `pass` in `628ms`
- Initial status: `pass` in `601ms`
- Scan: `pass` in `858ms`
- Report: `pass` in `611ms`
- Next/show: `pass` in `1199ms`
- Plan/handoff: `pass` in `1185ms`
- Revalidate: `pass` in `907ms`
- Prune dry-run: `pass` in `607ms`
- Final status: `pass` in `656ms`

### Counts

- Source files scanned: `40`
- Evidence records: `120`
- Candidates: `53`
- Themes: `7`
- Features: `44`
- Diagnostics: `config_missing`, `no_state`, `synthesis_skipped_by_policy`, `stale_state`, `missing_latest_artifacts`

### Quality Scores

- Evidence quality: `pass` - local evidence produced a broad candidate queue without source excerpts.
- Ranking quality: `pass` - `next` returned a usable top candidate for show/plan/handoff.
- Report usability: `pass` - report, plan, and handoff commands completed.
- False-positive risk: `medium` - evidence-only local metrics need human review before fixes.
- Stale-state handling: `pass` - revalidation and final status completed with stale-state diagnostics visible.
- Generated-file handling: `pass` - default ignored/generated paths are covered by fixture tests.
- Provider-failure handling: `not-exercised` - provider calls were disabled for source safety.

### Residual Risks

- Provider-backed ranking still needs a metadata-synthesis pass before public beta if source policy allows it.

## LightningITB

- Matrix Slot: `lightningitb`
- Gate: `pass`
- Source Safety: `pass`
- Mode: `evidence-only`
- State Location: `isolated-scratch`

### Command Results

- Doctor: `pass` in `592ms`
- Initial status: `pass` in `591ms`
- Scan: `pass` in `1017ms`
- Report: `pass` in `640ms`
- Next/show: `pass` in `1227ms`
- Plan/handoff: `pass` in `1216ms`
- Revalidate: `pass` in `1137ms`
- Prune dry-run: `pass` in `636ms`
- Final status: `pass` in `720ms`

### Counts

- Source files scanned: `242`
- Evidence records: `408`
- Candidates: `124`
- Themes: `21`
- Features: `251`
- Diagnostics: `config_missing`, `no_state`, `synthesis_skipped_by_policy`, `stale_state`, `missing_latest_artifacts`

### Quality Scores

- Evidence quality: `pass` - local evidence produced inspectable counts at larger-repo scale.
- Ranking quality: `pass` - `next` selected a candidate accepted by show/plan/handoff.
- Report usability: `pass` - report and handoff workflow completed.
- False-positive risk: `medium` - private app results were not source-reviewed for this scorecard.
- Stale-state handling: `pass` - revalidation and final status completed.
- Generated-file handling: `watch` - private repo noise was not committed; synthetic fixture covers generated noise directly.
- Provider-failure handling: `not-exercised` - provider calls were disabled for source safety.

### Residual Risks

- Evidence-only mode avoids source leakage but does not prove provider synthesis quality on this private repository.

## Relay

- Matrix Slot: `additional-1`
- Gate: `pass`
- Source Safety: `pass`
- Mode: `evidence-only`
- State Location: `isolated-scratch`

### Command Results

- Doctor: `pass` in `625ms`
- Initial status: `pass` in `614ms`
- Scan: `pass` in `683ms`
- Report: `pass` in `603ms`
- Next/show: `pass` in `1194ms`
- Plan/handoff: `pass` in `1215ms`
- Revalidate: `pass` in `708ms`
- Prune dry-run: `pass` in `599ms`
- Final status: `pass` in `640ms`

### Counts

- Source files scanned: `16`
- Evidence records: `37`
- Candidates: `31`
- Themes: `3`
- Features: `20`
- Diagnostics: `config_missing`, `git_unavailable`, `git_history_unavailable`, `no_state`, `synthesis_skipped_by_policy`, `stale_state`, `missing_latest_artifacts`

### Quality Scores

- Evidence quality: `pass` - non-git fallback still produced evidence and candidates.
- Ranking quality: `pass` - top candidate flowed through show/plan/handoff.
- Report usability: `pass` - report and handoff workflow completed.
- False-positive risk: `medium` - local candidates remain review-first.
- Stale-state handling: `pass` - revalidation and status completed despite git-history diagnostics.
- Generated-file handling: `watch` - generated-noise behavior covered by the synthetic fixture.
- Provider-failure handling: `not-exercised` - provider calls were disabled for source safety.

### Residual Risks

- Git unavailable diagnostics are acceptable for beta as long as local evidence remains inspectable.

## dndbuddy

- Matrix Slot: `additional-2`
- Gate: `pass`
- Source Safety: `pass`
- Mode: `evidence-only`
- State Location: `isolated-scratch`

### Command Results

- Doctor: `pass` in `599ms`
- Initial status: `pass` in `597ms`
- Scan: `pass` in `638ms`
- Report: `pass` in `600ms`
- Next/show: `pass` in `1201ms`
- Plan/handoff: `pass` in `1219ms`
- Revalidate: `pass` in `650ms`
- Prune dry-run: `pass` in `596ms`
- Final status: `pass` in `623ms`

### Counts

- Source files scanned: `12`
- Evidence records: `9`
- Candidates: `8`
- Themes: `2`
- Features: `17`
- Diagnostics: `config_missing`, `no_state`, `synthesis_skipped_by_policy`, `stale_state`, `missing_latest_artifacts`

### Quality Scores

- Evidence quality: `pass` - smaller repo shape produced a bounded queue.
- Ranking quality: `pass` - top candidate flowed through show/plan/handoff.
- Report usability: `pass` - report and handoff workflow completed.
- False-positive risk: `medium` - small-repo local metrics still require review.
- Stale-state handling: `pass` - revalidation and status completed.
- Generated-file handling: `watch` - generated-noise behavior covered by the synthetic fixture.
- Provider-failure handling: `not-exercised` - provider calls were disabled for source safety.

### Residual Risks

- Evidence-only results do not prove model-assisted synthesis on small repositories.

## Synthetic Generated/Noisy Fixture

- Matrix Slot: `generated-noisy`
- Gate: `pass`
- Source Safety: `pass`
- Mode: `evidence-only`
- State Location: `synthetic-fixture`

### Command Results

- Doctor: `pass` in `597ms`
- Initial status: `pass` in `595ms`
- Scan: `pass` in `617ms`
- Report: `pass` in `596ms`
- Next/show: `pass` in `1191ms`
- Plan/handoff: `pass` in `1214ms`
- Revalidate: `pass` in `643ms`
- Prune dry-run: `pass` in `597ms`
- Final status: `pass` in `612ms`

### Counts

- Source files scanned: `2`
- Evidence records: `3`
- Candidates: `2`
- Themes: `1`
- Features: `2`
- Diagnostics: `config_missing`, `git_history_unavailable`, `no_state`, `synthesis_skipped_by_policy`, `stale_state`, `missing_latest_artifacts`

### Quality Scores

- Evidence quality: `pass` - ignored generated/build/vendor noise was excluded from first-class scan counts.
- Ranking quality: `pass` - top candidate flowed through show/plan/handoff.
- Report usability: `pass` - report and handoff workflow completed.
- False-positive risk: `low` - fixture is synthetic and intentionally small.
- Stale-state handling: `pass` - revalidation and status completed.
- Generated-file handling: `pass` - generated, vendored, and build-output paths were present but not counted as source files.
- Provider-failure handling: `not-exercised` - provider calls were disabled for source safety.

### Residual Risks

- Synthetic fixture proves noise exclusion mechanically; real generated-code conventions may need more exclusions over time.
