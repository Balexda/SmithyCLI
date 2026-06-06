# Contracts: Screens and Flows as UI Feature Kinds

## Overview

The interfaces here are **command/template contracts**, not network APIs: the inputs
each smithy command reads, the artifacts it writes, and the routing/error behavior it
must honor for UI work. They define the seams between `render`, `mark`, `forge`,
`flow-lint`, and the helper skills. Schemas for the artifacts themselves live in
`data-model.md` and the landed helper skills; this file defines the command behavior
around them.

## Interfaces

### C1 — `smithy.mark` UI branch

**Purpose**: author durable screen/flow artifacts when a feature is `kind: ui`.
**Consumers**: developers; orchestrators.
**Providers**: `smithy.mark.prompt` (new `kind` branch).

#### Signature

`mark(<.features.md path> [, feature N])` → branches on `kind`.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| feature `kind` | enum | Yes | `backend` → existing flow; `ui` → UI branch. |
| feature `phase` | enum | UI | `build` → screens only; `wire` → screens + flows. |
| `screens`/`flows`/`design_system`/`bundle`/`flag` | per `feature-kinds` | UI | Carried into the authored artifacts. |

#### Outputs

| Artifact | Condition | Description |
|----------|-----------|-------------|
| `design/screens/<ScreenId>.design.md` | `kind: ui` | One per `screens:` entry. |
| `design/flows/<FlowId>.flow.md` (+ stub test body) | `kind: ui, phase: wire` | One per `flows:` entry. |
| `.features.md` `Artifact` cell | always (UI) | Points at the produced design artifact(s) per the routing rule. |
| thin `<slug>.spec.md` | escape hatch only | Sequences/references artifacts; no layout redescription. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| Project UI stack undetectable | surface ambiguity, do not guess | FR-007. |
| `kind: ui` but `screens:` empty | abort with message | A UI feature must own ≥1 screen (FR-029). |
| `design_system` missing on UI feature | abort | Required source of truth (FR-029). |
| `kind: backend` | no UI behavior | Existing flow byte-for-byte (FR-001). |

### C2 — `smithy.forge` UI build/wire target

**Purpose**: build a UI screen or wire a flow by `kind`/`phase`, consuming (never authoring) design artifacts.
**Consumers**: developers; orchestrators.
**Providers**: `smithy.forge.prompt` (new UI intake/routing + reviewer profile).

#### Signature

`forge(<target>)` where `<target>` ∈ { `.tasks.md` (backend, unchanged), a feature/`.design.md`/`.flow.md` (UI, per routing rule) }.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `kind`/`phase` | enum | Yes (UI) | Routes implementer + reviewer profile. |
| `design_system` | skill ref | Yes (UI) | Preloaded as implementer context. |
| `bundle` | path | No | Translated to the project framework with the conflict rule. |
| `flag` | string | Yes (UI build) | Gates the screen; flipped at wire. |
| detected project stack | inferred | Yes (UI) | Framework + test driver from the codebase (FR-006). |

#### Outputs

| Output | Phase | Description |
|--------|-------|-------------|
| UI component + component tests | build | Flagged, mock data, every brief state, tokens only. |
| Real wiring + flipped flag | wire | Connected to real data/actions. |
| Executable flow test + updated `flow.md` | wire | Emitted/updated for each participating flow; run as a gate. |
| PR | both | Same implementer → tester → reviewer → PR pipeline. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| forge asked to author a `.design.md`/`.flow.md` from scratch | refuse | Durable artifacts originate at `mark` (FR-005). |
| Hardcoded color / non-token style in UI build | reviewer flags (structural) | Tokens-only conformance. |
| Reviewer tempted to judge visual fidelity | out of profile | UI reviewer is structural-only, plan/no-write (FR-015). |
| Bundle vs skill conflict | apply conflict rule | Bundle wins layout/visual; skill wins dialect. |

### C3 — `flow-lint` (app-repo CI check, sub-issue #409)

**Purpose**: deterministic, smithy-state-free check that the screen/flow/test graph resolves.
**Consumers**: app-repo CI.
**Providers**: a new lint command + CI wiring example.

#### Signature

`flow-lint [path]` → exit 0 (resolved) | non-zero (dangling), human-readable findings.

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| repo tree | filesystem | Yes | `design/screens/`, `design/flows/`, test-body dir. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| exit code | int | 0 pass, non-zero on any dangling/orphan/duplicate. |
| findings | text | Each names the specific severed path. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| `flow.md` `screens:` entry has no screen annotation | fail, name reference | FR-023. |
| `flow.md` without test body, or test body without `flow.md` | fail (orphan) | FR-023. |
| Duplicate/reused `ScreenId`/`FlowId` | fail (uniqueness) | FR-023. |
| Any agent/network call | not allowed | Pure, fast lint (FR-024). |

### C4 — `smithy.render` UI emission (entry-point polish)

**Purpose**: emit complete, consistent typed UI features as the pipeline entry point.
**Consumers**: `mark`.
**Providers**: `smithy.render.prompt`.

#### Signature

`render(<.rfc.md> [, milestone N])` → `.features.md` with typed features.

#### Inputs / Outputs

| Item | Rule |
|------|------|
| UI feature yaml | Complete `feature-kinds` block; flag-gated work split into build + wire sharing one `flag` (FR-020). |
| `## Dependency Order` | Wire depends on build (+ backend); build does not depend on backend (FR-021). |
| Kind visibility | A reader can tell backend (→spec) from UI (→screens/flows) without title inference (FR-022). |

### C5 — Helper-skill generalization contract

**Purpose**: make `smithy.helper-screen-design` and `smithy.helper-flow-definition` driver-neutral.
**Consumers**: `mark`, `forge`, `audit`, `flow-lint`.
**Providers**: the two SKILL.prompt files.

| Change | Rule |
|--------|------|
| `composable:` → `component-path:` | Framework-neutral field name; Compose path becomes one example (FR-008). |
| `maestro:` → `test-body:` | Driver-neutral; Maestro yaml becomes one example (FR-006, SD-003). |
| Examples | Compose/Maestro/`story-spider-design` retained as worked examples, framed as non-normative. |
| Normative contract | test-ID-keyed selectors, intent-only prose, 1:1 flow↔test-body — driver-independent. |

### C6 — Review/audit artifact-type extension

**Purpose**: let review/audit tooling target screen/flow artifacts.
**Consumers**: `mark` plan-review pass, `smithy.audit`.
**Providers**: `smithy-plan-review`, `smithy.audit`, audit-checklist snippets.

| Change | Rule |
|--------|------|
| `smithy-plan-review` artifact types | Add a `screen`/`flow` mode, or document why UI artifacts are reviewed by `audit`/`flow-lint` instead (FR-028, US7). |
| `smithy.audit` | Can evaluate a `.design.md`/`.flow.md` against the helper-skill review checklists (FR-026). |

## Events / Hooks

- **Build/wire seam** is the only cross-feature "event": the shared `flag` is the contract a wire feature observes from its build feature. No runtime eventing.
- `forge`'s wire phase **emits** the executable flow test as a build output (consumed by CI / `flow-lint`).

## Integration Boundaries

- **App repo vs smithy repo**: durable artifacts (`design/`, test bodies) live in the **app repo** beside the code; smithy stays stateless orchestration. Smithy templates only define how to author/consume them.
- **Design system**: smithy references a committed design skill (`design_system:`); it does not author or own that skill.
- **Test driver**: smithy emits into whatever driver the app repo uses; the driver and its CI are the app's, not smithy's (SD-003 tracks the supported-driver matrix).
- **`.claude/` snapshot**: not regenerated by this work; source edits land in `src/templates/` only.
