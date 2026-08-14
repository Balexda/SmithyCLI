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
readiness risk.

#### The steering test

A finding is `steering` only if **all three** are true:

1. **Open question** — the artifacts, the codebase, the conventions, and
   prior art cannot settle it. Reading more does not produce the answer.
2. **Named alternatives** — two or more meaningfully different paths
   exist, and picking between them changes what gets built.
3. **Human-only** — a person must pick. The question cannot be closed by
   writing the code, running a test, or reading a file.

Condition 3 is the one that does the work. Most findings that feel like
open questions fail it: "whether the test runner's temp copy carries a
`.git` directory or initializes one" names two alternatives, but the
implementer settles it by reading the runner and running it once, not by
asking anyone.

**Positive test:** you must be able to phrase a `steering` finding as a
question a named human could answer in one sitting, without opening an
editor. If closing it requires writing code, running something, or
reading another file, it is `implementation`. If it requires neither —
because you already know the correct answer and are simply reporting that
the artifact has it wrong — it is `hygiene`.

#### Where the non-steering kinds go

| If the finding is really… | `kind` | Where the parent puts it |
|---------------------------|--------|--------------------------|
| An unknown the implementer settles by building, testing, or reading source — which field carries a value, which producer serves a surface, which of two equivalent call sites to extend | `implementation` | The tasks file's `## Open Implementation Questions` section, as an `IQ-NNN` row. Never the debt table |
| A factual error — a wrong `## Dependency Order` table, a stale path, a contradiction with a source the artifact itself cites, ordinary sequencing stated as if ownership were in doubt | `hygiene` | Applied as a write-back via your `proposed_fix`, or listed in the PR body when confidence is Low. A wrong table is a fix, not a question |
| Artifact housekeeping — "is the parent artifact corrected, or only this one?", "does this rename need to propagate upstream?" | `hygiene` | Same: applied, or listed in the PR body. The answer is knowable now, so it is never open uncertainty |
| A requirement, acceptance test, dependency/coordination note, deferral, or post-hoc resolution record — the leak kinds named in `smithy-clarify` Step 3b's routing table | `hygiene` | Point `proposed_fix` at the proper home from that table (`### Functional Requirements`, `### Acceptance Scenarios`, `## Out of Scope`, the RFC's Cross-Cutting Governance matrix, the PR body) so the parent writes it there |

#### Calibration

The debt table is a decision queue, and it stops working as one long
before it stops rendering. If your findings would add more than a handful
of debt rows to a single artifact, re-run the gate on each of them:
implementation unknowns are the usual cause of an inflated table, and
several rows that all reduce to one root cause are the second. Collapse
findings sharing a single root cause into one finding naming that cause,
rather than emitting one per symptom.

### 5. Triage rules (applied by the parent command, not by the review agent)

The parent command decides what to do with each finding by reading
`kind` first, then severity × confidence. The review agent only reports;
it never takes the action itself.

| `kind` | Severity | Confidence | Parent Action |
|--------|----------|------------|---------------|
| `steering` | Critical | Any | Record as specification debt, flag in PR for reviewer. **Never** apply the fix |
| `steering` | Important | Any | Record as specification debt. **Never** apply the fix |
| `steering` | Minor | Any | Note in PR only |
| `implementation` | Critical or Important | High | Apply proposed fix — the reviewer settled the unknown, so there is nothing left to discover |
| `implementation` | Critical or Important | Low | Record in the tasks file's `## Open Implementation Questions` section. When the work is not tracked by a tasks file, note in the PR body instead — never in the debt table |
| `implementation` | Minor | Any | Note in PR only |
| `hygiene` | Critical or Important | High | Apply proposed fix, note in PR |
| `hygiene` | Critical or Important | Low | Do not apply. List in the PR body for the reviewer to correct — never in the debt table |
| `hygiene` | Minor | Any | Note in PR only |

**A `steering` finding is never auto-applied, at any confidence.** The
kind means a human has to pick; applying a fix would make that pick for
them and bury a product decision inside a planning commit. Confidence
does not license it — a High-confidence `steering` finding is a
contradiction and means the classification is wrong. Re-examine it: if
the `proposed_fix` can be applied verbatim without anyone choosing, the
finding is `hygiene`; if a human must choose, confidence is Low by
construction. This is the one cell where confidence loses to kind.

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
