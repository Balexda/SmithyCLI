# Contracts: Screens and Flows as UI Feature Kinds

## Overview

These are **command/template contracts**, not network APIs: the inputs each smithy command
reads, the artifacts it writes, and the routing/error behavior for UI work. The throughline
is that `render → mark → cut → forge` stays **identical** for UI and backend — only per-kind
slice/build profiles differ. Artifact schemas live in `data-model.md` and the landed helper
skills; this file defines the command behavior around them.

## Interfaces

### C1 — `smithy.mark` UI branch

**Purpose**: author the typed spec ledger + durable screen/flow artifacts on `kind: ui`.
**Providers**: `smithy.mark.prompt` (new `kind` branch).

#### Signature
`mark(<.features.md path> [, feature N])` → branches on `kind`.

#### Inputs
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| feature `kind` | enum | Yes | `backend` → existing flow; `ui` → UI branch. |
| `design_system`/`bundle`/`flag`/`phase` | per `feature-kinds` | UI | Inherited by the feature's nodes. |
| supplied `bundle` | path | No | If present (import), attached to screen nodes for forge to honor. |

#### Outputs
| Artifact | Description |
|----------|-------------|
| `.spec.md` typed ledger | `## Dependency Order` with SC/FL/US rows, `Kind` + `Design` columns, per-node `Depends On`. Rows are pointers + ordering, never layout prose. |
| `design/screens/<ScreenId>.design.md` | One per screen node (rationale-only). |
| `design/flows/<FlowId>.flow.md` (+ stub test body) | One per flow node (intent-only). |
| `.features.md` `Artifact` cell | Points at the feature's spec folder. |

#### Behavior / Error Conditions
| Condition | Response |
|-----------|----------|
| `kind: backend` | Existing spec-triad flow, byte-for-byte (FR-001). |
| Screen complex + no bundle | Author the brief, set `Design: brief`, **recommend** gating for a bundle — non-blocking; developer may supply one or pass through (FR-018). |
| `kind: ui` but a screen node names no `ScreenId`, or feature names no `design_system` | Abort with message (FR-031). |
| Layout prose drifting into a ledger row | Disallowed — content belongs in the durable file (FR-004). |

### C2 — `smithy.cut` node-kind slicing

**Purpose**: slice every ledger node into tasks, keeping the pipeline uniform.
**Providers**: `smithy.cut.prompt` (new node-kind awareness).

#### Signature
`cut(<.spec.md path> [, node ID])` → `tasks.md` per node.

#### Inputs / Outputs
| Item | Rule |
|------|------|
| Input | A UI spec ledger (or a backend spec, unchanged). |
| `US` node | Sliced into backend tasks exactly as today. |
| `SC` node | Sliced into screen-build tasks (often a single slice: render the flagged component on mock data, all brief states). |
| `FL` node | Sliced into flow-wire tasks (connect real data for the path, honor/flip the flag, emit the executable test body). |
| `Artifact` cell | Populated with the node's `tasks.md` for every kind (FR-013). |

#### Error Conditions
| Condition | Response |
|-----------|----------|
| Node `Depends On` references a missing ID | Abort naming the dangling edge. |
| Whether SC/FL ever need multi-slice | Open (SD-006); default is a single slice. |

### C3 — `smithy.forge` per-kind build (consumes tasks, honors bundle)

**Purpose**: build each node's tasks into PR(s); consume (never author) durable design artifacts.
**Providers**: `smithy.forge.prompt` (kind/phase-aware build + reviewer profile).

#### Signature
`forge(<.tasks.md>)` → PR(s). Same entry as backend; the tasks carry the node kind.

#### Inputs
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| node kind | from tasks | Yes | screen-build / flow-wire / backend-story profile. |
| `design_system` | skill ref | UI | Preloaded as implementer context. |
| `bundle` | path | No | Honored if present; ignored-without-stall if absent (FR-016/-017). |
| `flag` | string | UI | Gates the screen; flipped/honored at flow-wire. |
| detected project stack | inferred | UI | Framework + test driver from the codebase (FR-008). |

#### Outputs
| Output | Kind | Description |
|--------|------|-------------|
| UI component + tests | screen-build | Flagged, mock data, every brief state, tokens only; bundle translated per conflict rule if present. |
| Real wiring + flow test | flow-wire | Connect real data, honor/flip flag, emit/update executable test body + `.flow.md`, run as a gate. |
| Backend code + tests | backend-story | As today. |
| PR | all | Same implementer → tester → reviewer → PR pipeline. |

#### Error Conditions
| Condition | Response |
|-----------|----------|
| forge asked to author a `.design.md`/`.flow.md` from scratch | Refuse — they originate at `mark` (FR-007). |
| Hardcoded color / non-token style (UI) | Reviewer flags (structural). |
| Reviewer tempted to judge visual fidelity | Out of profile — structural-only, plan/no-write (FR-020). |
| `brief` node with no bundle | Build from the design skill; do not block (FR-016). |

### C4 — `flow-lint` (app-repo CI check, sub-issue #409)

**Purpose**: deterministic, smithy-state-free check that the screen/flow/test graph resolves.
**Providers**: a new lint command + CI wiring example.

#### Signature
`flow-lint [path]` → exit 0 (resolved) | non-zero (dangling), human-readable findings.

| Condition | Response |
|-----------|----------|
| `.flow.md` `screens:` entry has no screen annotation | Fail, name the reference (FR-025). |
| `.flow.md` without test body, or test body without `.flow.md` | Fail (orphan). |
| Duplicate/reused `ScreenId`/`FlowId` | Fail (uniqueness). |
| Any agent/network call | Not allowed — pure, fast lint (FR-026). |

### C5 — `smithy.render` UI emission + import ingestion

**Purpose**: emit typed features as the entry point; ingest a prototype in `import` mode.
**Providers**: `smithy.render.prompt`.

| Item | Rule |
|------|------|
| UI feature metadata | Complete `feature-kinds` block; flag-gated work split into build + wire sharing one `flag` (FR-022). |
| Build/wire seam | Wire depends on build (+ backend); build does not depend on backend (FR-022). |
| `import` mode | Derive candidate screens/flows from a supplied prototype/bundle; record the bundle reference; derived structure is a confirmable starting point, not authoritative (FR-023, SD-005). |
| Kind visibility | Backend (→spec) vs UI (→screens/flows), and per-node design mode, evident without title inference (FR-024). |

### C6 — Helper-skill generalization contract

**Purpose**: make the two helper skills driver-neutral.
**Providers**: the two `SKILL.prompt` files.

| Change | Rule |
|--------|------|
| `composable:` → `component-path:` | Framework-neutral; Compose path becomes one example (FR-010). |
| `maestro:` → `test-body:` | Driver-neutral; Maestro yaml becomes one example (FR-008, SD-003). |
| `bundle` shape | Generalize the claude.ai/design export to a tool-neutral prototype reference (Figma, etc.); SD-003. |
| Normative contract | test-ID-keyed selectors, intent-only prose, 1:1 flow↔test-body — driver-independent. |

### C7 — Review/audit artifact-type extension

**Purpose**: let review/audit tooling target screen/flow artifacts and the ledger.
**Providers**: `smithy-plan-review`, `smithy.audit`, `smithy.status`.

| Change | Rule |
|--------|------|
| `smithy-plan-review` | Add a `screen`/`flow` mode, or document why UI artifacts are reviewed by `audit`/`flow-lint` instead (FR-030). |
| `smithy.audit` | Evaluate a `.design.md`/`.flow.md` against the helper-skill review checklists (FR-029). |
| `smithy.status` / dependency graph | Report per-node (SC/FL/US) progress and resolve their edges from the typed ledger (FR-027/-028). |

## Events / Hooks

- **Build/wire seam**: the shared `flag` is the only cross-feature contract; a wire feature observes it from its build feature.
- **Design boundary**: the `bundle` is the object crossing the terminal↔visual boundary (intent-out brief / prototype-in), entering at `render` (import) or post-`mark` (brief).
- `forge`'s flow-wire build **emits** the executable test body (consumed by CI / `flow-lint`).

## Integration Boundaries

- **App repo vs smithy repo**: durable artifacts (`design/`, test bodies) live in the app repo beside the code; smithy stays stateless orchestration.
- **Design system**: smithy references a committed design skill (`design_system:`); it does not author one.
- **Visual tools (claude.ai/design, Figma)**: smithy never calls them inline; it only emits briefs and ingests bundles at the boundary.
- **Test driver**: smithy emits into whatever driver the app repo uses (SD-003 tracks the supported-driver matrix).
- **`.claude/` snapshot**: not regenerated by this work; source edits land in `src/templates/` only.
