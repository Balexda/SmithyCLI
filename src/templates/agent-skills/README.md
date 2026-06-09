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
               loaded on Skill("<name>") invocation only)
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
- **Deploy transform**: Frontmatter is stripped when deploying Claude
  commands/prompts (kept for Gemini and Codex skills). Files are renamed from
  `.prompt` to `.md`. Sub-agents deploy with frontmatter intact to
  `.claude/agents/` (Claude) and are translated into Codex custom-agent TOML at
  `.codex/agents/` — note the two filename schemes: Claude keeps the source
  `.prompt` filename (`smithy.plan.prompt` → `smithy.plan.md`) while Codex uses
  the frontmatter `name` (`smithy-plan` → `smithy-plan.toml`).

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
> graph through citation edges only. The full schema lives inline in
> [`commands/smithy.engrave.prompt`](commands/smithy.engrave.prompt).

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
for the per-cell rules, the expanded review-mode anti-pattern checklist,
three worked before/after examples, and the "application beyond Smithy"
appendix (migration plans, ADRs, runbooks, READMEs, inline
documentation) — those non-Smithy targets have no template to inherit
from, so the taxonomy is used as authoring discipline rather than a
metadata convention. Artifact-*shape* decisions (whether a document
should be one artifact or several, and what the navigation doc between
them looks like) live one layer up, in the user-invocable
`smithy.helper-documentation` skill, which calls `smithy.helper-voice`
for the prose-level pass.

## Feature Kinds and the Build/Wire Seam

Features in a `.features.md` map are **typed**. Each `### Feature N:` carries a
fenced `yaml` metadata block — right after the heading, before the prose
(`**Description**:` etc.) — declaring its **kind** (`backend` or `ui`) and, for
UI work, its design and phase fields. This README is the source of truth for the
schema; the same field set is captured once in the `feature-kinds` snippet
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
| `design_system` | ui | Yes | Reference to the committed design skill (for example `story-spider-design`); source of truth even when a bundle is present. |
| `bundle` | ui | No | Repo-relative path to a Claude Design export — a visual/structural reference, not a drop-in. Bundle wins on layout & visual intent; the design skill wins on implementation dialect. |
| `flag` | ui | Yes (flag-gated) | Feature-flag name; the shared contract joining a `build` feature to its `wire` feature. |
| `screens` | ui | Yes | List of `ScreenId`, e.g. `[AddTitle]`. |
| `flows` | ui | No (build) / Yes (wire) | List of `FlowId` the screen participates in. |

`backend` features carry none of the ui-only keys; their body is the behavioral
spec (prose delta).

### Phase semantics

| `phase` | Means | Done when |
|---------|-------|-----------|
| `build` | Implement the screen component against a mock, behind `flag`. No real data. | Screen renders every brief state using only design-system tokens/components, gated by the flag. |
| `wire` | Connect the screen to real data/actions and flip the flag. | Real data wired and the executable test body emitted/updated for every flow in `flows` using the project's UI driver; the `.flow.md` design truth is authored by `mark`. |

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
flag: add_title_v1
screens: [AddTitle]
flows: [AddTitle]
```

**Description**: Connect AddTitle to `LibraryStore` and flip `add_title_v1`. Confirm
persists a real `Title`; done includes emitting the executable test body
(`maestro/flows/AddTitle.yaml` in this Maestro example), while
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
`design_system`, `bundle`), the rationale-only body rule, the skeleton template,
a worked `Library.design.md` example, naming decisions, and a review checklist
— lives in the body-on-demand skill **`smithy.helper-screen-design`**
(`skills/smithy.helper-screen-design/SKILL.prompt`). Agents lazy-load it via
`Skill("smithy.helper-screen-design")` when authoring or auditing a screen
annotation; this README intentionally does not duplicate the schema so the two
cannot drift.

## Flow Definitions

Each `FlowId` listed under a UI feature's `flows:` field resolves — in the
**app repo, not in Smithy** — to a durable **1:1 pair** of files:
`design/flows/<FlowId>.flow.md` (thin intent annotation) and
an executable test body in the project's UI driver (for example
`maestro/flows/<FlowId>.yaml`). `smithy.mark` authors the `.flow.md` design
truth; downstream build steps consume it and write or update the executable
body. The test body owns the steps and guard
assertions a UI driver replays; the `.flow.md` owns *why* — the product truth
the flow preserves, why the guards exist, deliberate entry / exit, and a
coverage caveat for anything below what a UI driver can observe.

The full authoring contract — YAML front-matter schema (`id`, `screens`,
`test-body`), the rationale-only body rule, the driver-neutral selector
contract (testID-keyed only, asserts traversal AND guards), the testID naming
convention, skeleton templates for both halves, worked examples including
Maestro, naming decisions, the audio-service coverage caveat, and a review checklist
— lives in the body-on-demand skill **`smithy.helper-flow-definition`**
(`skills/smithy.helper-flow-definition/SKILL.prompt`). Agents lazy-load it
via `Skill("smithy.helper-flow-definition")` when authoring or auditing a
flow definition (typically at a UI feature's `wire` phase); this README
intentionally does not duplicate the schema so the two cannot drift.

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
  effort. It has no Claude frontmatter knob and is dropped from the Claude build.
- Omitting `tier` defaults to `standard`. A legacy bare `model: opus|sonnet|haiku`
  is still tolerated and mapped back onto the equivalent tier.

The translation table is the single source of truth in `src/agent-models.ts`.

## Sub-Agent Roles

Sub-agents are invoked by parent commands, not directly by users:

| Agent | Role | Invoked By |
|-------|------|------------|
| smithy-plan | Design planning with focus lenses | strike (agent mode), ignite (Phase 1.5 + Phase 3) |
| smithy-reconcile | Synthesize competing plan outputs | strike (agent mode, after smithy-plan), ignite (Phase 1.5) |
| smithy-clarify | Ambiguity scanning and triage (assumptions + specification debt) | strike, ignite, mark, cut, render |
| smithy-refine | Artifact review and refinement | mark, cut, ignite, render (Phase 0) |
| smithy-plan-review | Read-only self-consistency review of planning artifacts; returns structured findings | strike, ignite, mark, render, cut (after artifact generation, before PR) |
| smithy-implement | TDD implementation (test → code → commit) | forge |
| smithy-implementation-review | Read-only code review; returns findings for forge to apply | forge |
| smithy-scout | Pre-planning consistency scan | render, mark, cut |
| smithy-maid | Post-implementation doc cleanup | forge |
| smithy-prose | Narrative/persuasive section drafting | ignite (sub-phases 3a, 3b) |
