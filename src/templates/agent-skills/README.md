# Agent Skills Templates

This directory contains the prompt templates that Smithy deploys into target
repositories. Templates are written as [Dotprompt](https://firebase.google.com/docs/genkit/dotprompt)
`.prompt` files with YAML frontmatter and Handlebars-rendered body text.

## Directory Structure

```
agent-skills/
  commands/    Slash commands (invocable as /smithy.<name>)
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
  and for agents: `tools` and `model`.
- **Body**: Markdown with Handlebars expressions. Dotprompt resolves partials
  (`{{>snippet-name}}`) and conditionals (`{{#ifAgent}}...{{/ifAgent}}`) at
  deploy time.
- **Deploy transform**: Frontmatter is stripped when deploying to Claude
  (kept for Gemini skills). Files are renamed from `.prompt` to `.md`.

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

## Artifact Hierarchy and Dependency Order Format

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
