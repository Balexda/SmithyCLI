# Feature Specification: Integrate the voice helper across Smithy prose surfaces

**Spec Folder**: `2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces`
**Branch**: `feature/epic-419-voice-in-artifacts` *(orchestrator-staged branch; this run executed inside a linked worktree on a non-default branch, so the branch was kept rather than auto-named after the spec folder)*
**Created**: 2026-06-06
**Status**: Draft
**Input**: User feature description via `/smithy.mark` — "properly integrate [`smithy.helper-voice`] across all smithy skills, review steps and the audit … ensure we have proper triggers to get the voice helper to act on arbitrary text to improve it." Completes the open tail of EPIC #419 (sub-issue #423 plus surfaces not covered by any sub-issue).

## Clarifications

### Session 2026-06-06

- "All smithy skills" means a systematic sweep of **prose-bearing** surfaces (drafting sub-agent, narrative command sections, forge deliverables, review steps, the `smithy.engrave` decision/invariant prose) — not a literal pass over every skill. `[Critical Assumption]`
- `smithy.implementation-review` is excluded: it reviews code diffs, not prose. `[Critical Assumption]`
- Controlling invariant: integrations **reference the skill by name and load it on a trigger; they never inline its taxonomy.** Re-inlining would recreate the very drift EPIC #419 set out to remove. `[Critical Assumption]`
- Draft mode loads at authoring time inside prose-producing agents and commands; review / cleanup mode loads inside the post-generation review loop. No surface loads both for the same content in the same pass (the no-double-work split). `[Critical Assumption]`
- Review-mode voice is **qualitative** and scoped to narrative (Explanation) sections; the already-shipped audit voice-tag lint stays **mechanical** and owns tag-grammar / Reference-table enforcement. The two must not overlap. `[Critical Assumption]`
- Forge advertises the skill via its Operational Skills table (the `smithy.helper-docker` pattern); `smithy.maid` **flags** voice issues without fixing them (it is read-only by design). `[Critical Assumption]`
- The `.claude/` snapshot is **not** regenerated, templates stay parseable (`src/templates.test.ts`), and verification leans on `npm run eval` plus the template-parse test rather than new unit assertions. `[Critical Assumption]`
- `smithy.prose` deploys to `.claude/agents/` only (Claude), so the trim's lazy-skill-load semantics are uniform for that surface; command templates that reference the skill must still parse/deploy cleanly for all three agents. `[Critical Assumption]`
- `smithy.prose` is invoked **only by `smithy.spark` (PRD) and `smithy.ignite` (RFC Summary / Motivation / Personas)** — confirmed by grep across the command templates. The prose the other planning commands author (`smithy.render` feature map; `smithy.mark` spec / data-model / contracts; `smithy.cut` tasks; `smithy.strike`) is written **directly by the command**, not via `smithy.prose`. Therefore draft-mode voice for those artifacts is wired into the **commands themselves** (mirroring the forge model in US2), not by widening `smithy.prose`'s responsibility. `[Critical Assumption]`
- **Sub-agent roles vs. the voice helper.** Among the sub-agents, **only `smithy.prose` drafts artifact prose**. The rest are either **collators / proposers** (`plan`, `reconcile`, `slice`, `reconcile-slices`, `clarify`, `survey`) that return structured data the parent command writes, or **reviewers** (`refine`, `plan-review`, `scout`, `maid`) that return read-only findings, or **code** agents (`implement`, `implementation-review`). Collator/proposer sub-agents stay **voice-neutral** — their returns are Reference / `+ai-input` data, so voice applies when the parent command *renders* that data into the artifact, never inside the sub-agent (wiring voice into `plan`/`clarify`/`slice` is an explicit non-goal). The one borderline case is `smithy.survey`'s build-vs-buy rationale: survey returns the structured comparison, and `smithy.spark` writes the Alternatives narrative under voice-helper discipline — survey does not become a prose drafter. Reviewers interact with the skill in **review mode** (US3 for `refine` / `plan-review`; `maid` flags voice issues in forge deliverable prose); `implementation-review` is code-only and out of scope. `[Critical Assumption]`
- The current state is **tags without invocation**: the six command templates carry `<!-- audience: … -->` tags (shipped by #422) but **no template anywhere actually invokes `Skill("smithy.helper-voice")`**. "Integration" therefore means real invocation/advertisement wiring, not more tags.
- Data model is legitimately `N/A` (prose-template editing, no code-shaped contract).
- Terminology is locked to: **draft mode** and **review / cleanup mode** (the skill's two canonical mode names; this spec uses "review mode" only as shorthand for "review / cleanup mode"), **review category** (the named category added to refine / plan-review), **advertise** (frontmatter-level availability without auto-load, as forge does for `helper-docker`).

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

## User Scenarios & Testing *(mandatory)*

### User Story 1: Prose-drafting surfaces consult the skill in draft mode (Priority: P1)

As a Smithy maintainer, I want both the prose-drafting sub-agent **and** the planning commands that author prose directly to load `smithy.helper-voice` for shared voice taxonomy, so that there is one source of truth for voice across every artifact — not just the spark/ignite narrative that `smithy.prose` happens to cover — and the duplication tracked by sub-issue #423 is removed.

**Why this priority**: This is the canonical duplication EPIC #419 named, it has an open sub-issue (#423), and it is the highest-leverage surface. `smithy.prose` is invoked only by spark and ignite, so most planning-artifact prose (the feature map, spec user stories / acceptance scenarios, data-model and contracts prose, tasks) reaches the page through the **command**, not the sub-agent — those commands must invoke the voice helper directly (the same model US2 applies to forge). It also establishes the controlling invariant the other stories follow.

**Two distinct voice needs (same skill, opposite failure mode)**: This story wires the skill to two different jobs. `smithy.prose` (spark, ignite) consumes draft mode for **Explanation-mode quality** — persuasive narrative aimed at a human decision, where the failure mode is prose that is thin, depth-first, or commingled. The `render` / `mark` / `cut` commands have **no `mode: explanation` sections at all** (by their own audience tags, every section is `mode: reference` or `mode: how-to`); for them the command-direct load is a **Reference/How-to discipline guard** — compress to tables, use the `N/A — <reason>` fallback, and resist drifting into prose — i.e. the dense-prose-in-Reference failure in `.data-model.md` / `.contracts.md` that motivated EPIC #419. The implication: the goal is *not* to route every section through `smithy.prose`; narrative drafting belongs only to the upstream Explanation sections, while the downstream Reference/How-to artifacts need the skill as an anti-bloat guard, not a drafter.

**Independent Test**: Read `agents/smithy.prose.prompt`; confirm the **Prose principles — follow these on every sentence** list and the **Anti-pattern to avoid** block under `### Step 3: Draft the Sections` are replaced by a `Skill("smithy.helper-voice")` draft-mode reference, while the section-specific protocol (gap-marker rule, no-invented-figures, Summary / Motivation / Personas structure) remains. Run the ignite/spark eval scenarios and confirm no narrative-quality regression.

**Acceptance Scenarios**:

1. **Given** `smithy.prose` is invoked to draft a Summary, **When** it begins drafting, **Then** it references `smithy.helper-voice` for the shared voice taxonomy rather than relying on an inlined copy of the lead-with-impact / anti-pattern guidance.
2. **Given** the trimmed `smithy.prose`, **When** the file is inspected, **Then** the duplicated shared-principles and anti-pattern block is gone but every prose-specific rule the skill does **not** carry (gap markers `[X hours]`, no-invented-figures, per-section structure) is retained verbatim.
3. **Given** the planning commands that author prose directly — `spark` (PRD), `ignite` (RFC narrative), `render` (feature map), `mark` (spec / data-model / contracts), `cut` (tasks), `strike`, and the `engrave` decision/invariant/principle prose — **When** a prose section is drafted, **Then** the command invokes `Skill("smithy.helper-voice")` in draft mode rather than inlining voice prose. (`spark` and `ignite` continue to delegate their narrative to the trimmed `smithy.prose`, which now loads the skill per FR-001; the remaining commands invoke the skill directly.)
4. **Given** any integration edit in this story, **When** the edited prompt is inspected, **Then** no taxonomy text has been pasted inline — only a named skill reference (controlling invariant).

---

### User Story 2: Forge advertises the voice skill for deliverable prose (Priority: P1)

As a developer running `smithy.forge`, I want the voice skill advertised when I author deliverable prose (README, ADR, runbook, migration plan, substantive inline documentation), so that forge output gets the same voice discipline as planning artifacts — the explicitly in-scope "beyond Smithy" case from the skill's §10.

**Why this priority**: Forge is where Smithy's pipeline produces human-read deliverables; it is the largest body of prose currently outside any voice coverage. The change is a small, low-risk advertisement edit with no skill-body change.

**Independent Test**: Read `commands/smithy.forge.prompt`; confirm the Operational Skills table carries a `smithy.helper-voice` row with a load-when trigger scoped to deliverable prose. Read `agents/smithy.maid.prompt`; confirm it may flag voice anti-patterns as findings.

**Acceptance Scenarios**:

1. **Given** forge's Operational Skills table (which today lists only `smithy.helper-docker`), **When** it is inspected, **Then** it includes a `smithy.helper-voice` row whose trigger condition names README / ADR / runbook / migration-plan / substantive inline-doc authoring.
2. **Given** forge is producing a README or ADR in a slice, **When** the trigger condition fires, **Then** the agent loads `smithy.helper-voice` in draft mode for that deliverable.
3. **Given** `smithy.maid` scans a changed README or inline-doc block, **When** it detects a voice anti-pattern, **Then** it emits a **flag** finding (never an in-place edit) through its existing read-only finding channel.
4. **Given** routine code comments (non-substantive inline text), **When** forge runs, **Then** the voice trigger does **not** fire on them (bounded scope, avoids per-comment noise).

---

### User Story 3: Review steps apply voice review-mode as a named category (Priority: P2)

As a reviewer of Smithy planning artifacts, I want the existing review loop to surface voice/audience findings on narrative prose, so that wordy, depth-first, or commingled sections are caught without a separate review pass.

**Why this priority**: Review-mode integration delivers the user's "review steps" ask, but it carries more design nuance (category-vs-pass, overlap with the audit lint, finding-volume control) than the P1 stories, so it follows them.

**Independent Test**: Read `agents/smithy.refine.prompt` and confirm it accepts a parent-supplied "Voice & Audience" category; read `agents/smithy.plan-review.prompt` and confirm "Voice & Audience" is in its owned category list. Run a refine pass on a prose-bearing artifact and confirm voice findings flow through the existing triage with no in-place edits.

**Acceptance Scenarios**:

1. **Given** a parent command (`mark`, `ignite`, `render`, `cut`) invokes `smithy.refine` on a prose-bearing artifact, **When** it passes the audit categories, **Then** a "Voice & Audience" category is included and the agent loads `smithy.helper-voice` in review mode for it.
2. **Given** `smithy.plan-review`'s owned category list, **When** it runs on a planning artifact set, **Then** "Voice & Audience" is one of the categories it checks.
3. **Given** a voice finding is produced, **When** the review agent returns, **Then** the finding routes through the existing read-only finding/triage channel (RefineResult / ReviewResult) and the agent makes **no** in-place edit.
4. **Given** voice review-mode runs, **When** a section's tag grammar would be checked, **Then** review-mode does **not** re-run the mechanical tag lint — it applies qualitative judgment (lead-with-impact, depth-control, commingled audiences) to Explanation sections, leaving tag-drift to `smithy.audit`.
5. **Given** a section the current command just drafted under the skill in draft mode, **When** the same pass reaches review, **Then** that section is **not** voice-reviewed again (no double-work).
6. **Given** a Reference-heavy artifact (e.g., a spec that is mostly tables), **When** voice review-mode runs, **Then** findings are bounded/severity-capped so the review loop and debt table are not flooded with low-value style nits.

---

### User Story 4: Reliable trigger for arbitrary-text voice cleanup (Priority: P2)

As any developer (inside or outside a Smithy workflow), I want to point the voice helper at arbitrary text or a file and get a side-by-side cleanup, so that I can improve prose without first wrapping it in a planning artifact.

**Why this priority**: This is the user's explicit "act on arbitrary text" ask. It is P2 rather than P1 because the trigger mechanism is a genuine open decision (see SD-001) and depends on tuning rather than structural wiring.

**Independent Test**: Issue the named positive phrasings ("clean up the voice in this file", "improve the prose in this text", "apply audience tags to …") and confirm the skill auto-activates in review/cleanup mode; issue a mid-planning-workflow prose phrasing and confirm it does **not** over-fire.

**Acceptance Scenarios**:

1. **Given** a user types a standalone cleanup request ("clean up the voice in `path/to/file`"), **When** the agent evaluates available skills, **Then** `smithy.helper-voice` auto-activates in review/cleanup mode and returns the original-vs-revised side-by-side.
2. **Given** the skill body, **When** a user inspects it, **Then** it documents that review mode accepts an arbitrary file path or pasted text outside any Smithy planning workflow.
3. **Given** prose is being drafted mid-`smithy.mark` (where the parent template already governs voice), **When** the trigger phrasing is evaluated, **Then** the arbitrary-text trigger does **not** over-activate.

---

### User Story 5: Reconcile stale voice-status claims and the examples-enum divergence (Priority: P3)

As a maintainer reading the voice documentation, I want the skill, README, and CLAUDE.md to reflect the shipped state of the audit lint and to agree on the `examples` enum, so that future contributors do not re-plan finished work or apply conflicting enum rules.

**Why this priority**: These are correctness fixes to prose surfaces in-theme with this feature, but they block nothing and have no user-facing behavior; P3.

**Independent Test**: `grep -r "planned in slice 4"` across the skill, README, and CLAUDE.md returns nothing; the `examples` enum is identical across the skill §8, the README convention section, and `audit-checklist-voice.md`.

**Acceptance Scenarios**:

1. **Given** the audit voice-tag lint has shipped (#424/#435), **When** the skill §8, README convention section, and CLAUDE.md skill line are inspected, **Then** none of them describes the lint as "planned in slice 4 of EPIC #419" — each reflects the shipped state.
2. **Given** the `examples` enum divergence (the audit snippet accepts a 5th value `optional`; the skill and README omit it), **When** the three surfaces are compared, **Then** the enum is identical across all three per the resolution chosen for SD-002.

### Edge Cases

- **Cross-agent deployment.** `smithy.prose` is Claude-only, so its trim is safe; but command templates that newly reference the skill must still parse and deploy for Gemini and Codex, where skill auto-load semantics differ.
- **Trigger over-/under-activation.** The arbitrary-text trigger must fire on standalone cleanup phrasings yet stay silent on prose being authored mid-workflow.
- **Audit-lint overlap.** Review-mode voice must not double-report what the mechanical tag lint already enforces.
- **Finding-volume blowup.** Reference-heavy artifacts (specs are mostly tables) must not generate a flood of voice nits.
- **Snapshot drift pressure.** An automated reviewer may ask to regenerate `.claude/` to match the source edits; per CLAUDE.md this must be declined.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| US1 | Prose-drafting surfaces consult the skill in draft mode (smithy.prose trim + planning commands invoke directly) | — | `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/01-prose-drafting-surfaces-consult-the-skill-in-draft-mode.tasks.md` |
| US2 | Forge advertises the voice skill for deliverable prose | — | `specs/2026-06-06-012-integrate-the-voice-helper-across-smithy-prose-surfaces/02-forge-advertises-the-voice-skill-for-deliverable-prose.tasks.md` |
| US3 | Review steps apply voice review-mode as a named category | — | — |
| US4 | Reliable trigger for arbitrary-text voice cleanup | — | — |
| US5 | Reconcile stale voice-status claims and the examples-enum divergence | — | — |

All five stories edit largely disjoint template files and share no data-flow prerequisite — the skill's two-mode contract is already shipped and stable, so no foundation slice gates the others. They may be implemented concurrently. (US1, US4, and US5 each touch the `SKILL.prompt` file in different regions — frontmatter description, §8 body, and the Coexistence note respectively — so coordinate at merge, but this is a file-overlap concern, not a logical dependency.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `smithy.prose` (invoked only by `smithy.spark` and `smithy.ignite`) MUST consult `smithy.helper-voice` for the shared voice taxonomy in draft mode and MUST remove its inlined duplicate shared-principles / anti-pattern block, while retaining its section-specific protocol (gap-marker rule, no-invented-figures, Summary / Motivation / Personas structure). *(US1; closes #423)*
- **FR-002**: The planning commands that author prose directly — `spark`, `ignite`, `render`, `mark`, `cut`, `strike`, and `engrave` (decision/invariant/principle prose) — MUST invoke `Skill("smithy.helper-voice")` in draft mode for the prose they write, rather than inlining voice guidance. Because `smithy.prose` covers only the spark/ignite narrative sections, the other commands' artifact prose (feature map, spec user stories / acceptance scenarios, data-model, contracts, tasks) reaches the page through the command itself and must be wired at that layer — mirroring the forge advertisement model in US2. For the Reference/How-to commands (`render`, `mark`, `cut`), the load's purpose is voice **discipline** — keep sections table-shaped, apply the `N/A — <reason>` fallback, and prevent dense-prose-in-Reference — not narrative drafting. *(US1)*
- **FR-003**: No integration in this feature MUST inline the skill's taxonomy text; every integration MUST reference the skill by name and load it on a trigger (controlling invariant). *(US1, US2, US3)*
- **FR-004**: `smithy.forge` MUST advertise `smithy.helper-voice` in its Operational Skills table with a load-when trigger covering README, ADR, runbook, migration-plan, and substantive inline-doc authoring. *(US2)*
- **FR-005**: `smithy.maid` MUST be permitted to **flag** (never fix) voice anti-patterns in prose it already scans, emitting them through its existing read-only finding channel. *(US2)*
- **FR-006**: `smithy.refine` MUST accept a "Voice & Audience" review category supplied by parent commands, and `smithy.plan-review` MUST add "Voice & Audience" to its owned category list. *(US3)*
- **FR-007**: Voice review-mode findings MUST route through the existing read-only finding/triage channels (RefineResult / ReviewResult); review agents MUST NOT edit prose in place. *(US3)*
- **FR-008**: Voice review-mode MUST be scoped to narrative (Explanation) sections and MUST NOT re-run the mechanical tag-grammar lint already owned by `smithy.audit` (qualitative rewrite vs. mechanical tag-drift). *(US3)*
- **FR-009**: Parent commands MUST add the voice category only when reviewing prose-bearing artifacts, and a section drafted under the skill in the current pass MUST NOT be voice-reviewed again in that same pass. *(US3)*
- **FR-010**: Voice review-mode findings MUST be bounded (severity-capped / count-limited like other non-critical refine findings) so they do not flood review loops or debt tables. *(US3)*
- **FR-011**: The skill's frontmatter `description` MUST be sharpened so review/cleanup mode reliably auto-activates on standalone arbitrary-text phrasings (e.g., "clean up the voice in this file", "improve the prose in this text", "apply audience tags to …"). *(US4)*
- **FR-012**: The skill body MUST document that review mode accepts an arbitrary file path or pasted text outside any Smithy planning workflow. *(US4)*
- **FR-013**: The arbitrary-text trigger MUST NOT over-activate on prose being authored mid-Smithy-workflow where the parent template already governs voice. *(US4)*
- **FR-014**: The "planned in slice 4 of EPIC #419" claims in the skill §8, the README voice-convention section, and the CLAUDE.md skill line MUST be updated to reflect that the audit voice lint has shipped. *(US5)*
- **FR-015**: The `examples` enum MUST be made identical across the skill §8, the README, and `audit-checklist-voice.md` (resolving the `optional` divergence per SD-002). *(US5)*
- **FR-016**: All template edits MUST keep templates parseable (`src/templates.test.ts`) and MUST NOT regenerate the `.claude/` snapshot or `.smithy/smithy-manifest.json`. *(cross-cutting; verified by SC-007)*

### Key Entities *(include if feature involves data)*

None — this feature edits prompt-template prose and skill-invocation wiring. It introduces no new entities, schemas, or persisted state. See `integrate-the-voice-helper-across-smithy-prose-surfaces.data-model.md`.

## Assumptions

- "All smithy skills" is a systematic sweep of prose-bearing surfaces, not a literal pass over every skill.
- `smithy.implementation-review` is excluded (it reviews code, not prose). `[Critical Assumption]`
- Integrations reference the skill and load on trigger; they never inline its taxonomy. `[Critical Assumption]`
- Draft mode and review mode never both run on the same content in the same pass. `[Critical Assumption]`
- Review-mode voice is qualitative on narrative sections; the shipped audit lint stays mechanical and owns tag-grammar enforcement. `[Critical Assumption]`
- Forge advertises the skill via its Operational Skills table; `smithy.maid` flags, never fixes. `[Critical Assumption]`
- The `.claude/` snapshot is not regenerated; templates stay parseable; verification leans on `npm run eval` plus the template-parse test. `[Critical Assumption]`
- `smithy.prose` is Claude-only deployed, so its trim is safe; command templates referencing the skill must still parse/deploy for all three agents. `[Critical Assumption]`
- Data model is legitimately `N/A`.
- The terms draft mode / review mode / review category / advertise are defined once and used consistently.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Unresolved choice for the arbitrary-text voice-cleanup trigger: (a) description-tuning only — sharpen the skill's frontmatter `description` so review/cleanup mode auto-activates on standalone phrasings and document that review mode accepts an arbitrary file path or pasted text (no new surface); versus (b) add a dedicated `/smithy.voice` (or similar) slash command as an explicit invocation point. The user explicitly asked for "proper triggers," and the reconciled plan recommends (a), but the emphasis on "proper triggers" makes the choice a genuine steering decision the codebase cannot settle. | Interaction & UX / Edge Cases | High | Medium | open | — |
| SD-002 | Unresolved direction for the `examples`-enum reconciliation: the shipped audit lint (`audit-checklist-voice.md`) accepts a 5th value `optional` ("imposes no example constraint"), but the skill §8 and README omit it. Either (a) the skill + README adopt `optional` to match the already-shipped lint, or (b) the lint drops `optional` to match the skill's four-value enum. Option (a) is lower-risk because the lint is live and re-flagging existing tags is undesirable; option (b) keeps the canonical taxonomy minimal. The choice changes which surface is edited and whether existing tags must be re-audited. | Integration / Terminology | Medium | Medium | open | — |
| SD-003 | The draft-time hook point for `smithy.strike` and `smithy.engrave` is named as a target (FR-002, US1 Acceptance Scenario 3) but not pinned: `strike` is one-shot and may lack a discrete narrative Explanation section comparable to ignite's Summary/Motivation, and `engrave`'s decision/invariant prose has no specified load point in its flow. Confirm whether each command has a narrative section warranting a draft-mode skill load (and where), or whether one or both belong in a follow-on alongside the other deferred surfaces. | plan-review:Logical gap | Important | Low | open | — |

## Out of Scope

- `smithy.implementation-review` voice integration (it reviews code diffs, not prose).
- Draft-mode wiring of `smithy.plan` / `smithy.reconcile` (they emit structured plan tables consumed by `smithy-reconcile`, not human narrative).
- `smithy.status` and `smithy.orders` (no authored narrative prose; issue bodies are Reference-shaped scaffolds).
- A dedicated arbitrary-text slash command (e.g., `/smithy.voice`) — deferred pending SD-001; US4's description-tuning satisfies the stated intent. Revisit if evals show auto-trigger unreliable.
- Extending the audit lint to free-form in-repo docs (READMEs/ADRs) that carry no template tags — the lint degrades to heuristics without tags; a candidate follow-on.
- Regenerating the committed `.claude/` snapshot or the manifest (per CLAUDE.md, snapshots refresh only in dedicated chore PRs).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least one agent actually issues `Skill("smithy.helper-voice")` (verified by an eval scenario), where today zero templates invoke it.
- **SC-002**: `smithy.prose` no longer contains the duplicated shared-principles / anti-pattern block, its section-specific protocol is intact, and ignite/spark eval scenarios show no narrative-quality regression.
- **SC-003**: Forge's Operational Skills table lists `smithy.helper-voice` with a trigger condition scoped to deliverable prose.
- **SC-004**: A "Voice & Audience" review category appears in `smithy.refine` (caller-supplied) and `smithy.plan-review` (owned), and an eval shows voice findings routed through existing channels with no in-place edits.
- **SC-005**: Named positive arbitrary-text phrasings activate review mode; named mid-workflow negatives do not (eval/smoke).
- **SC-006**: `grep` for "planned in slice 4" across the skill, README, and CLAUDE.md returns nothing, and the `examples` enum is identical across the three surfaces.
- **SC-007**: `npm test` and `npm run typecheck` pass, and the `.claude/` snapshot is unchanged in the PR diff.
