# Contracts: Shared Procedure With Forge Parity

## Interfaces
<!-- audience: builder; mode: reference; length: tables only; diagram: optional; examples: required -->

### Shared Implementation Procedure

**Provider**: Canonical implementation procedure template.
**Consumer**: Forge. The same boundary is available for strike integration.

| Caller input | Required | Meaning | Forge example |
|---|---|---|---|
| Task brief | Yes | Ordered tasks, goal, and applicable planning context | Selected slice from a `.tasks.md` file or the single slice of a legacy `.strike.md` file |
| Progress record | Yes | Where task completion is recorded and what evidence counts | Tracked checklist, with each flip normally committed alongside its task. If completed work is still unchecked at HEAD, forge commits the flip separately as `forge: mark slice <N> task <M> complete` and continues. |
| Review targets | Yes | Change range, authoritative planning context, and destinations for findings | Pre-implementation base through current HEAD, applicable spec or strike context, and forge's planning artifact and terminal review summary |
| Execution context | Yes | Current branch, available runtime capabilities, and caller-owned lifecycle checks | Sub-agent dispatch or inline execution, with forge checking the tracked checklist before final validation |

Forge supplying the inputs for a `.tasks.md` slice:

```yaml
task_brief:
  source: specs/<spec-folder>/01-<story>.tasks.md
  slice: 1          # ordered tasks, goal, and applicable planning context
progress_record:
  kind: tracked-checklist
  location: specs/<spec-folder>/01-<story>.tasks.md#slice-1
  evidence: task checkbox flipped to [x] in the commit that lands the task
review_targets:
  range: <pre-implementation-base>..HEAD
  planning_context: specs/<spec-folder>/<spec-name>.spec.md
  finding_destinations: [planning-artifact, terminal-review-summary]
execution_context:
  branch: <current-branch>
  mode: sub-agent    # or inline on runtimes without sub-agents
  caller_checks: [slice-completion-check-at-HEAD]
```

| Outcome | Caller-visible result |
|---|---|
| Tasks, review, documentation checks, and validation finish | Task progress, review and documentation outcomes, and validation results are available to the caller. |
| A task is blocked or fails after the existing retry | Forge stops and reports the blocker or failure. |
| A proposed review fix fails tests | Forge reverts the fix and follows its existing finding routing. |
| A tracked task at HEAD is unchecked | Forge's completion gate blocks delivery until completion is recorded at HEAD. |
