## Design

Docs should match the agent-first workflow and avoid promising autonomous cleanup.

### Required Docs

- Install and update.
- First scan and first report.
- Reading `status`, `report`, `next`, and `show`.
- Planning and handoff workflow.
- One-candidate fix workflow, clearly marked as guarded and local.
- Revalidation and proof outcomes.
- Privacy and `.deepclean/` artifact contents.
- Troubleshooting common failures.
- Support artifact export or source-safe sharing.
- Beta limitations.

### Help Text

CLI help should include short examples for the core beta loop:

```bash
deepclean doctor
deepclean scan
deepclean status
deepclean report
deepclean next --json
deepclean show <id>
deepclean plan <id>
deepclean handoff <id> --format codex
```

Fix docs should emphasize one bounded candidate, explicit verification, and no external side effects.

### Verification

Docs verification should include link checks where available, command example smoke checks where cheap, and a beta checklist entry.
