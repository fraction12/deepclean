# Beta Dogfood Scorecard Template

Copy this template into `docs/beta-dogfood/scorecards/<date>-<slot>.md` or include multiple repository sections in one dated matrix scorecard.

## <Repository Label>

- Matrix Slot: `<deepclean|lightningitb|additional-1|additional-2|generated-noisy>`
- Gate: `<pass|fail|blocked>`
- Source Safety: `<pass|fail>`
- Mode: `<evidence-only|metadata-synthesis|source-ok-synthesis>`
- State Location: `<isolated-scratch|repo-local|synthetic-fixture>`

### Command Results

- Doctor: `<pass|fail>` in `<duration>`
- Initial status: `<pass|fail>` in `<duration>`
- Scan: `<pass|fail>` in `<duration>`
- Report: `<pass|fail>` in `<duration>`
- Next/show: `<pass|fail>` in `<duration>`
- Plan/handoff: `<pass|fail>` in `<duration>`
- Revalidate: `<pass|fail|not-applicable>` in `<duration>`
- Prune dry-run: `<pass|fail>` in `<duration>`
- Final status: `<pass|fail>` in `<duration>`

### Counts

- Source files scanned: `<n>`
- Evidence records: `<n>`
- Candidates: `<n>`
- Themes: `<n>`
- Features: `<n>`
- Diagnostics: `<codes only>`

### Quality Scores

- Evidence quality: `<pass|watch|fail>` - `<source-safe note>`
- Ranking quality: `<pass|watch|fail>` - `<source-safe note>`
- Report usability: `<pass|watch|fail>` - `<source-safe note>`
- False-positive risk: `<low|medium|high>` - `<source-safe note>`
- Stale-state handling: `<pass|watch|fail>` - `<source-safe note>`
- Generated-file handling: `<pass|watch|fail>` - `<source-safe note>`
- Provider-failure handling: `<pass|watch|fail|not-exercised>` - `<source-safe note>`

### Residual Risks

- `<source-safe risk note>`
