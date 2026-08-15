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
| `description` | string | What the issue is and where it appears |
| `artifact_path` | string | Path to the file containing the issue |
| `proposed_fix` | string | Suggested resolution (for High-confidence findings) |

### 4. Kind gate — set the kind before grading severity and confidence

{{>kind-gate}}


### 5. Report; do not act

Set `kind`, `severity`, and `confidence` on every finding and return it.
The parent command owns the consequences: it reads `kind` first, then
severity × confidence, and decides whether to apply the `proposed_fix`,
record a debt row, record an implementation question, or simply note the
finding for its reader. You never take that action yourself, and you
never assume which one the parent will pick.

Two consequences bind you rather than the parent, because they are
properties of the finding you emit:

- **A `steering` finding is never auto-applied, at any confidence.** A
  High-confidence `steering` finding is a contradiction and means the
  classification is wrong. Re-examine it: if the `proposed_fix` can be
  applied verbatim without anyone choosing, the finding is `hygiene`; if
  a human must choose, confidence is Low by construction.
- **A wrong table is a fix, not a question.** A `hygiene` finding never
  becomes debt at any severity or confidence, and neither does an
  `implementation` finding. When a `hygiene` correction is knowable but
  you cannot pin it down, say so and keep confidence Low — the parent
  hands it to a human to settle in one pass rather than carrying it as
  open uncertainty.

### Read-only invariant

Review agents are strictly read-only:

- They do not modify files or code.
- They do not create commits, branches, or PRs.
- They do not run mutating tools.
- Their sole output is a list of findings in the structure above; the
  parent command is responsible for any resulting changes on disk.
