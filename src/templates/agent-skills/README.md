# Agent Skills Templates

This directory contains the prompt templates that Smithy deploys into target
repositories. Templates are written as [Dotprompt](https://firebase.google.com/docs/genkit/dotprompt)
`.prompt` files with YAML frontmatter and Handlebars-rendered body text.

## Directory Structure

```
agent-skills/
  commands/    Slash commands / project skills (invocable as /smithy.<name>
               where supported, or as loaded skills)
  prompts/     Reference prompts (readable by the AI, not invocable)
  agents/      Sub-agent definitions (dispatched by parent commands)
  skills/      Lazy-loaded operational skills (frontmatter visible, body
               loaded on Skill("<name>") invocation only; each skill is a
               directory holding SKILL.prompt plus optional scripts/ and
               references/ — see Skill Bundles below)
  snippets/    Shared Handlebars partials injected via {{>partial-name}}
```

See the README in each subdirectory for details on its contents and conventions.

## Dotprompt Conventions

- **Extension**: `.prompt` (Dotprompt native format)
- **Frontmatter**: YAML between `---` fences. Contains `name`, `description`,
  and for agents: `tools` and a provider-neutral `tier` (see *Sub-Agent Model
  Tiers* below).
- **Body**: Markdown with Handlebars expressions. Dotprompt resolves partials
  (`{{>snippet-name}}`) and conditionals (`{{#ifAgent}}...{{/ifAgent}}`) at
  deploy time.
- **Deploy transform**: Claude **command** frontmatter is *translated* — reduced
  to the keys Claude Code reads on a command file (`description`,
  `argument-hint`, `disable-model-invocation`, `allowed-tools`, `model`,
  `context`, `agent`, `background`, `hooks`), with `name` and every other
  source key dropped;
  see [`commands/README.md`](commands/README.md#frontmatter). Claude **prompt**
  frontmatter is still stripped outright — prompts are read as files, not
  registered. Gemini and Codex keep the source block verbatim for both. Files
  are renamed from `.prompt` to `.md`. Sub-agents deploy with frontmatter intact to
  `.claude/agents/` (Claude) and are translated into Codex custom-agent TOML at
  `.codex/agents/` — note the two filename schemes: Claude keeps the source
  `.prompt` filename (`smithy.plan.prompt` → `smithy.plan.md`) while Codex uses
  the frontmatter `name` (`smithy-plan` → `smithy-plan.toml`).
- **Skill tool grants**: `allowed-tools` is a Claude Code field written in
  Claude Code's permission grammar, so the deployers pick per target rather
  than shipping one block three ways — Claude keeps it, Gemini drops it, and
  Codex gets whatever the template put under `codex-allowed-tools` (see
  [`src/skill-frontmatter.ts`](../../skill-frontmatter.ts)). Write Bash rules
  in the `Bash(command *)` form and reach bundled scripts through
  `${CLAUDE_SKILL_DIR}`, which Claude Code expands in the rule and in the body
  alike; the full grammar is in
  [`docs/permission-grammar.md`](../../../docs/permission-grammar.md).

## Skill Bundles and Progressive Disclosure

A skill under `skills/` is a **directory**, not a single file, and the
deployers copy all three of its parts to every target:

| Part | Source | Deployed as | Loaded |
|------|--------|-------------|--------|
| Body | `SKILL.prompt` | `SKILL.md` (frontmatter retained) | Whole, on every `Skill("<name>")` invocation |
| Scripts | `scripts/*.sh` | `scripts/*.sh`, mode `0755` | On execution |
| Reference files | `references/*.prompt` (or any other bundled file) | same relative path, `.prompt` → `.md` | Only when the body's link sends the agent to read one |

**Reference files are the progressive-disclosure half of a skill.** A skill
body is charged to context in full every time it loads, so material an agent
needs only *sometimes* — worked examples, copy-ready skeletons, a checklist
that applies to one of two modes, a payload contract for one branch — belongs
in a bundled file the body *links* to rather than inlines. Claude Code's own
guidance is to keep a `SKILL.md` under ~500 lines and move detail into
bundled files; `src/templates.test.ts` enforces that ceiling on every Smithy
skill body.

Two rules keep the split honest, both enforced by `templates.test.ts`:

- **Every bundled file is linked from the body that ships it.** A file
  nothing links to never loads, and a link with no file behind it is worse
  than the inline text it replaced.
- **The body says *when* to read each file**, not just that it exists —
  "read this in review mode", "read this before interpreting the engraved
  payload". A pointer with no trigger gets read always or never.

**Author bundled prose as `.prompt`, not `.md`.** A bundled `.prompt` goes
through the same snippet/Handlebars rendering as the body and deploys as `.md`,
exactly like every command, prompt, and agent template — so a reference file
can use `{{artifactsRoot}}`, `{{#ifAgent}}`, and `{{>snippet}}`. Writing one as
`.md` instead skips rendering, which is how a `{{artifactsRoot}}` reference
ships into a target repo as literal text; it also breaks the tree-wide read
that **`.md` in `src/templates/` is never deployed** (only READMEs and
snippets are `.md`). Every other file is copied byte-for-byte, so a skill can
ship a JSON schema or a fixture without it being parsed as a template.
Dot-entries are skipped. `templates.test.ts` fails on a stray non-README `.md`
under `skills/`.

Note the deliberate mismatch when linking: the source file is
`references/worked-examples.prompt` and the body links
`references/worked-examples.md`, because links resolve against the *deployed*
tree. The link↔file test above catches a link left pointing at `.prompt`.

Reference files are manifest-tracked like any other artifact, so `uninit`
removes them and `update` replaces them.

**Frontmatter deliberately omits `paths:`.** Claude Code supports a `paths:`
key that limits *automatic* activation to sessions touching matching files,
which looks like a fit for `smithy.helper-screen-design` and
`smithy.helper-flow-definition` (`design/screens/**`, `design/flows/**`). It
is not adopted, for two reasons: those two skills are dispatched explicitly
by `smithy.mark` *before* the design files exist, so gating on the paths
would risk suppressing the one dispatch that needs them; and the key is a
Claude Code extension, while Smithy deploys skill frontmatter verbatim to
Gemini and Codex, where a non-spec key is an unexpected-key risk rather than
a no-op. Revisit if the dispatch ever follows the files instead of preceding
them.

## Workflow Pipeline

The commands form a pipeline where each stage produces artifacts consumed by
the next:

```
ignite (RFC) → render (feature map) → mark (spec) → cut (tasks) → forge (implementation)
```

`strike` is a lightweight one-shot shortcut that goes from feature description
to a `.strike.md` document and PR in a single pass, bypassing the full pipeline.
Implementation still happens in forge — strike produces the planning document
and the PR that forge then consumes.

## Persona Artifact Convention

The durable `.persona.md` convention — storage path, filename-slug identity, and
the canonical narrative file shape — is defined once in the
[`persona-convention.md`](snippets/persona-convention.md) snippet so it deploys
as a referenceable component. Command surfaces that produce or consume persona
files compose it via the `{{>persona-convention}}` partial rather than restating
the path or schema. See that snippet for the full schema. In short: persona
files are durable, cross-RFC, single-persona narrative artifacts stored flat at
`{{artifactsRoot}}docs/personas/<slug>.persona.md`, identified solely by their
filename slug (no registry or identity key), and they sit outside the
`## Dependency Order` lineage.

## Artifact Hierarchy and Dependency Order Format

> **Engraved-knowledge records** (decisions, invariants, principles) are a
> separate, root-level artifact family — they have **no** `## Dependency
> Order` row and are not part of the lineage below. They participate in the
> graph through citation edges only. They are also scoped by **level** rather
> than by lineage: `user` (`~/.smithy/decisions/`, …), `repo`
> (`{{artifactsRoot}}docs/decisions/`, …), and `project`
> (`~/.smithy/projects/<project>/decisions/`, …), with precedence running
> project > repo > user. The level model — stores, level-prefixed ids,
> precedence and the `excepts` declared-exception rule, `scope` semantics,
> cross-level edge legality, citation forms — lives in
> [`snippets/engraved-levels.md`](snippets/engraved-levels.md); the full
> record schema lives inline in
> [`commands/smithy.engrave.prompt`](commands/smithy.engrave.prompt).
> `smithy status --engraved` inventories the three levels.

Every planning artifact produced by Smithy fits into a single strict lineage:

```
RFC (.rfc.md)                     — milestones (prefix: M)
  └── Feature Map (.features.md)  — features   (prefix: F)
        └── Spec (.spec.md)       — user stories (prefix: US)
              └── Tasks (.tasks.md) — slices    (prefix: S)
```

**Parent-to-child links are expressed through a unified `## Dependency Order`
section in every artifact**, using the same 4-column Markdown table schema:

```markdown
## Dependency Order

| ID  | Title                     | Depends On | Artifact                         |
|-----|---------------------------|------------|----------------------------------|
| US1 | Scan Artifacts            | —          | `01-scan-artifacts.tasks.md`     |
| US2 | Render Hierarchical View  | US1        | `02-render-hierarchical-view.tasks.md` |
```

### Column rules

| Column | Rule |
|--------|------|
| **`ID`** | Canonical per-level prefix (`M`, `F`, `US`, `S`) followed by a positive integer with no leading zeros. Unique within the table. Matches `^(M\|F\|US\|S)[1-9][0-9]*$`. |
| **`Title`** | Human-readable title, taken verbatim. |
| **`Depends On`** | Comma-separated list of IDs from **the same table**, or `—` if no dependencies. Cross-artifact dependencies are implicit in the parent/child lineage above and MUST NOT be written here. No prose, no explanations. |
| **`Artifact`** | Repo-relative path to the downstream file or folder, or `—` if that downstream does not exist yet. RFC milestone rows point at `.features.md` files; feature-map feature rows point at spec folders; spec user-story rows point at `.tasks.md` files; tasks-file slice rows always use `—` because slices live inline as `## Slice N:` body sections. **The `Artifact` column (not a checkbox) is the "started / not started" signal.** |

### Rules that apply at every level

- **No checkboxes inside `## Dependency Order` sections.** The legacy
  `- [x] **Feature N Spec: Title** → path` format is removed because it caused
  merge conflicts and forced LLM inference. Anything in a `## Dependency Order`
  section that looks like `- [ ]` / `- [x]` is an error.
- **Task-completion checkboxes inside `## Slice N:` bodies of `.tasks.md`
  files are unaffected.** Those are implementation progress, not dependency
  ordering, and they stay.
- **Every `.rfc.md` template includes a `## Dependency Order` section**
  immediately after the list of milestones. RFCs without this section are
  legacy artifacts and should be converted.
- **Authoring commands that produce planning artifacts** (`smithy.ignite`,
  `smithy.render`, `smithy.mark`, `smithy.cut`, `smithy.strike`) emit the
  table format above and never the legacy checkbox format.
- **This README is the single source of truth.** Command templates should link
  back here rather than redefining the schema inline, so the rules cannot
  drift between commands.

### Why this format

- **Deterministic parsing** — a Markdown table regex plus simple ID
  tokenization is enough to reconstruct the full dependency graph, so tooling
  (like `smithy status --graph`) never needs to call an LLM to understand
  what blocks what.
- **Merge-friendly** — no shared checkboxes means no serialized merge
  conflicts when two branches mark different items complete.
- **Uniform across levels** — the same table shape works for milestones,
  features, user stories, and slices, so the authoring commands and the
  scanner share one implementation.

## Specification Debt Format

Every planning artifact — `.prd.md`, `.rfc.md`, `.features.md`, `.spec.md`,
`.tasks.md`, `.strike.md` — carries exactly one `## Specification Debt`
section. Its position differs per artifact type and is fixed by that
artifact's template:

| Artifact | Position |
|----------|----------|
| `.spec.md` | between `## Assumptions` and `## Out of Scope` |
| `.tasks.md` | before `## Dependency Order` |
| `.rfc.md` | after `## Decisions`, before `## Milestones` |
| `.features.md` | before `## Cross-Milestone Dependencies` |
| `.prd.md` | after `## Assumptions`, last structured section |
| `.strike.md` | between `## Decisions` and `## Single Slice` |

The section is a **narrow index table plus per-item detail sections**:

```markdown
## Specification Debt

| ID | Title | Source Category | Impact | Confidence | Origin |
|----|-------|-----------------|--------|------------|--------|
| SD-001 | Health endpoint path not pinned | Functional Scope | Medium | Medium | local |
| SD-002 | Windows symlink semantics | Non-Functional Quality | High | Low | spec:SD-002 |

### SD-001 — Health endpoint path not pinned

Unresolved choice between exposing the check at `/healthz` and reusing the
existing `/internal/status` route. The first is conventional for probes; the
second avoids a new public path but couples liveness to an internal contract.

### Resolved

#### SD-003 — Webhook transport

**Question:** Whether webhook delivery must support HTTPS-only endpoints.

**Answer:** Resolved 2026-04-10 — user confirmed webhooks are HTTP-only.
```

### Column rules

| Column | Rule |
|--------|------|
| **`ID`** | `SD-` followed by a zero-padded three-digit integer. Matches `^SD-[0-9]{3}$`. Unique within the artifact and never reused — resolving an item retires its ID rather than freeing it. An artifact that authors all its own debt numbers sequentially from `SD-001`. An item carried down from a parent **keeps the parent's ID verbatim**, and the artifact's own new items take the next free number above the highest ID already present. Gaps are therefore normal in an artifact that inherits, and a row whose ID disagrees with the ID in its own `Origin` means something renumbered a carried-down item. |
| **`Title`** | A short slug naming the unresolved choice — **40 characters or fewer**, roughly 4–7 words. Not a sentence, and not the question itself; the question lives in the detail section. This budget is what keeps the index narrow — without it the column degenerates into the prose column this format exists to remove. |
| **`Source Category`** | Open vocabulary, not an enum. Core values: `Functional Scope`, `Integration`, `Interaction & UX`, `Non-Functional Quality`, `Edge Cases`, `Scope Edges`, `Domain & Data Model`, `Testing Strategy`, `Technical Risk`, `Constraints`. Findings routed from plan-review use the `plan-review:<finding category>` namespace. New values are permitted when no core value fits; keep them to 30 characters or fewer. |
| **`Impact`** | Closed enum: `Critical` / `High` / `Medium` / `Low`. `Important` is drift — reject it. |
| **`Confidence`** | Closed enum: `High` / `Medium` / `Low`. Records how confident the producing sub-agent was that it could **not** resolve the item itself. It is not a second priority axis — `Impact` is that. |
| **`Origin`** | `local` for items discovered while authoring this artifact, or `<parent-kind>:SD-NNN` for items carried down from a parent, where `<parent-kind>` is one of `prd`, `rfc`, `features`, `spec`, `tasks`, `strike`. `Origin` names the **immediate** parent, not the ultimate source. The parent's path is never repeated here — it is already declared once in the artifact's header block (`**Source**:` on `.tasks.md`, `**Source Feature Map**:` on `.spec.md`). |

### Detail sections

One `### SD-NNN — <Title>` per index row whose `Origin` is `local`. The body
states the open question, or the unresolved choice between named alternatives,
in 1–3 sentences — never a directive (the kind gate in `smithy-clarify`
Step 3b decides what qualifies). The heading's `<Title>` must match the index
row's `Title` cell exactly.

**Rows carried down from a parent get no detail section.** Their prose lives
once, in the parent artifact, reachable via `Origin` plus the header's parent
declaration. This is what stops a single spec's debt from being duplicated in
full into every downstream tasks file.

### Resolved

`### Resolved` is the last subsection of `## Specification Debt`. Each entry is
a `#### SD-NNN — <Title>` block carrying `**Question:**` and `**Answer:**`.
Resolving an item **moves** its row out of the index; the ID is never reused.

Resolving an item that was carried down from a parent materializes the
upstream question locally: quote the parent's question into `**Question:**`
and record the local decision in `**Answer:**`. The downstream artifact does
not write back to the parent.

### Status is derived, not stored

There is no `Status` column. Lifecycle and provenance are separate axes, and
both are structural:

- **`open`** — a row in the index table whose `Origin` is `local`.
- **`inherited`** — a row in the index table with any other `Origin`.
- **`resolved`** — an entry under `### Resolved`, absent from the index table.

### Rules that apply at every level

- **The empty state is exactly one italic line** — `_None — no specification
  debt was recorded._` — with no table, no detail sections, and no
  `### Resolved` subsection. Write the literal, not a paraphrase and not a
  quoted copy of it. (The terminal one-shot summary uses the same sentence
  without the italic markers; that is a different surface.)
- **Never put an unescaped `|` inside a table cell.** Pipes belong in detail
  prose. An unescaped pipe silently shifts every column to its right.
- **`## Specification Debt` is the only home for an unresolved *decision*.** No
  `## Open Questions` heading in RFCs — translate those into `SD-NNN` rows. An
  unknown that needs no decision is a different thing and has a different home:
  see **Open Implementation Questions** below.
- **This README is the single source of truth.** Command templates compose
  `{{>spec-debt-section}}` and link back here rather than restating the
  schema inline, so the rules cannot drift between commands.

### Why this format

- **A table cell is the wrong container for a paragraph.** Across the 427 debt
  rows that predate this format, `Description` had a median of 335 characters
  (p90 579, max 1319) while sitting beside columns holding a single enum word;
  36% of rows also carried a 143-character median `Resolution` in a second
  cell. Markdown sizes columns by content, so the prose columns were squeezed
  by the enum ones and the section was unreadable at any width.
- **The index stays scannable as debt accumulates.** Every index cell is a
  short atomic value, so the table renders at roughly 90–110 columns and stays
  legible at fifty items, while prose grows without bound below it.
- **Derived state cannot drift.** The old `Status` column was 100% derivable
  from position and provenance, and drifted anyway (a stray `closed`, and
  `Important` in `Impact`). Encoding it structurally makes those unrepresentable.
- **Provenance as a field beats a text prefix.** The old
  `inherited from spec: …` convention buried structured data in prose, where it
  survived neither rewording nor machine checking.

## Open Implementation Questions Format (`.tasks.md`)

The debt table is a **decision queue for a human**. Most things a planning pass
does not know are not decisions at all — which proto field carries a value,
which producer serves a surface, which of two equivalent call sites to extend.
Those have a right answer and the implementer uncovers it by building. Parking
them in `## Specification Debt` buries the handful of real decisions among
dozens of non-decisions and makes a ready artifact read as blocked.

So `.tasks.md` — and only `.tasks.md`, because it is the artifact an
implementer works from — carries a second section, positioned after
`## Specification Debt` and before `## Dependency Order`:

```markdown
## Open Implementation Questions

| ID | Question | Slice | Settled By | Origin |
|----|----------|-------|------------|--------|
| IQ-001 | Which proto field carries the badge copy? | S2 | reading code | local |
| IQ-002 | Does the ramp gate apply per-market or globally? | — | testing | spec:SD-014 |
```

| Column | Rule |
|--------|------|
| **`ID`** | `IQ-` plus a zero-padded three-digit integer. Matches `^IQ-[0-9]{3}$`. Unique within the artifact, numbered from `IQ-001`, and **independent of the `SD-NNN` sequence** — the two never share a numbering space. |
| **`Question`** | One sentence, 120 characters or fewer, phrased as a question. There are no detail sections here: a question needing a paragraph is either a slice-body concern or a misfiled steering decision. |
| **`Slice`** | An `S<N>` ID from this file's `## Dependency Order` table, or `—` when the question spans slices. |
| **`Settled By`** | Closed enum: `building` / `testing` / `reading code`. Names how the implementer closes the question — never who to ask. If the honest answer is "by asking someone", the row is specification debt, not an implementation question. |
| **`Origin`** | `local` for questions found while authoring this file, or `<parent-kind>:SD-NNN` for one demoted out of a parent artifact's debt table during inheritance. The upstream number lives here, not in the `IQ-NNN`. |

### The gate between the two sections

A finding reaches `## Specification Debt` only if **a human must decide and the
decision changes what gets built**. The canonical gate — the three-part
steering test (open question, named alternatives, human-only), the positive
test that rejects directives, and the leak-kind routing table — lives in the
`kind-gate` snippet, which every producer of a debt row composes:
`smithy-clarify`, `smithy-refine`, and both review agents by way of
`review-protocol`. The review agents resolve the gate's output plus severity
and confidence into a routed `destination` — `apply`, `debt`, `iq`, or `note` —
and the parent commands compose what each destination means on disk from
`plan-review-triage`. Everything the gate rejects has a home:

| Kind | Home |
|------|------|
| `steering` — a human picks between named alternatives | `## Specification Debt` |
| `implementation` — settled by building, testing, or reading source | `## Open Implementation Questions` |
| `hygiene` — a knowable correction, a wrong table, a stale path | Applied as a write-back, or listed in the PR body. A wrong table is a fix, not a question |

### No lifecycle, no write-back

An `IQ-NNN` row has no `Resolved` subsection and no answer field. The merged
code is the answer, and the row retires with its slice. This is the deliberate
difference from `SD-NNN`, whose resolution is a decision worth recording.

Inheritance classifies rather than copies. When `smithy.cut` carries a spec's
debt into a tasks file, it applies the same gate to each upstream row:
steering rows carry down as debt, implementation unknowns arrive here as
`IQ-NNN` rows, and hygiene items are noted in the PR. The downstream artifact
never writes back to the parent — reclassification changes what the child
carries, not what the parent recorded.

## Implementation Repo Declaration (`.tasks.md`)

**Most tasks files carry none of this.** A single-repo or monorepo install has
exactly one repository, every slice lands in it, and the artifact says nothing —
that is the correct and expected shape.

The fields below exist for **cross-repo planning**: a `~/.smithy/projects/…`
store holding artifacts for work that spans several checkouts. There the store
root and the implementation repo are deliberately different roots and one store
covers more than one repo, so "which repo does this slice land in?" has more
than one answer and the artifact is the only place it can be recorded.

```markdown
# Tasks: Wire Add-Title to the library store

**Source**: `specs/2026-06-06-012-add-title/add-title.spec.md` — User Story 3
**Story Number**: 03
**Implementation repo**: `story-spider`

## Slice 1: Publish the titles endpoint

**Repo**: `story-spider-api`
```

| Field | Where | Rule |
|-------|-------|------|
| `**Implementation repo**` | Tasks file header | **Exactly one repo, never a list** — the story's primary repo. |
| `**Repo**` | Inside a `## Slice N:` body | Optional. **Exactly one repo.** Overrides the header for that slice only; omit it when the slice lands in the header's repo. |

**Resolution**: a slice's own `**Repo**:` wins, else the header. Nothing else —
an absent declaration means absent, not "guess". That is why the header stays a
single primary repo even when slices differ.

### The single-repo slice invariant

**Every slice must be implementable within exactly one repository.** This one
holds everywhere, declaration or not: `smithy.forge` runs in one repo's worktree
and produces one PR, so a slice whose tasks span repos cannot be implemented at
all. The repo boundary is a slicing constraint of the same rank as "PR-sized".

A story that needs coordinated change across repos is expressed as **one slice
per repo**, ordered producer-repo-before-consumer-repo in the `## Dependency
Order` table, with the contract between them recorded under
`### Cross-Repo Notes`.

Task paths stay repo-relative and unchanged in shape (`lib/constants/Experiment.kt`)
— the declaration supplies the root they hang off.

### What tooling does with it

- **`smithy status`** reports what the artifact declared, verbatim: `repo` on a
  `tasks` record, on each of its `slices` entries, and on each slice node in
  `graph.nodes`, so an orchestrator maps slice → repo without regexing Markdown.
  Absent declaration, absent field. Status validates nothing here and infers
  nothing — in a cross-repo store it cannot even see the checkouts.
- **`smithy.cut`** needs only *read* access to a repo to slice against it (a
  checkout, a fetched tree, whatever).
- **`smithy.forge`** owns the only hard check, because it is the step that
  needs a local checkout: when a slice declares a repo, forge compares it
  against the repo it is standing in and stops rather than editing the wrong
  one. No declaration means single-repo planning, and forge simply proceeds.

## Voice and Audience Tagging Convention

Each `##` section in a Smithy planning artifact carries a voice spec —
audience, mode, length budget, diagram requirement, examples policy —
recorded by an HTML-comment tag with the grammar below. **The tag lives
in the planning-artifact template** (the markdown code-fence block that
`smithy.ignite`, `smithy.render`, `smithy.mark`, and `smithy.cut` emit
as the artifact shape), **not in every generated artifact instance**.
That keeps the spec in one place, lets template authors edit it
centrally, and gives `smithy.audit` a single file to read when checking
voice. The full Role × Mode taxonomy — conciseness budgets, diagram-
first framing, depth-control rules — lives in the `smithy.helper-voice`
skill body. Authors of new command templates should follow it rather
than redefining voice rules inline.

The tag grammar (as it appears in templates):

```
## <Section title>
<!-- audience: <role>[+ai-input]; mode: <mode>; length: <budget>; diagram: <required|recommended|optional>; examples: <required|recommended|discouraged|forbidden>[; applicability: <free-text>] -->
```

Keys:

| Key | Values |
|-----|--------|
| `audience` | `stakeholder` \| `reviewer` \| `builder`; append `+ai-input` when a Smithy sub-agent is the primary consumer (e.g., `builder+ai-input`). |
| `mode` | `explanation` \| `reference` \| `how-to` \| `tutorial`. |
| `length` | Sentence or paragraph budget (`2-3 sentences`, `3-6 paragraphs`, `tables only`, `5-15 steps`). |
| `diagram` | `required` \| `recommended` \| `optional`. |
| `examples` | `required` \| `recommended` \| `discouraged` \| `forbidden`. |
| `applicability` (optional) | Free-text condition under which the section legitimately resolves to `N/A` (e.g., `code-shaped features only` on `.data-model.md` / `.contracts.md`). |

Authoring rule: when adding a new `##` section to a planning-artifact
template, drop the tag immediately under the heading inside the
template's markdown code fence. `smithy.audit` reads these tags to
enforce voice rules via its voice-tag lint
(`snippets/audit-checklist-voice.md`): it flags unknown keys/values,
length-budget violations, and missing/forbidden diagrams and examples.
The lint currently carries the per-section specs directly; as every
template surface is wired through it will read them from the same
template files, keeping the enforcement surface and the templates in
lockstep. See
`src/templates/agent-skills/skills/smithy.helper-voice/SKILL.prompt`
for the per-cell rules, and that skill's `references/` bundle for the
material it loads on demand: the review-mode anti-pattern checklist, the
tag-grammar detail, three worked before/after examples, and genre presets
for non-Smithy targets (migration plans, ADRs, runbooks, READMEs, inline
documentation) — those targets have no template to inherit from, so the
taxonomy is used as authoring discipline rather than a metadata
convention. Artifact-*shape* decisions (whether a document
should be one artifact or several, and what the navigation doc between
them looks like) live one layer up, in the user-invocable
`smithy.helper-documentation` skill, which calls `smithy.helper-voice`
for the prose-level pass.

## Feature Kinds and the Build/Wire Seam

Features in a `.features.md` map are **typed**. Each `### Feature N:` carries a
fenced `yaml` metadata block — right after the heading, before the prose
(`**Description**:` etc.) — declaring its **kind** (`backend` or `ui`) and, for
UI work, its design mode and phase fields. This README is the source of truth
for the schema; the same field set is captured once in the `feature-kinds` snippet
(`snippets/feature-kinds.md`) and pulled into `smithy.render` (authoring) and
`smithy.audit` (validation) via `{{>feature-kinds}}` so the surfaces never drift.
When `smithy.mark` consumes a `.features.md` file, it branches on the selected
feature's `kind`: `backend` and absent-kind legacy features use the existing
spec-triad path, while `ui` features enter the UI authoring path. That UI path
owns the durable design truth: the UI spec ledger plus the mark-authored
`design/screens/<ScreenId>.design.md` and `design/flows/<FlowId>.flow.md`
artifacts that downstream commands consume.

### Field schema

| Key | Kind | Required | Notes |
|-----|------|----------|-------|
| `kind` | both | Yes (new) | `backend` or `ui`. Selects the `smithy.mark` authoring path. A missing `kind` on legacy feature maps defaults to `backend`. |
| `phase` | ui | Yes | `build` or `wire` — a **feature-level** attribute. |
| `design_system` | ui | Yes | Reference to the committed design skill (for example `story-spider-design`); source of truth even when a bundle is present. A screen with a `bundle` still requires `design_system`. |
| `design` | ui | Yes | Screen-node design mode: `none`, `import`, or `brief`, shared by every `ScreenId` the feature lists. Render sets this explicitly; mark copies it into the `Design` cell of each `SC<N>` row. Screens needing distinct modes go in separate features. |
| `bundle` | ui | No | Repo-relative path to a visual prototype boundary object, such as a Figma export, Claude Design export, or equivalent visual-tool bundle — a visual/structural reference, not a drop-in. Bundle wins on layout & visual intent; the design skill wins on implementation dialect. Record it on the feature that introduces the screen (the `build` feature of a flag-gated pair); the `wire` partner inherits it through the shared `flag` and does not repeat it. |
| `flag` | ui | Yes (flag-gated) | Feature-flag name; the shared contract joining a `build` feature to its `wire` feature. |
| `screens` | ui | Yes | List of `ScreenId`, e.g. `[AddTitle]`. |
| `flows` | ui | No (build) / Yes (wire) | List of `FlowId` the screen participates in. |

`backend` features carry none of the ui-only keys; their body is the behavioral
spec (prose delta).

### Design mode semantics

`design` is a feature-level key that render sets explicitly and mark copies into
the `Design` cell of each `SC<N>` row of the UI spec ledger. It is not used by
the backend spec-triad path. The only valid values are:

| `design` | Means | Bundle behavior |
|----------|-------|-----------------|
| `none` | No visual loop; simple pass-through screen work builds from the committed design skill. | No bundle required. |
| `import` | Prototype-first; a prototype already exists before `mark`. | A bundle may enter at `render`, be recorded on the UI feature, ride to `forge` as visual source context, and be honored under the conflict rule. Render may derive candidate `ScreenId`/`FlowId` values from it for human confirmation. |
| `brief` | Mark-authored intent for a visual tool; the `.design.md`/`.flow.md` artifacts are the brief. | A bundle may be attached later; if present, downstream build honors it under the conflict rule. |

### Render as the UI feature-map entry point

`smithy.render` is the typed entry point for UI feature maps. It emits the
`feature-kinds` metadata that downstream commands consume: backend features are
explicitly `kind: backend` and otherwise keep the existing backend feature-map
behavior, while UI features are `kind: ui` and carry `phase`, `design_system`,
`design`, `screens`, phase-appropriate `flows`, and any flag or bundle metadata.
This keeps backend-to-spec fan-out and UI-to-screen/flow fan-out visible from
metadata instead of feature titles.

When render receives an import-mode bundle, it treats the bundle as feature-map
context only. The exact repo-relative bundle path is recorded on relevant
`design: import` UI features, `design_system` remains the committed
implementation dialect source, and any derived `screens`/`flows` are candidate
structure for a human to confirm during `mark`. Render does not author
`design/screens/*.design.md`, `design/flows/*.flow.md`, or executable test-body
files; those durable artifacts remain owned by `mark` and downstream build
steps.

### Phase semantics

| `phase` | Means | Done when |
|---------|-------|-----------|
| `build` | Implement the screen component against a mock, behind `flag`. No real data. | Screen renders every brief state using only design-system tokens/components, gated by the flag. |
| `wire` | Connect the screen to real data/actions and flip the flag. | Real data wired and the mark-created stub test body filled/updated for every flow in `flows` using the project's UI driver; the `.flow.md` design truth is authored by `mark`. |

### The seam = two features sharing one flag

"Prototype behind a flag, wire to real data later" is a **seam**, not a note.
It is expressed as **two `### Feature N:` entries sharing a `flag` value**, with
the wire feature listing the build feature in its `## Dependency Order`
`Depends On` cell:

```
F2 build-add-title  (kind: ui, phase: build, flag: add_title_v1)
   │  renders the screen against a mock, behind add_title_v1
   ▼   (Depends On: F2; shares flag: add_title_v1)
F3 wire-add-title   (kind: ui, phase: wire, flag: add_title_v1, Depends On: F1, F2)
       wires real data, flips add_title_v1, emits the AddTitle flow
```

**Build-ahead-of-backend is legal and intended:** the `build` feature may be
ordered before an unbuilt backend feature (`F1` above) because the flag keeps it
on mock data; only the `wire` feature lists the backend in `Depends On`. The
shared `flag` — not a naming convention — is the contract of record.
`smithy.mark` later turns the selected UI feature metadata into the UI spec
ledger and durable screen/flow artifacts; `forge` consumes those files while
building the implementation.

### Worked example

````markdown
### Feature 1: Persist titles to the library store

```yaml
kind: backend
```

**Description**: A `LibraryStore.add(title)` that persists a `Title { id, name, url }`
and exposes it via `LibraryStore.all()`, ordered by insertion. Duplicate URLs are a
no-op; `all()` returns `[]` (never null) before any add.

### Feature 2: Add-Title screen (build)

```yaml
kind: ui
phase: build
design_system: story-spider-design
design: import
bundle: design/bundles/add-title.zip
flag: add_title_v1
screens: [AddTitle]
flows: [AddTitle]
```

**Description**: Title field, URL field, and a confirm action reachable from the
Library FAB, behind `add_title_v1` against an in-memory mock. Render all brief states
(empty, valid, invalid URL, submitting) using only design-system tokens.

### Feature 3: Wire Add-Title to the library store (wire)

```yaml
kind: ui
phase: wire
design_system: story-spider-design
design: import
flag: add_title_v1
screens: [AddTitle]
flows: [AddTitle]
```

**Description**: Connect AddTitle to `LibraryStore` and flip `add_title_v1`. Confirm
persists a real `Title`; done includes filling the mark-created executable test
body stub (`maestro/flows/AddTitle.yaml` in this Maestro example), while
`design/flows/AddTitle.flow.md` remains mark-authored design truth.
````

with a `## Dependency Order` table where `F3` depends on `F1, F2` and `F2` depends
on `—` (build-ahead-of-backend).

### Naming decisions

- **`screens` / `flows` are lists** — a screen can participate in more than one
  flow, and the `wire` definition-of-done is "every flow the screen participates in."
- **`flag` is a first-class field**, not just prose — it is the interface contract
  between the build and wire features.
- **`phase` is feature-level**, not user-story/slice level — the build/wire
  decomposition happens at the feature granularity (two features in the DAG).

## Screen Design-Context Annotations

Each `ScreenId` listed under a UI feature's `screens:` field resolves — in the
**app repo, not in Smithy** — to a thin durable annotation at
`design/screens/<ScreenId>.design.md`, authored by `smithy.mark` as durable
design truth for downstream build and audit steps. The screen's component file is
the body; this file carries the screen's *intent* (why it exists, deliberate
choices, deferred bits) colocated with the code so it travels and versions with
the component.

The full authoring contract — YAML front-matter schema (`id`, `component-path`,
`design_system`, optional `bundle`), the rationale-only body rule, naming
decisions, and a review checklist — lives in the body-on-demand skill
**`smithy.helper-screen-design`**
(`skills/smithy.helper-screen-design/SKILL.prompt`), with the skeleton
template and a worked `Library.design.md` example one link further out in
that skill's `references/examples.md`. Agents lazy-load it via
`Skill("smithy.helper-screen-design")` when authoring or auditing a screen
annotation; this README intentionally does not duplicate the schema so the two
cannot drift.

`smithy.audit` routes `design/screens/<ScreenId>.design.md` targets to that
helper's review checklist. The audit is structural: it checks the front-matter
contract, including `component-path` and `design_system`, and the rationale-only
body rule. Visual fidelity stays out of scope for audit.

## Flow Definitions

Each `FlowId` listed under a UI feature's `flows:` field resolves — in the
**app repo, not in Smithy** — to a durable **1:1 pair** of files:
`design/flows/<FlowId>.flow.md` (thin intent annotation) and
an executable test body in the project's UI driver (for example
`maestro/flows/<FlowId>.yaml`). `smithy.mark` authors the `.flow.md` design
truth and creates the paired test-body stub; downstream build steps consume
that pair and fill or update the executable body. The test body owns the steps and guard
assertions a UI driver replays; the `.flow.md` owns *why* — the product truth
the flow preserves, why the guards exist, deliberate entry / exit, and a
coverage caveat for anything below what a UI driver can observe.

The full authoring contract — YAML front-matter schema (`id`, `screens`,
`test-body`), the rationale-only body rule, the driver-neutral selector
contract (testID-keyed only, asserts traversal AND guards), the testID naming
convention, naming decisions, the audio-service coverage caveat, and a review
checklist — lives in the body-on-demand skill
**`smithy.helper-flow-definition`**
(`skills/smithy.helper-flow-definition/SKILL.prompt`), with the skeletons for
both halves and a worked Maestro `AddTitle` example one link further out in
that skill's `references/examples.md`. Agents lazy-load it
via `Skill("smithy.helper-flow-definition")` when authoring or auditing a
flow definition (typically at a UI feature's `wire` phase); this README
intentionally does not duplicate the schema so the two cannot drift.

`smithy.audit` routes `design/flows/<FlowId>.flow.md` targets to that helper's
review checklist. The audit checks the `screens` references, `test-body` path,
and intent-only body rule; executable path consistency across the full app tree
remains the job of `flow-lint`.

## Flow-Lint

`smithy flow-lint` is the deterministic app-repo check for durable UI graph
integrity. It scans every `*.design.md` screen annotation under
`design/screens/`, every `*.flow.md` flow definition under `design/flows/`, and
the paired executable test bodies named by each flow's `test-body:` field. Both
directories are walked recursively, so nested subfolders are included. The
command runs from a repo root or subpath, does not require `smithy.forge` or
any Smithy runtime state to run first, and performs no agent work.

Use it locally before shipping UI graph changes, and wire the same command into
app CI so broken product paths fail with a clear diagnostic:

```bash
smithy flow-lint
```

For CI jobs that run from a parent directory or monorepo root, pass the app
path explicitly:

```bash
smithy flow-lint path/to/app
```

`flow-lint` fails on dangling `screens:` references, missing paired
`test-body:` files, orphan test bodies within the configured flow-test scope,
duplicate `ScreenId` values, duplicate `FlowId` values, and duplicate
test-body ownership. Smithy documents the command and exposes it through the
CLI; it does not generate app workflow files or own a particular CI provider's
configuration.

Orphan detection — an executable test body whose `.flow.md` was removed or
renamed — is the one check that needs a scope, because `test-body:` paths are
driver-neutral and blind-scanning a project's test tree would flag unrelated
tests. Point `--flow-test-root` at the directory holding the flow test bodies
when the project does not use the conventional `maestro/flows` location:

```bash
smithy flow-lint --flow-test-root tests/e2e
```

Without a resolvable flow-test root the orphan scan is **skipped silently** —
every other check still runs, the command prints nothing, and CI sees the same
clean exit it would get from a scan that found no orphans. Treat a passing run
as covering orphans only when the flow-test root resolves, and prefer passing
`--flow-test-root` explicitly in CI rather than relying on the conventional
fallback.

## Sub-Agent Model Tiers

Sub-agents declare how much model horsepower they need with a provider-neutral
`tier` (plus an optional reasoning `effort`) in frontmatter — **never** a raw
provider model name. Each deployer translates the tier into its own idiom, so
the same source serves every agent:

| `tier` | Claude `model:` | Codex `model_reasoning_effort` |
|--------|-----------------|--------------------------------|
| `light` | `haiku` | `low` |
| `standard` | `sonnet` | `medium` |
| `deep` | `opus` | `high` |

- On **Claude**, the tier selects the agent's `model:`.
- On **Codex**, the tier selects `model_reasoning_effort` while the model itself
  is inherited from the parent session (Codex model ids are session/plan
  dependent).
- An optional `effort: low|medium|high` overrides the tier's default Codex
  effort. It is dropped from the Claude build — not because Claude lacks the
  knob (Claude Code does read an `effort:` field on a sub-agent, over a wider
  range than Smithy's three values), but because the Claude deployer does not
  translate it yet. On Claude the tier is currently the only horsepower signal
  that reaches the agent. No sub-agent declares `effort:` today, so nothing is
  silently lost.
- Omitting `tier` defaults to `standard`. A legacy bare `model: opus|sonnet|haiku`
  is still tolerated and mapped back onto the equivalent tier.

The translation table is the single source of truth in `src/agent-models.ts`.

## Sub-Agent Roles

Sub-agents are invoked by parent commands, not directly by users:

| Agent | Role | Invoked By |
|-------|------|------------|
| smithy-plan | Design planning under a focus lens, run in parallel for competing perspectives | strike, ignite, render, mark |
| smithy-reconcile | Synthesize competing smithy-plan outputs | strike, ignite, render, mark |
| smithy-slice | Task decomposition under a focus lens, run in parallel for competing perspectives | cut |
| smithy-reconcile-slices | Synthesize competing smithy-slice outputs (slice boundaries + task lists) | cut |
| smithy-clarify | Ambiguity scanning and triage (assumptions + specification debt) | strike, ignite, render, mark, cut, spark |
| smithy-refine | Artifact review and refinement | ignite, render, mark, cut (Phase 0), spark |
| smithy-plan-review | Read-only self-consistency review of planning artifacts; returns structured findings | strike, ignite, render, mark, cut (after artifact generation, before PR) |
| smithy-implement | TDD implementation (test → code → commit) | forge |
| smithy-implementation-review | Read-only code review; returns findings for forge to apply | forge |
| smithy-recall | Read-only engraved-knowledge recall across the user / repo / project levels; advisory only | strike, ignite, render, mark, cut (scan phase) |
| smithy-scout | Pre-planning consistency scan | render, mark, cut |
| smithy-maid | Post-implementation doc cleanup | forge |
| smithy-prose | Narrative/persuasive section drafting | ignite (sub-phases 3a, 3b), spark (sub-phase 3a), persona |
| smithy-survey | Off-the-shelf landscape survey (WebFetch/WebSearch); returns a build-vs-buy rationale | spark (Phase 2.5) |

Per-agent tiers, tool grants, and the exact dispatch sites are in
[`agents/README.md`](agents/README.md).
