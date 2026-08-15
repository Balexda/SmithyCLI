Severity and confidence say how much a finding matters and how sure you
are. They say nothing about **who resolves it**, and that is the axis
that decides whether a finding belongs in the artifact's decision queue.
Every finding therefore carries a `kind`:

| `kind` | The finding is… | Who resolves it |
|--------|-----------------|-----------------|
| `steering` | an open question naming two or more meaningfully different paths, where the choice changes what gets built | a human, by choosing |
| `implementation` | an unknown the implementer settles by writing the code, running a test, or reading the source — there is a right answer and the work reveals it | the implementer, by building |
| `hygiene` | a factual error, stale table, or artifact-consistency defect with a knowable correct answer, including any of the leak kinds in the routing table below | the parent command, by applying a fix |

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
the artifact has it wrong — it is `hygiene`. A finding you can only
phrase as a directive ("we will…", "implementers must…", "mitigation:
pin both files…", "resolution: X owns A and Y owns B") has already had
its answer chosen, so it is never `steering`.

#### Where the non-steering kinds go

Nothing the gate rejects is discarded — every kind has a home, and the
finding carries the same information there.

| If the finding is really… | `kind` | Where it belongs |
|---------------------------|--------|------------------|
| An unknown the implementer settles by building, testing, or reading source — which field carries a value, which producer serves a surface, which of two equivalent call sites to extend | `implementation` | The tasks file's `## Open Implementation Questions` section, as an `IQ-NNN` row. Never the debt table |
| A factual error — a wrong `## Dependency Order` table, a stale path, a contradiction with a source the artifact itself cites, ordinary sequencing stated as if ownership were in doubt | `hygiene` | Applied as a correction to the artifact. A wrong table is a fix, not a question |
| Artifact housekeeping — "is the parent artifact corrected, or only this one?", "does this rename need to propagate upstream?" | `hygiene` | Same: applied. The answer is knowable now, so it is never open uncertainty |
| A requirement — "X must Y", "implementers verify Z", "mitigation: pin both files" | `hygiene` | The artifact's `### Functional Requirements` (specs) or the RFC body |
| A load-bearing assumption — "a retry count of 5 is sufficient", "X is acceptable for now" | `hygiene` | The artifact's `## Assumptions` section, annotated `[Critical Assumption]` when the impact is Critical |
| An acceptance test — "acceptance criteria require empirically capturing X", "verification needed against actual Y" | `hygiene` | The user story's `### Acceptance Scenarios` |
| A dependency or coordination note — "F1.5 and F1.6 both touch file Z; second-to-land rebases" | `hygiene` | The RFC's Cross-Cutting Governance / touched-files matrix and the `## Dependency Order` table, which already track this. Never debt |
| Future work or a deferral — "deferred to follow-up", "out of scope this round" | `hygiene` | The artifact's `## Out of Scope`, plus a follow-up issue. The decision to defer is already made; debt is forward-looking |
| A resolution record — "this was fixed in the same PR", "reviewer's concern investigated and dismissed" | `hygiene` | The pull request description, or at most a row already under `### Resolved`. Never an open debt row |

#### Calibration

The debt table is a decision queue, and it stops working as one long
before it stops rendering. If your findings would add more than a handful
of debt rows to a single artifact, re-run the gate on each of them:
implementation unknowns are the usual cause of an inflated table, and
several rows that all reduce to one root cause are the second. Collapse
findings sharing a single root cause into one finding naming that cause,
rather than emitting one per symptom.
