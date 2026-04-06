## Summary
- Primary outcome: 
- Notable behaviour changes: 
- Follow-up work deferred (if any): 

## Context
- Why are we doing this work now? Link to decisions, specs, or incidents.
- What user story or scenario does it unlock or improve?

## Implementation Notes
- Key architectural choices (include trade-offs or alternatives considered).
- Impacted modules or boundaries.
- Template / Agentic CLI specifics.

## Risks & Mitigations
- Risk: | Mitigation:

## Rollback Plan
- Steps to back out the change safely (code and data).

## Testing

### Smithy CLI Core
- [ ] Build succeeds (`npm run build`)
- [ ] Type check succeeds (`npx tsc --noEmit`)
- [ ] CLI `init` smoke test (`node dist/cli.js init`)

### Template Generation
- [ ] Gemini Skills: `.gemini/skills/` folders and `SKILL.md` validity.
- [ ] Codex Prompts: `tools/codex/prompts/` file content.
- [ ] Claude Prompts: `.claude/prompts/` file content.
- [ ] GitHub Issue Templates: `.github/ISSUE_TEMPLATE/` content.

### Permissions & Configuration
- [ ] Gemini Config: `.gemini/config.json` correctly formed and merged.
- [ ] Codex Config: `.codex/config.toml` contains correct `[[approvals.rules]]`.
- [ ] Claude Config: `.claude/settings.json` correctly formed.

### Manual Test Cases
- [ ] Reviewed applicable cases in [`tests/Agent.tests.md`](tests/Agent.tests.md) and [`tests/Manual.tests.md`](tests/Manual.tests.md) (if init/uninit flows changed)

## Issue
<!-- Link the GitHub issue(s) this PR addresses using a closing keyword (Closes, Fixes, Resolves) so they auto-close on merge. One issue per line. If there is no related issue, delete this entire section rather than leaving an unfilled placeholder. -->
- Closes #
