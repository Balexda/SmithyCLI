# Feature Specification: smithy.persona Command and Ignite Persona Reuse

**Spec Folder**: `2026-06-05-011-smithy-persona-command`
**Branch**: `feature/persona-planning` *(orchestrator-prestaged branch; this run executed inside a linked worktree on a non-default branch, so the branch was preserved rather than auto-named)*
**Created**: 2026-06-05
**Status**: Draft
**Input**: Feature description — add a `smithy.persona` command that generates a durable `.persona.md` artifact (from a free-text description, or one per persona when pointed at an RFC), and amend `smithy.ignite` to reuse pre-existing `.persona.md` files before generating new personas.

## Clarifications

### Session 2026-06-05

- _The new `smithy.persona` command follows smithy.spark's structural contract exactly: one-shot (no STOP gates), `$ARGUMENTS`-based routing with an ask-fallback when no input is clear, `{{artifactsRoot}}`-prefixed output paths._ `[Critical Assumption]`
- _The `.persona.md` schema is `# Persona: <Name/Role>` + `**Created**: YYYY-MM-DD` + a narrative body covering (1) role/context, (2) friction today, (3) how their work changes — mirroring the smithy-prose Personas contract. No `## Dependency Order`, no M/F/US/S ID, no `## Specification Debt` table inside the file._ `[Critical Assumption]`
- _Storage is flat at `{{artifactsRoot}}docs/personas/<slug>.persona.md`, slug-named with NO date/sequence prefix (durable, shared — not sequentially versioned). The convention is authored once in `src/templates/agent-skills/README.md` and referenced by both commands._ `[Critical Assumption]`
- _The new command reuses the existing smithy-prose sub-agent as drafter via `section_assignment: "Personas"`. No new drafting sub-agent is created._ `[Critical Assumption]`
- _ignite reuse attaches at Sub-phase 3b (pre-draft reuse) and non-clobber at Sub-phase 3g (harmonize / Personas-repair)._ `[Critical Assumption]`
- _RFC-mode emits one `.persona.md` per persona in the RFC's `## Personas` section, tolerating both bulleted and narrative-prose forms; an empty/placeholder section produces zero files plus a diagnostic._ `[Critical Assumption]`
- _RFC-mode filename collisions are handled by skip-and-report (never silent overwrite); the update-existing path is out of scope. `.persona.md` is out of scope for `smithy.orders`._ `[Critical Assumption]`
- _Six user stories: US1 storage+schema convention (P1), US2 free-text mode (P1), US3 RFC mode (P1), US4 ignite 3b reuse (P1), US5 ignite 3g non-clobber (P1), US6 RFC-mode parsing robustness + empty-section handling (P2)._ `[Critical Assumption]`
- _Free-text-mode slugs are derived by LLM inference from the persona name/role into kebab-case, following spark's by-example derivation. Determinism only becomes load-bearing for ignite's cross-RFC matching — see SD-001/SD-002._

## Artifact Hierarchy

RFC → Milestone → Feature → User Story → Slice → Tasks

> **Note:** `.persona.md` is an **orthogonal artifact** that sits *outside* this
> lineage (like `.prd.md`). It is durable and cross-RFC: one persona file may be
> referenced by many RFCs. It therefore carries no `## Dependency Order` role and
> is never a downstream `Artifact` target of a milestone/feature/story row.

## User Scenarios & Testing *(mandatory)*

### User Story 1: Establish the `.persona.md` schema and storage convention (Priority: P1)

As a Smithy maintainer, I want the `.persona.md` format and its storage/discovery
location defined once in a single source of truth, so that the producer command and
the ignite consumer bind to the same contract and cannot drift.

**Why this priority**: Load-bearing for US2–US5. The schema is the shared contract
between producer and consumer; without a deterministic storage location, ignite's
detection logic has no defined input. It must land first.

**Independent Test**: Inspect `src/templates/agent-skills/README.md` for a section
defining the `.persona.md` schema and the `{{artifactsRoot}}docs/personas/<slug>.persona.md`
convention, and confirm it states the artifact sits outside the `## Dependency Order`
lineage.

**Acceptance Scenarios**:

1. **Given** the README, **When** a contributor looks for where persona files live, **Then** exactly one section defines the path convention and schema, and both `smithy.persona` and `smithy.ignite` reference it rather than restating the literal path.
2. **Given** the schema definition, **When** a persona file is authored, **Then** it has a `# Persona: <Name/Role>` heading, a `**Created**: YYYY-MM-DD` line, a narrative body, and no `## Dependency Order` / M·F·US·S ID / inline debt table.

---

### User Story 2: Generate a persona from a free-text description (Priority: P1)

As a developer, I want to run `smithy.persona "<description>"` and get a single durable
`.persona.md`, so that I can capture a reusable persona for UX/design discussions
without an RFC.

**Why this priority**: The minimum viable command — one input, one file. Everything
else builds on the writer it establishes.

**Independent Test**: Run the command with a free-text role description; confirm one
well-formed `.persona.md` is written to the documented path with a kebab-case slug
derived from the persona name/role.

**Acceptance Scenarios**:

1. **Given** a free-text description, **When** the command runs, **Then** exactly one `.persona.md` is written at `{{artifactsRoot}}docs/personas/<slug>.persona.md`, drafted by the smithy-prose sub-agent.
2. **Given** no input is clear (e.g. `$ARGUMENTS` empty on Gemini/Codex), **When** the command runs, **Then** it asks the user what persona to generate rather than failing.
3. **Given** the command runs, **When** it completes, **Then** it is one-shot — no intermediate approval STOP — matching smithy.spark.

---

### User Story 3: Generate persona files from an RFC's `## Personas` section (Priority: P1)

As a developer adopting Smithy on an existing project, I want `smithy.persona <rfc-path>`
to extract one `.persona.md` per persona named in the RFC, so that I can seed the durable
persona store from RFCs that already describe their actors.

**Why this priority**: This is what populates the durable store from existing RFCs —
without it, the ignite-reuse behavior (US4) has little to reuse on day one.

**Independent Test**: Point the command at an `.rfc.md` whose `## Personas` section
lists N named personas; confirm N `.persona.md` files are produced (or fewer, with a
skip-and-report line for any pre-existing slug collision).

**Acceptance Scenarios**:

1. **Given** an RFC with N named personas, **When** the command runs in RFC mode, **Then** N `.persona.md` files are written, one per persona.
2. **Given** a target slug already exists on disk, **When** RFC mode runs, **Then** that persona is skipped and reported (never silently overwritten), and the remaining personas are still written.
3. **Given** the input path ends in `.rfc.md`, **When** the command routes, **Then** it selects RFC mode; otherwise it selects free-text mode.

---

### User Story 4: Ignite reuses existing persona files before generating new ones (Priority: P1)

As an RFC author, I want `smithy.ignite` to consider pre-existing `.persona.md` files
first when determining an RFC's personas, so that the same durable persona is reused
across RFCs instead of being re-invented each time.

**Why this priority**: The headline reason the feature exists — the second half of the
original request.

**Independent Test**: With one or more `.persona.md` files present, run ignite; confirm
the resulting RFC `## Personas` section reflects the durable personas (projected as "how
this RFC benefits them") and that cold-drafting only occurs for personas not covered by a
file.

**Acceptance Scenarios**:

1. **Given** persona files exist at the documented location, **When** ignite reaches Sub-phase 3b, **Then** it discovers them before dispatching smithy-prose to draft cold.
2. **Given** a needed RFC persona is covered by an existing file, **When** ignite drafts `## Personas`, **Then** it projects the durable persona into the RFC ("how this RFC benefits them") rather than inventing a fresh one.
3. **Given** a needed persona has no matching file, **When** ignite drafts `## Personas`, **Then** it generates new persona content only for that gap.

---

### User Story 5: Harmonize preserves file-sourced persona content (Priority: P1)

As an RFC author, I want ignite's harmonize pass to leave reused persona content intact,
so that a coherence/repair pass does not silently overwrite personas that came from
`.persona.md` files with clarification-only re-drafts.

**Why this priority**: Sub-phase 3g currently re-dispatches smithy-prose sourcing only
from clarification and "replaces the `## Personas` section in place" — a verified
regression surface. Reusing files in 3b without guarding 3g would reintroduce the bug on
any repair trigger.

**Independent Test**: Force a harmonize/Personas-repair pass on an RFC whose personas were
sourced from files; confirm the file-sourced content survives the pass.

**Acceptance Scenarios**:

1. **Given** an RFC whose `## Personas` was populated from `.persona.md` files, **When** Sub-phase 3g runs its Personas verification/repair, **Then** it re-projects from the source files rather than regenerating from clarify output.
2. **Given** the Personas section is well-formed and file-sourced, **When** harmonize completes, **Then** the file-sourced persona content is unchanged (only position/formatting may be normalized).

---

### User Story 6: Robust RFC `## Personas` parsing and empty-section handling (Priority: P2)

As a developer, I want RFC mode to parse both bulleted and narrative-prose persona
sections and to refuse to write placeholder personas, so that real RFCs (whose personas
are drafted as narrative character sketches) produce correct files and empty sections
produce none.

**Why this priority**: smithy-prose's documented contract emits *narrative* personas, so a
bullets-only parser would miss real RFCs. Correctness, but layered on top of the core RFC
mode (US3).

**Independent Test**: Run RFC mode against (a) a bulleted `## Personas`, (b) a narrative
`## Personas`, and (c) a placeholder/empty section; confirm correct file counts and a
diagnostic for (c).

**Acceptance Scenarios**:

1. **Given** a narrative-prose `## Personas` (one character sketch per role), **When** RFC mode parses it, **Then** it produces one `.persona.md` per named persona.
2. **Given** a bulleted `## Personas`, **When** RFC mode parses it, **Then** it produces one file per bullet/persona.
3. **Given** an empty or placeholder-only section (e.g. the `<Persona 1 ...>` literal), **When** RFC mode runs, **Then** it writes zero files and emits a diagnostic — never a placeholder persona.

### Edge Cases

- An RFC persona partially matches an existing file (e.g. role renamed) — see SD-001 (matching rule).
- A persona name produces a slug that collides with an unrelated existing persona — skip-and-report (FR-009); ambiguity in *matching* vs *colliding* is steered by SD-001/SD-002.
- ignite finds zero `.persona.md` files — behaves exactly as today (cold-draft all personas).
- `{{artifactsRoot}}` external-artifacts mode: reuse only spans personas under the same artifacts root.
- `$ARGUMENTS` passed literally on Gemini/Codex — ask-fallback engages.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| US1 | Establish the `.persona.md` schema and storage convention | — | specs/2026-06-05-011-smithy-persona-command/01-establish-persona-schema-storage-convention.tasks.md |
| US2 | Generate a persona from a free-text description | US1 | — |
| US4 | Ignite reuses existing persona files before generating new ones | US1 | — |
| US3 | Generate persona files from an RFC's `## Personas` section | US1, US2 | — |
| US5 | Harmonize preserves file-sourced persona content | US4 | — |
| US6 | Robust RFC `## Personas` parsing and empty-section handling | US3 | — |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST define a `.persona.md` artifact format consisting of a `# Persona: <Name/Role>` H1 heading, a `**Created**: YYYY-MM-DD` metadata line, and a narrative body covering (1) the persona's role and the context in which they encounter the system, (2) the friction they experience today, and (3) how their work changes concretely if relevant capabilities ship.
- **FR-002**: Persona files MUST be stored flat at `{{artifactsRoot}}docs/personas/<slug>.persona.md`, named by a kebab-case slug with NO date or sequence prefix.
- **FR-003**: The `.persona.md` schema and storage/discovery convention MUST be documented exactly once in `src/templates/agent-skills/README.md`; `smithy.persona` and `smithy.ignite` MUST reference that convention rather than restating the literal path.
- **FR-004**: A `.persona.md` file MUST NOT participate in the `## Dependency Order` lineage — no M/F/US/S identifier, no `## Dependency Order` section, no registry/index entity, and no `## Specification Debt` table inside the file.
- **FR-005**: `smithy.persona <description>` MUST produce exactly one `.persona.md` from a free-text description (unless the derived slug collides with an existing file — see FR-009), drafted via the smithy-prose sub-agent with `section_assignment: "Personas"`.
- **FR-006**: The command MUST derive each persona's filename slug in kebab-case from the persona's name/role.
- **FR-007**: The command MUST run one-shot (no STOP gates), modeled on smithy.spark, and MUST ask the user what to generate when no input is clear (`$ARGUMENTS` ask-fallback for Gemini/Codex parity).
- **FR-008**: `smithy.persona <path-to-.rfc.md>` MUST read the RFC's `## Personas` section and produce one `.persona.md` per persona listed.
- **FR-009**: On a filename-slug collision with an existing persona file, the command MUST skip that persona and report it — in **both** free-text mode and RFC mode; it MUST NOT silently overwrite a pre-existing durable persona file in either mode.
- **FR-010**: The command MUST route to RFC mode when the input is an `.rfc.md` path, and to free-text mode otherwise.
- **FR-011**: ignite Sub-phase 3b MUST discover existing `.persona.md` files (via the FR-003 convention) before dispatching smithy-prose to draft personas cold.
- **FR-012**: For an RFC persona covered by an existing `.persona.md`, ignite MUST project the durable persona into the RFC's `## Personas` section (framed as how this RFC benefits them) rather than inventing a new persona.
- **FR-013**: ignite MUST generate new persona content only for personas not covered by an existing file.
- **FR-014**: ignite Sub-phase 3g (harmonize / Personas-repair) MUST NOT overwrite persona content sourced from `.persona.md` files; when file-sourced personas exist, the repair MUST re-project from the source files rather than regenerate from clarify output.
- **FR-015**: RFC-mode parsing MUST tolerate both bulleted-template and narrative-prose `## Personas` forms, splitting one `.persona.md` per named persona.
- **FR-016**: An empty or placeholder-only `## Personas` section (e.g. the `<Persona 1 ...>` literal) MUST produce zero files and a diagnostic — never a placeholder persona file.

### Key Entities *(include if feature involves data)*

- **Persona (`.persona.md`)**: A durable, cross-RFC description of an actor — role/context, friction today, and how their work changes. Authored by `smithy.persona`, consumed by `smithy.ignite`. Lives outside the dependency lineage. See `smithy-persona-command.data-model.md`.

## Assumptions

- The new command follows smithy.spark's one-shot structural contract (routing, `$ARGUMENTS` ask-fallback, `{{artifactsRoot}}` paths). `[Critical Assumption]`
- The `.persona.md` schema mirrors the smithy-prose Personas contract (role/context, friction today, how work changes). `[Critical Assumption]`
- Storage is flat `{{artifactsRoot}}docs/personas/<slug>.persona.md`, slug-named, no date/sequence prefix; convention authored once in README. `[Critical Assumption]`
- The command reuses the smithy-prose sub-agent as drafter; no new drafting sub-agent. `[Critical Assumption]`
- ignite reuse attaches at Sub-phase 3b and non-clobber at Sub-phase 3g. `[Critical Assumption]`
- RFC mode emits one file per persona, tolerating bulleted and narrative forms; empty/placeholder → zero files + diagnostic. `[Critical Assumption]`
- Collision handling is skip-and-report; update-existing deferred; `.persona.md` out of scope for smithy.orders. `[Critical Assumption]`
- Six user stories (US1–US6) as listed. `[Critical Assumption]`
- Free-text slug derivation is by LLM inference (spark precedent); its determinism only matters for matching (SD-001/SD-002).

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Unresolved choice for the rule by which ignite Sub-phase 3b decides a pre-existing `.persona.md` "covers" a needed RFC persona: exact role/name-string match, fuzzy/semantic similarity, or user-confirmed selection. Each path changes what US4 specifies (deterministic testable comparison vs. LLM judgment vs. an interactive prompt that breaks ignite's one-shot flow). No codebase precedent for cross-artifact persona discovery. | Integration / Edge Cases | High | Low | open | — |
| SD-002 | Unresolved choice for whether `.persona.md` should carry a stable machine-readable identity field (e.g. a `slug:` or `**Role**:` key) to make ignite discovery deterministic, vs. relying purely on filename-slug comparison, vs. narrative content matching. Trades off against the settled "no registry/index" decision (a per-file identity key is not a registry but moves toward one). Changes both the US1 schema and the US4 matching mechanic. | Domain & Data Model | High | Low | open | — |
| SD-003 | Unresolved choice for how ignite Sub-phase 3b (and the command's projection path) feed an existing `.persona.md`'s content to smithy-prose, given that smithy-prose's documented input contract has no parameter for existing-persona-file context (only `section_assignment`, `idea_description`, `clarify_output`, `rfc_file_path`, `tone_directives`). Options: smuggle via `clarify_output`, fold into `rfc_file_path` reading, or add a new optional `source_persona_paths` parameter (amending smithy-prose). | Integration | High | Medium | open | — |
| SD-004 | Unresolved choice for how ignite Sub-phase 3g detects that the current on-disk `## Personas` content is **file-sourced** (provenance), especially when a harmonize/repair runs on resume from the on-disk RFC with no in-memory record of 3b's reuse. Options: an inline marker/comment in the RFC, sidecar state, or deterministic re-discovery (re-run the 3b match against the persona directory). Without a chosen mechanism, 3g can misclassify file-sourced content and regenerate from `clarify_output` — the exact clobber US5 is meant to prevent. Distinct from SD-001 (3b coverage matching) and SD-003 (prose handoff). | Integration / Edge Cases | High | Low | open | — |

## Out of Scope

- Adding `.persona.md` to the `smithy.orders` artifact-type registry — personas produce no GitHub issues.
- A persona registry/index file, `smithy status` integration, and persona→RFC back-reference link-tracking.
- Cross-persona deduplication/merge logic.
- An update-existing / overwrite path (re-running on a source updates a persona in place) — deferred; v1 default is skip-and-report.
- A Phase-0 review/edit loop for an existing `.persona.md` (spark has one; persona can add it later).
- Having ignite delegate persona generation *entirely* to `smithy.persona` (cleanest boundary, removes the 3b/3g clobber class) — a strong follow-on direction, but it changes ignite's standalone contract for users with no personas, so it is deferred.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can run `smithy.persona "<role description>"` and receive exactly one well-formed `.persona.md` at `{{artifactsRoot}}docs/personas/<slug>.persona.md`.
- **SC-002**: Running `smithy.persona <rfc>` on an RFC with N named personas yields N `.persona.md` files (fewer only when a collision is skipped-and-reported), and zero files plus a diagnostic for an empty/placeholder section.
- **SC-003**: With persona files present, an ignite run's resulting RFC `## Personas` reflects the durable personas without re-inventing covered ones, and a subsequent harmonize pass leaves file-sourced content intact.
- **SC-004**: The `.persona.md` schema and storage/discovery convention appear exactly once in `src/templates/agent-skills/README.md`, and neither `smithy.persona` nor `smithy.ignite` restates the literal path.
