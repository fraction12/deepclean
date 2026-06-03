# evidence-engine-ingestion Specification

## MODIFIED Requirements

### Requirement: Initial evidence engine set
The system SHALL support an initial evidence engine set covering duplication, structural code facts, import/dependency graph, TS/JS project intelligence, git history signals, and test discovery.

#### Scenario: Scoped scan has nearby tests outside the scoped file list
- **WHEN** `deepclean scan --paths src/foo.ts` or revalidation inspects a source file and `src/foo.test.ts` exists in the discovered repository files
- **THEN** test discovery does not emit a test-gap evidence record for `src/foo.ts` solely because the test file was outside the scoped source file list
