## Review Protocol

Shared read-only review protocol used by the review sub-agents
(`smithy-plan-review` and `smithy-implementation-review`). Both agents
return structured findings using the same shape; neither agent modifies
artifacts or code. The parent command (planning command or forge)
applies fixes based on the returned findings.

### 1. Gather context

Read the target artifacts and any referenced source material. Cross-reference
each observation against:

- The stated goal or task descriptions driving the work
- The spec requirements (`.spec.md`)
- The data model (`.data-model.md`) and contracts (`.contracts.md`)

Only read files — do not edit, write, or run commands that mutate state.

### 2. Identify findings

Scan the artifacts for issues in the categories documented by the calling
agent's prompt. Each agent supplies its own category list; this protocol
does not enumerate categories.

### 3. Return findings in the shared structure

Every finding — regardless of which review agent produced it — uses the
following shape. Emit one finding per distinct issue.

| Field | Type | Description |
|-------|------|-------------|
| `category` | enum | What kind of issue (per-agent category list) |
| `severity` | enum | Critical, Important, Minor |
| `confidence` | enum | High or Low — whether the finding can be auto-resolved by the parent |
| `description` | string | What the issue is and where it appears |
| `artifact_path` | string | Path to the file containing the issue |
| `proposed_fix` | string | Suggested resolution (for High-confidence findings) |

### 4. Triage rules (applied by the parent command, not by the review agent)

The parent command decides what to do with each finding using the
severity × confidence triage table below. The review agent only reports;
it never takes the action itself.

| Severity | Confidence | Parent Action |
|----------|------------|---------------|
| Critical | High | Apply proposed fix, note in PR |
| Critical | Low | Record as specification debt **if it passes the kind gate**, otherwise flag in PR for reviewer |
| Important | High | Apply proposed fix |
| Important | Low | Record as specification debt **if it passes the kind gate**, otherwise route to the artifact's proper section (FR, acceptance scenarios, governance, out-of-scope) |
| Minor | Any | Note in PR only |

A finding **passes the kind gate** only when it names an unresolved
choice between two or more meaningfully different paths and contains no
prescription. Requirements ("X must Y"), acceptance tests ("acceptance
criteria require verifying Z"), dependency/coordination notes ("F1 and
F2 both touch file Z; second-to-land rebases"), future-work deferrals,
and resolution records do **not** belong in `## Specification Debt` even
when their confidence is Low. See `smithy-clarify` Step 3 for the
canonical kind-gate definition; this snippet does not duplicate it to
avoid drift between the two sites.

### Read-only invariant

Review agents are strictly read-only:

- They do not modify files or code.
- They do not create commits, branches, or PRs.
- They do not run mutating tools.
- Their sole output is a list of findings in the structure above; the
  parent command is responsible for any resulting changes on disk.
