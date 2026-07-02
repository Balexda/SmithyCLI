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

- [x] **Create the recall agent prompt**

  Add the `smithy-recall` agent template with read-only tools and instructions to scan canonical engraved-record locations, infer or honor the planning domain, and rank records by `domain`, `topics`, `scope`, and `applies_to` overlap. The prompt must return a structured result containing relevant records, conflict flags, superseded/deprecated citation hazards, and empty-state fields.

  _Acceptance criteria:_
  - Agent template exists with read-only file tools only
  - Agent is described as non-interactive and not user-invocable
  - Relevance ranking uses the engraved frontmatter fields from the data model
  - Result shape includes `relevant`, `conflicts`, `superseded_citations`, `empty`, and `empty_reason`

- [x] **Handle invariant conflicts and accepted exceptions**

  Teach recall to compare proposed work against invariant rules as a soft candidate-exception signal and to suppress that signal when the invariant's Known-Exceptions ledger already has an `Accepted:` row covering the divergence.

  _Acceptance criteria:_
  - Invariant conflicts are returned as candidate new exceptions, not hard blocks
  - Existing `Accepted:` ledger coverage suppresses duplicate conflict flags
  - `Temporary:` rows do not suppress new conflict guidance
  - Empty placeholder ledger rows are treated as no existing exceptions

- [x] **Handle retired decision citations and empty states**

  Teach recall to flag citations to decisions whose frontmatter lifecycle is `superseded` or `deprecated`, without recomputing supersession. Also define empty results for missing engraved records and for records that exist but do not match the planning context.

  _Acceptance criteria:_
  - Superseded/deprecated hazards read lifecycle from frontmatter as ground truth
  - Recall does not independently derive graph or lifecycle state
  - No records yields `empty: true` with `empty_reason: no_records`
  - Existing records with no relevant match yield `empty: true` with `empty_reason: no_match`

**PR Outcome**: Claude can dispatch `smithy-recall` as a read-only sub-agent and receive contract-shaped recall results for ranked records, conflicts, stale citations, and empty cases.

---

## Slice 2: Shared Recall-Rules Snippet

**Goal**: Add the shared `engraved-recall-rules` snippet — the single source of truth for engraved-knowledge recall behavior (canonical scan roots, frontmatter ranking, candidate invariant conflicts, superseded/deprecated citation hazards, empty-state result) — so the `smithy-recall` sub-agent and (in Slice 3) the inline degraded path of each planning command share one definition of the rules.

**Justification**: Follow the established sub-agent-dispatch pattern (`smithy.forge` with `tdd-protocol` / `review-protocol`): the only shared file is the *rules* snippet, consumed by both the sub-agent and the degraded inline path. Sub-agent **dispatch** prose is written inline in the consuming command behind the zero-arg `{{#ifAgent}}` capability gate — never bottled into a per-agent "consult" snippet. Reviewing the rules snippet once, before any command depends on it, keeps the cross-agent contract single-sourced.

**Addresses**: FR-005, FR-006; Acceptance Scenario 1.6

### Tasks

- [x] **Create the shared recall-rules snippet**

  Add a parameter-free, agent-agnostic snippet holding the recall rules: canonical engraved scan roots, `domain`/`topics`/`scope`/`applies_to` ranking, candidate invariant conflict handling, superseded/deprecated citation hazards, and well-formed empty-state result. No agent conditionals and no `smithy-recall` mention — it is the rule body both the sub-agent and the inline degraded branch include.

  _Acceptance criteria:_
  - Snippet exists under the agent-skills snippets directory
  - Carries ranking, conflict, stale-citation, domain, and empty-state behavior
  - Contains no `{{#ifAgent}}` conditional and no agent-identity prose
  - The `smithy-recall` sub-agent includes it via `{{>engraved-recall-rules}}` rather than restating the rules

- [x] **Register and document the snippet**

  Register the snippet in the snippets README so it is visible to template authors, noting it is the forge-pattern shared-rules analogue and listing its consumers.

  _Acceptance criteria:_
  - Snippets README includes an `engraved-recall-rules.md` row
  - Row states the snippet's purpose, that dispatch prose stays inline in the command, and the planned consumers
  - Documentation notes the snippet is embedded into the sub-agent and planning commands, not deployed standalone

- [x] **Add composition coverage for the snippet**

  Extend template tests so deletion, renaming, or malformed content of the snippet fails early, and so the composed content proves the rule body remains present and agent-agnostic.

  _Acceptance criteria:_
  - Tests assert the snippet is resolvable by the template composition machinery
  - Tests assert the composed snippet carries conflict and superseded/deprecated citation handling
  - Tests assert the snippet is agent-agnostic (no `{{` conditional syntax, no `smithy-recall` mention)

**PR Outcome**: A registered shared `engraved-recall-rules` snippet exists as the single source of the recall rules, already consumed by the `smithy-recall` sub-agent and ready for the inline degraded branch each planning command adds in Slice 3.

---

## Slice 3: Planning Command Recall Wiring

**Goal**: Wire engraved-knowledge consultation into the scan phase of `strike`, `ignite`, `render`, `mark`, and `cut`, and make each command fold recall findings into its clarification and debt handling.

**Justification**: Once the agent and shared rules snippet exist, this slice turns recall on for the user-visible planning surface. Each command gets an inline `{{#ifAgent}}` consultation block — sub-agent-capable agents dispatch `smithy-recall` (dispatch prose written inline, the same way forge inlines its sub-agent dispatch), and the degraded `{{else}}` branch reads the scan roots directly via `{{>engraved-recall-rules}}`. Bundling the five command inclusions keeps the success criterion atomic: every planning command consults engraved knowledge through the same shared contract.

**Addresses**: FR-005, FR-006; Acceptance Scenarios 1.1, 1.2, 1.3, 1.4, 1.5, 1.6

### Tasks

- [x] **Add the inline consultation block to every planning command scan phase**

  Add an inline `{{#ifAgent}}<dispatch smithy-recall>{{else}}{{>engraved-recall-rules}}{{/ifAgent}}` consultation block to the scan phase of `smithy.strike`, `smithy.ignite`, `smithy.render`, `smithy.mark`, and `smithy.cut`, preserving each command's existing one-shot and review-loop behavior. The sub-agent dispatch prose is written inline in the if-branch (not a shared snippet); only the rule body is shared via `{{>engraved-recall-rules}}`.

  _Acceptance criteria:_
  - All five planning command templates gain an inline `{{#ifAgent}}` consultation block whose `{{else}}` branch includes `{{>engraved-recall-rules}}`
  - The sub-agent-capable branch dispatches `smithy-recall` with the planning context
  - Inclusion occurs during scan/context-gathering before artifact drafting
  - Existing clarify, refine, scout, PR-creation, and one-shot output behavior is preserved
  - Commands still proceed normally when recall returns an empty result

- [x] **Fold recall findings into clarification and debt**

  Update planning-command instructions so candidate invariant exceptions are presented as clarification/debt inputs and superseded/deprecated citations are surfaced as hazards for the generated artifact, without treating recall as a hard gate.

  _Acceptance criteria:_
  - Candidate invariant conflicts are routed into clarification or specification debt
  - Superseded/deprecated citation hazards are surfaced before artifact write-out
  - Recall findings remain advisory unless the parent planning command's existing rules escalate them
  - Empty or clean recall results require no artifact changes

- [x] **Assert every planning command consults engraved knowledge**

  Extend template coverage for all supported agents so the composed planning commands include the consultation block and preserve both the sub-agent-capable dispatch path and the degraded direct-read path.

  _Acceptance criteria:_
  - Tests cover `strike`, `ignite`, `render`, `mark`, and `cut`
  - Tests assert the composed commands include engraved-knowledge consultation
  - Tests assert sub-agent-capable (Claude/Codex) composed commands dispatch `smithy-recall`
  - Tests assert degraded (Gemini) composed commands retain direct-read guidance from `{{>engraved-recall-rules}}`

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
| S2 | Shared Recall-Rules Snippet | S1 | — |
| S3 | Planning Command Recall Wiring | S2 | — |
