# Data Model: Expand Evals Coverage Across Planning Commands

## Overview

This feature adds new instances to existing entities (six `EvalScenario` rows in `evals/cases/`) and introduces a fixture-organization convention for **planted parent artifacts** consumed by those scenarios. No new TypeScript types or persistent runtime entities are introduced; all changes are file-on-disk additions following existing schemas.

## Entities

### 1) EvalScenario (existing — six new instances)

Purpose: A single eval case. Defined in `evals/lib/types.ts` as the `EvalScenario` interface. This feature adds six new YAML files conforming to the existing shape.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Kebab-case scenario name. Must be unique across all cases. The `--case` filter and baseline filename both key off this. New names: `audit-flawed-spec`, `mark-from-features`, `cut-from-spec`, `render-from-rfc`, `ignite-from-prd`, `spark-from-idea`. |
| `skill` | string | Yes | Slash-command form (e.g., `/smithy.mark`, `/smithy.audit`). All six new scenarios use a non-empty skill (no TS-shim needed). |
| `prompt` | string | Yes | The argument string passed after the slash command. For scenarios consuming a planted artifact, this MUST be the exact path to the plant. |
| `model` | string | No | Optional model override. New scenarios omit this and inherit the runner default. |
| `timeout` | number | No | Per-scenario timeout in seconds. Mark, cut, render, ignite scenarios MUST set an explicit value calibrated to the producing command's empirical run-time (per FR-010 and SD-006). |
| `structural_expectations` | StructuralExpectations | Yes | Required headings, patterns, tables, forbidden patterns. Anchored to the producing template's literal output code-fence per FR-014. |
| `sub_agent_evidence` | SubAgentEvidence[] | No | Per-agent evidence patterns. Required for spark, ignite, render, mark, cut per the Sub-Agent Evidence Matrix in the spec. Omitted for audit. |

Validation:

- **Loader-enforced** (existing, unchanged): `name` is a non-empty string and unique across loaded files; `skill` is a non-empty string; `structural_expectations.required_headings` is non-empty; `structural_expectations.required_patterns` / `forbidden_patterns` strings are compiled via `new RegExp(pattern)` (invalid regex throws at run-time inside `validateStructure`).
- **Authoring conventions** (not loader-enforced): `name` SHOULD NOT contain path separators or absolute path segments (the orchestrator's `--dump` writer rejects unsafe names, and `loadBaseline` independently rejects unsafe names; new scenarios stay clear of those edge cases by following the convention); `sub_agent_evidence[].pattern` SHOULD match either canonical text OR an Agent dispatch's description/resultText (FR-016 of the original evals spec — implementer-side guidance, not a load-time check).

### 2) PlantedArtifact (new role for an existing artifact type)

Purpose: A pre-built smithy planning artifact (PRD, RFC, features-map, spec, flawed-spec) committed under `evals/fixture/{prds,rfcs,specs}/<scenario-slug>/`. Each plant is owned by exactly one scenario and is read by that scenario only, via exact path.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `path` | repo-relative file path | Yes | Lives under `evals/fixture/{prds,rfcs,specs}/<scenario-slug>/`. The scenario references this exact path in its `prompt` field. |
| `artifact_type` | enum (`prd`, `rfc`, `features`, `spec`, `flawed-spec`, `tasks`) | Yes | Determined by file extension and content. Each scenario consumes one or more plants of specific types. |
| `consumed_by_scenario` | string | Yes | The single `EvalScenario.name` that owns this plant. |
| `realism` | enum (`minimal`, `representative`, `flawed`) | Yes | `minimal` plants contain just enough structure to pass the consuming command's input validation; `representative` plants exercise realistic content; `flawed` plants (audit only) carry a deliberate, documented anti-pattern. |
| `documented_in` | string | Yes | The fixture's README must list the plant with a one-line description (purpose + ownership + flaw if any). |

Validation rules:

- The plant's directory MUST follow the `<scenario-slug>/` naming convention; no shared subdirectories.
- A `flawed` plant MUST carry a comment block at the top describing exactly which checklist invariant it violates and why (so future maintainers do not "fix" it during routine cleanup, mirroring the existing `evals/fixture/src/routes/users.ts` plants).
- A plant's content MUST NOT reference paths outside its own scenario's plant directory (no cross-scenario cross-talk).

### 3) ScenarioFixtureSubdirectory (new naming convention)

Purpose: A scenario-isolated subfolder under `evals/fixture/{prds,rfcs,specs}/`. Holds the PlantedArtifact entries owned by one scenario.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `path` | repo-relative directory path | Yes | One of `evals/fixture/prds/<scenario-slug>/`, `evals/fixture/rfcs/<scenario-slug>/`, `evals/fixture/specs/<scenario-slug>/`. |
| `scenario_slug` | string | Yes | A short directory-naming label derived from the consuming scenario's command (not equal to the scenario's full `name`). Convention: `<command>-eval`. Examples (with their consuming scenarios): `mark-eval/` ← `mark-from-features`, `cut-eval/` ← `cut-from-spec`, `audit-eval/` ← `audit-flawed-spec`, `render-eval/` ← `render-from-rfc`, `ignite-eval/` ← `ignite-from-prd`. (Spark requires no plants; no `spark-eval/` directory is created.) |
| `owner` | string | Yes | Single `EvalScenario.name`. |

Validation rules:

- A subdirectory under `evals/fixture/{prds,rfcs,specs}/` MUST be named after exactly one scenario and contain only plants owned by that scenario.
- The fixture's existing top-level files (`package.json`, `tsconfig.json`, `src/`, `README.md`) MUST remain untouched; this feature is strictly additive at the subdirectory level.

## Relationships

- `EvalScenario` 1:0..N `PlantedArtifact` via `prompt` (exact path reference).
- `EvalScenario` 1:0..1 `ScenarioFixtureSubdirectory` (a scenario consumes plants from at most one subdirectory; spark consumes zero).
- `ScenarioFixtureSubdirectory` 1:N `PlantedArtifact` (a subdirectory holds one or more plants for one scenario).
- `PlantedArtifact` belongs to exactly one `ScenarioFixtureSubdirectory`.

There is no relationship between plants owned by different scenarios; cross-talk is forbidden by the directory-isolation rule (FR-004 of the spec).

## State Transitions

### EvalScenario lifecycle (existing, unchanged)

A scenario file is loaded by `loadScenarios` at orchestrator startup; lifecycle is per-run:

1. `pending` → `running` → `pass` | `fail` | `timeout` | `error`.
2. Result is recorded in the `EvalReport` and rendered by `formatReport`.

This feature does not modify the lifecycle.

### PlantedArtifact lifecycle (new)

1. **Authoring**: implementer creates the plant file under `evals/fixture/{prds,rfcs,specs}/<scenario-slug>/`.
2. **Documentation**: implementer adds a row to `evals/fixture/README.md` describing the plant (path, scenario owner, purpose, flaw if any).
3. **Consumption**: the owning scenario references the plant by exact path in its `prompt` field.
4. **Refresh**: when a producing command's template drifts (e.g., the spec format adds a new mandatory section), the implementer regenerates the plant from the updated template and updates the corresponding scenario's `structural_expectations` together. Plants and scenarios refresh as a unit.

## Identity & Uniqueness

- Each `EvalScenario` is uniquely identified by its `name` field (loader rejects duplicate names; second-loaded duplicate is skipped with a stderr note).
- Each `PlantedArtifact` is uniquely identified by its repo-relative `path`.
- Each `ScenarioFixtureSubdirectory` is uniquely identified by its repo-relative directory path; subdirectory names match the consuming scenario's `name` exactly.

## Notes on the existing data model

- `RunOutput`, `StructuralExpectations`, `SubAgentEvidence`, `Baseline`, `EvalReport`, and `EvalResult` interfaces in `evals/lib/types.ts` remain unchanged. This feature adds **instances**, not new types.
- `Baseline` files for the six new scenarios are intentionally absent this round; the convention-based loader (`loadBaseline` returns `null` on missing file) makes baselines opt-in per scenario.
- The fixture's existing `evals/fixture/src/routes/users.ts` planted inconsistencies (used by `scoutScenario`) are preserved unchanged. Adding new plants under `evals/fixture/{prds,rfcs,specs}/` does not interact with the scout fixture.
