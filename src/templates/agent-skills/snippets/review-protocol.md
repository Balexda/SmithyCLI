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
| `kind` | enum | `steering`, `implementation`, or `hygiene` — what kind of *resolution* the finding needs (see the kind gate below) |
| `severity` | enum | Critical, Important, Minor |
| `confidence` | enum | High or Low — whether the finding can be auto-resolved by the parent |
| `description` | string | What the issue is and where it appears |
| `artifact_path` | string | Path to the file containing the issue |
| `proposed_fix` | string | Suggested resolution (for High-confidence findings) |

### 4. Kind gate (set by the review agent, applied before triage)

Severity and confidence say how much a finding matters and how sure you
are. They say nothing about **who resolves it**, and that is the axis
that decides whether a finding belongs in the artifact's decision queue.
Every finding therefore carries a `kind`:

| `kind` | The finding is… | Who resolves it |
|--------|-----------------|-----------------|
| `steering` | an open question naming two or more meaningfully different paths, where the choice changes what gets built | a human, by choosing |
| `implementation` | an unknown the implementer settles by writing the code, running a test, or reading the source — there is a right answer and the work reveals it | the implementer, by building |
| `hygiene` | a factual error, stale table, or artifact-consistency defect with a knowable correct answer, including anything the `smithy-clarify` Step 3b routing table names as a leak (requirement, acceptance test, dependency/coordination note, deferral, resolution record) | the parent command, by applying a fix |

**Only `steering` findings may become specification debt.** The debt
table is a decision queue for a human; an implementation unknown or a
wrong table parked there buries the real decisions and inflates apparent
readiness risk. The three-part steering test and the calibration for it
live in `smithy-plan-review`'s Kind Gate section — consult that section
rather than re-deriving the criteria here.

### 5. Triage rules (applied by the parent command, not by the review agent)

The parent command decides what to do with each finding by reading
`kind` first, then severity × confidence. The review agent only reports;
it never takes the action itself.

| `kind` | Severity | Confidence | Parent Action |
|--------|----------|------------|---------------|
| `steering` | Critical | High | Apply proposed fix, note in PR |
| `steering` | Critical | Low | Record as specification debt, flag in PR for reviewer |
| `steering` | Important | High | Apply proposed fix |
| `steering` | Important | Low | Record as specification debt |
| `steering` | Minor | Any | Note in PR only |
| `implementation` | Critical or Important | Any | Record in the tasks file's `## Open Implementation Questions` section. When the work is not tracked by a tasks file, note in the PR body instead — never in the debt table |
| `implementation` | Minor | Any | Note in PR only |
| `hygiene` | Critical or Important | High | Apply proposed fix, note in PR |
| `hygiene` | Critical or Important | Low | Do not apply. List in the PR body for the reviewer to correct — never in the debt table |
| `hygiene` | Minor | Any | Note in PR only |

A wrong table is a fix, not a question: a `hygiene` finding never
becomes debt at any severity or confidence, and neither does an
`implementation` finding. A Low-confidence `hygiene` finding means the
correction is knowable but you could not pin it down — the PR body is
where it goes, so a reviewer can settle it in one pass instead of
carrying it as open uncertainty.

### Read-only invariant

Review agents are strictly read-only:

- They do not modify files or code.
- They do not create commits, branches, or PRs.
- They do not run mutating tools.
- Their sole output is a list of findings in the structure above; the
  parent command is responsible for any resulting changes on disk.
