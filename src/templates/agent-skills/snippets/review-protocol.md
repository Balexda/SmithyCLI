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
| `confidence` | enum | High or Low — whether the parent may apply the `proposed_fix` without a human. These are the two endpoints of the pipeline's `High` / `Medium` / `Low` confidence scale; a review finding never takes the middle value, because "may the parent apply this" has no middle setting |
| `destination` | enum | `apply`, `debt`, `iq`, or `note` — where the parent sends this finding, computed by you from the three fields above (see the routing step below) |
| `description` | string | What the issue is and where it appears |
| `artifact_path` | string | Path to the file containing the issue |
| `proposed_fix` | string | Suggested resolution (for High-confidence findings) |

### 4. Kind gate — set the kind before grading severity and confidence

{{>kind-gate}}


### 5. Route the finding — set `destination` from kind × severity × confidence

The dispatch that called you binds two terms: **the target artifact**, the
planning file that carries any row you route there, and **the review note
surface**, the place a finding nobody applies gets reported. You do not
write to either — you name which one each finding is for, so the parent
acts on one field instead of re-deriving this table.

| Kind | Severity | Confidence | `destination` |
|------|----------|------------|---------------|
| `implementation` or `hygiene` | Critical or Important | High | `apply` |
| `steering` | Critical or Important | Any | `debt` |
| `implementation` | Critical or Important | Low | `iq` when the target artifact is a `.tasks.md`, `note` otherwise |
| `hygiene` | Critical or Important | Low | `note` |
| Any | Minor | Any | `note` |

`iq` is conditional because only a tasks file carries an
`## Open Implementation Questions` section. The unknown is settled while
building either way, so on any other artifact it is reported instead of
recorded. When the dispatch named no target artifact, choose `note`.

Two of these cells bind you rather than the parent, because they are
properties of the finding you emit:

- **A `steering` finding is never auto-applied, at any confidence.** It
  takes `debt`, never `apply` — the kind means a human has to pick, and
  applying a fix would make that pick for them. A High-confidence
  `steering` finding is a contradiction and means the classification is
  wrong. Re-examine it: if the `proposed_fix` can be applied verbatim
  without anyone choosing, the finding is `hygiene`; if a human must
  choose, confidence is Low by construction.
- **A wrong table is a fix, not a question.** A `hygiene` finding never
  takes `debt` at any severity or confidence, and neither does an
  `implementation` finding. When a `hygiene` correction is knowable but
  you cannot pin it down, say so and keep confidence Low — the parent
  hands it to a human to settle in one pass rather than carrying it as
  open uncertainty.

Severity escalation never overrides the kind gate: a drift finding whose
`kind` is `implementation` or `hygiene` routes by its own row above and
never takes `debt`.

### 6. Report; do not act

Set `kind`, `severity`, `confidence`, and `destination` on every finding
and return it. The parent command owns the consequences: it reads
`destination` and edits the file, records the row, or reports the finding
accordingly. You never take that action yourself.

### Read-only invariant

Review agents are strictly read-only:

- They do not modify files or code.
- They do not create commits, branches, or PRs.
- They do not run mutating tools.
- Their sole output is a list of findings in the structure above; the
  parent command is responsible for any resulting changes on disk.
