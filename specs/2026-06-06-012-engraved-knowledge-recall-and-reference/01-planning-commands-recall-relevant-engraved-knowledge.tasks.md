# Tasks: Planning Commands Recall Relevant Engraved Knowledge

**Source**: `specs/2026-06-06-012-engraved-knowledge-recall-and-reference/engraved-knowledge-recall-and-reference.spec.md` — User Story 1
**Data Model**: `specs/2026-06-06-012-engraved-knowledge-recall-and-reference/engraved-knowledge-recall-and-reference.data-model.md`
**Contracts**: `specs/2026-06-06-012-engraved-knowledge-recall-and-reference/engraved-knowledge-recall-and-reference.contracts.md`
**Story Number**: 01

---

## Slice 1: Read-Only Recall Sub-Agent

**Goal**: Add the `smithy-recall` Claude sub-agent that reads engraved records directly and returns ranked relevance, candidate invariant conflicts, superseded/deprecated citation hazards, and well-formed empty results.

**Justification**: The sub-agent is the reusable read path for every planning command. Landing it first creates a standalone contract-compliant capability without touching command prompts, and the degraded non-Claude path can later mirror the same reasoning in the shared snippet.

**Addresses**: FR-001, FR-002, FR-003, FR-004; Acceptance Scenarios 1.1, 1.2, 1.3, 1.4, 1.5

### Tasks

- [ ] **Create the recall agent prompt**

  Add the `smithy-recall` agent template with read-only tools and instructions to scan canonical engraved-record locations, infer or honor the planning domain, and rank records by `domain`, `topics`, `scope`, and `applies_to` overlap. The prompt must return a structured result containing relevant records, conflict flags, superseded/deprecated citation hazards, and empty-state fields.

  _Acceptance criteria:_
  - Agent template exists with read-only file tools only
  - Agent is described as non-interactive and not user-invocable
  - Relevance ranking uses the engraved frontmatter fields from the data model
  - Result shape includes `relevant`, `conflicts`, `superseded_citations`, `empty`, and `empty_reason`

- [ ] **Handle invariant conflicts and accepted exceptions**

  Teach recall to compare proposed work against invariant rules as a soft candidate-exception signal and to suppress that signal when the invariant's Known-Exceptions ledger already has an `Accepted:` row covering the divergence.

  _Acceptance criteria:_
  - Invariant conflicts are returned as candidate new exceptions, not hard blocks
  - Existing `Accepted:` ledger coverage suppresses duplicate conflict flags
  - `Temporary:` rows do not suppress new conflict guidance
  - Empty placeholder ledger rows are treated as no existing exceptions

- [ ] **Handle retired decision citations and empty states**

  Teach recall to flag citations to decisions whose frontmatter lifecycle is `superseded` or `deprecated`, without recomputing supersession. Also define empty results for missing engraved records and for records that exist but do not match the planning context.

  _Acceptance criteria:_
  - Superseded/deprecated hazards read lifecycle from frontmatter as ground truth
  - Recall does not independently derive graph or lifecycle state
  - No records yields `empty: true` with `empty_reason: no_records`
  - Existing records with no relevant match yield `empty: true` with `empty_reason: no_match`

**PR Outcome**: Claude can dispatch `smithy-recall` as a read-only sub-agent and receive contract-shaped recall results for ranked records, conflicts, stale citations, and empty cases.

---

## Slice 2: Consult Engraved Knowledge Snippet

**Goal**: Add the shared `consult-engraved-knowledge` snippet that planning commands can include during scan, with a Claude fast path through `smithy-recall` and an inline degraded path for agents without sub-agent support.

**Justification**: The snippet is the cross-agent integration point. Keeping it separate from command wiring lets its Claude and degraded behaviors be reviewed once before every planning command depends on it.

**Addresses**: FR-005, FR-006; Acceptance Scenario 1.6

### Tasks

- [ ] **Create the consultation snippet**

  Add a parameter-free snippet that instructs Claude to dispatch `smithy-recall` with the current planning context and instructs Gemini/Codex to read the engraved scan roots directly, applying the same relevance, conflict, stale-citation, domain, and empty-state rules inline.

  _Acceptance criteria:_
  - Snippet exists under the agent-skills snippets directory
  - Claude path dispatches `smithy-recall`
  - Gemini/Codex path reads canonical engraved roots directly
  - Degraded path includes ranking, conflict, stale-citation, domain, and empty-state behavior

- [ ] **Register and document the snippet**

  Register the snippet in the snippets README so it is visible to template authors and clearly lists the planning commands that consume it.

  _Acceptance criteria:_
  - Snippets README includes a `consult-engraved-knowledge.md` row
  - Row states the snippet's purpose and planned consumers
  - Documentation notes the snippet is embedded into planning commands, not deployed standalone

- [ ] **Add composition coverage for the snippet**

  Extend template tests so deletion, renaming, or malformed content of the snippet fails early, and so the composed content proves both the sub-agent fast path and degraded direct-read path remain present.

  _Acceptance criteria:_
  - Tests assert the snippet is resolvable by the template composition machinery
  - Tests assert the composed snippet mentions `smithy-recall`
  - Tests assert the composed snippet includes direct engraved-root reading guidance
  - Tests assert the snippet carries conflict and superseded/deprecated citation handling

**PR Outcome**: A registered shared snippet exists for engraved-knowledge consultation and can be composed into every planning command with both Claude and non-Claude behavior intact.

---

## Slice 3: Planning Command Recall Wiring

**Goal**: Wire `consult-engraved-knowledge` into the scan phase of `strike`, `ignite`, `render`, `mark`, and `cut`, and make each command fold recall findings into its clarification and debt handling.

**Justification**: Once the agent and snippet exist, this slice turns recall on for the user-visible planning surface. Bundling the five command inclusions keeps the success criterion atomic: every planning command consults engraved knowledge through the same shared contract.

**Addresses**: FR-005, FR-006; Acceptance Scenarios 1.1, 1.2, 1.3, 1.4, 1.5, 1.6

### Tasks

- [ ] **Include the snippet in every planning command scan phase**

  Add the shared partial to the scan phase of `smithy.strike`, `smithy.ignite`, `smithy.render`, `smithy.mark`, and `smithy.cut`, preserving each command's existing one-shot and review-loop behavior.

  _Acceptance criteria:_
  - All five planning command templates include `{{>consult-engraved-knowledge}}`
  - Inclusion occurs during scan/context-gathering before artifact drafting
  - Existing clarify, refine, scout, PR-creation, and one-shot output behavior is preserved
  - Commands still proceed normally when recall returns an empty result

- [ ] **Fold recall findings into clarification and debt**

  Update planning-command instructions so candidate invariant exceptions are presented as clarification/debt inputs and superseded/deprecated citations are surfaced as hazards for the generated artifact, without treating recall as a hard gate.

  _Acceptance criteria:_
  - Candidate invariant conflicts are routed into clarification or specification debt
  - Superseded/deprecated citation hazards are surfaced before artifact write-out
  - Recall findings remain advisory unless the parent planning command's existing rules escalate them
  - Empty or clean recall results require no artifact changes

- [ ] **Assert every planning command consults engraved knowledge**

  Extend template coverage for all supported agents so the composed planning commands include the shared snippet content and preserve both the Claude sub-agent path and the Gemini/Codex degraded path.

  _Acceptance criteria:_
  - Tests cover `strike`, `ignite`, `render`, `mark`, and `cut`
  - Tests assert the composed commands include engraved-knowledge consultation
  - Tests assert Claude-composed commands mention `smithy-recall`
  - Tests assert non-Claude-composed commands retain direct-read degraded guidance

**PR Outcome**: Every Smithy planning command consults engraved knowledge during scan, receives relevant recall findings, and folds conflicts or stale citations into planning without blocking clean or empty cases.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | inherited from spec: Which agent-context files projection manages by default (CLAUDE.md only, also AGENTS.md, also `.github/copilot-instructions.md`) and whether the target set is configurable. | Integration | Medium | Medium | inherited | — |
| SD-002 | inherited from spec: Whether the optional `design`-domain locations (`docs/design/{decisions,invariants,constitution}`) are in scope for recall and the projection pointer now, or deferred. | Functional Scope | Low | Medium | inherited | — |

---

## Dependency Order

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Read-Only Recall Sub-Agent | — | — |
| S2 | Consult Engraved Knowledge Snippet | S1 | — |
| S3 | Planning Command Recall Wiring | S2 | — |
