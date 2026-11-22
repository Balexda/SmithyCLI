# Contracts: Reviewer Baseline Deployment and Setup Skill
<!-- applicability: code-shaped features only -->

## Interfaces
<!-- audience: builder; mode: reference; length: tables only; diagram: optional; examples: required; applicability: code-shaped features only -->

### C1: `smithy init` reviewer option

**Purpose**: Select whether the reviewer baseline is deployed.
**Consumers**: Operators; `smithy.setup`; manifest replay from `smithy update`.
**Providers**: The CLI init command.

#### Signature

```
smithy init [--reviewers | --no-reviewers] [existing options…]
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `--reviewers` / `--no-reviewers` | boolean flag | No | Explicit choice. |
| interactive answer | yes/no | No | Asked at repo location only when neither flag is given and `-y` is absent. Defaults to yes. |
| `-y` | flag | No | With no reviewer flag: on at repo location, off at user location. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| manifest `reviewers` | `true` or absent | Persisted choice. |
| manifest `files.reviewers` | `string[]` | Deployed whole files. |
| console lines | text | See C6. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| `--reviewers` with `--location user` | Unresolved (SD-001) | Reject, warn-and-skip, or deploy into the target repository. |
| `--no-reviewers` with a deployed baseline | Remove surfaces (C3, C4, whole files) | Same effect as uninit for reviewer surfaces. |

### C2: Manifest fields

**Purpose**: Persist and replay the reviewer setting.
**Consumers**: `smithy update`, `smithy uninit`, stale-file cleanup, `smithy.setup`.
**Providers**: Manifest writer.

#### Signature

```ts
interface SmithyManifest {
  // …existing fields…
  reviewers?: true;                 // omitted when off
  files: Record<string, string[]>;  // adds the reserved key "reviewers"
}
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reviewers` | `true` | No | Written only when the baseline is deployed. |
| `files.reviewers` | `string[]` | No | Written only with `reviewers`. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| replayed init option | boolean | `update` passes `reviewers: manifest.reviewers === true`. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| `files.reviewers` present without `reviewers` | Treat as off; files are stale and are removed by cleanup | Self-heals a hand-edited manifest. |
| Agent validation meets the `reviewers` key | Skip it | `reviewers` is not an agent name. |

### C3: `AGENTS.md` review rules block

**Purpose**: Deliver the baseline rules to Codex.
**Consumers**: Codex code review; Copilot and CodeRabbit, which also read `AGENTS.md`.
**Providers**: init / update / uninit.

#### Signature

```markdown
## Code Review Rules

<!-- smithy:review:begin -->
<baseline block text, verbatim>
<!-- smithy:review:end -->

<repository-owned bullets, untouched>
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| existing `AGENTS.md` | file or absent | No | Target file. |
| block source | text | Yes | Shipped with the baseline. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| file | text | Changed only between the markers (or by insertion of heading + block). |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| file absent | Create with heading + block | Deliberate departure from the engraved rule. |
| no markers, heading present | Insert block under heading | |
| no markers, no heading | Append heading + block | |
| exactly one pair | Replace between markers | Idempotent. |
| lone, reversed, or duplicated markers | Warn; file unchanged | Same rule as the engraved block. |
| uninit, file reduces to whitespace | Delete file | FR-015. |

### C4: `.coderabbit.yaml` owned entries

**Purpose**: Scope the baseline files for CodeRabbit while leaving repository content alone.
**Consumers**: CodeRabbit; `smithy.setup` (registers repository entries beside these).
**Providers**: init / update / uninit.

#### Signature

```yaml
inheritance: true
knowledge_base:
  code_guidelines:
    enabled: true
    filePatterns:
      - files: ".github/instructions/smithy.review-stance.instructions.md"
        applyTo: "**"
      - files: ".github/instructions/smithy.planning-artifacts.instructions.md"
        applyTo: "**/*.rfc.md,**/*.features.md,**/*.spec.md,**/*.data-model.md,**/*.contracts.md,**/*.tasks.md,**/*.strike.md,**/*.prd.md"
      - files: ".github/skills/smithy-review-planning/SKILL.md"
        applyTo: "**/*.rfc.md,**/*.features.md,**/*.spec.md,**/*.data-model.md,**/*.contracts.md,**/*.tasks.md,**/*.strike.md,**/*.prd.md"
      # repository entries follow, untouched
```

The `applyTo` values above are illustrative. Each is read from the deployed
file at deploy time (FR-010).

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| existing `.coderabbit.yaml` | file or absent | No | Target file. |
| owned prefixes | `'.github/instructions/smithy.'`, `'.github/skills/smithy-'` | Yes | Exact prefix match. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| file | YAML | Bytes outside owned entries unchanged. |
| report | text | Missing or differing owned entries, when report-only. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| file absent | Create (C4 signature, owned entries only) | FR-012. |
| no `knowledge_base` key | Add the mapping; other keys untouched | |
| unparseable YAML | File unchanged; report | FR-011. |
| `filePatterns` not a block sequence | File unchanged; report | FR-011. |
| uninit, only Smithy-written keys remain | Delete file | FR-012. |

### C5: Shape rule check

**Purpose**: One definition of a loadable reviewer file, shared by SmithyCLI's tests and by deploy reporting. It replaces the existing one-entry-per-file rule with one entry per `(files, applyTo)` pair.
**Consumers**: SmithyCLI reviewer tests; init/update reporting; the rules `smithy.setup` states.
**Providers**: A reusable source module.

#### Signature

```ts
type ShapeFinding = { file: string; rule: ShapeRuleId; detail: string };

checkInstructionFile(path: string, text: string): ShapeFinding[];
checkSkill(dir: string, text: string): ShapeFinding[];
checkCodeRabbitConfig(configText: string, ruleFiles: RuleFileInfo[]): ShapeFinding[];
findRepoSpecificReferences(text: string): ShapeFinding[]; // baseline only
expectedCodeRabbitEntries(ruleFiles: RuleFileInfo[]): { files: string; applyTo: string }[];
```

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` / `configText` | string | Yes | Raw file contents. |
| `ruleFiles` | `RuleFileInfo[]` | Yes | Path, kind, frontmatter, and for skills the sender instruction files. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| findings | `ShapeFinding[]` | Empty when clean. Rule IDs match data-model §8. |
| expected entries | array | Drives C4 creation and rewrite. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| frontmatter unparseable | One finding; no throw | Callers decide whether to block. |

### C6: Console reporting

**Purpose**: Make every reviewer-surface write visible.
**Consumers**: Operators; agents driving the CLI.
**Providers**: init / update / uninit.

| Event | Line (shape) |
|-------|--------------|
| baseline deployed | `Reviewer baseline: <n> files, AGENTS.md block, .coderabbit.yaml entries` |
| user location, default | `Reviewer baseline: skipped (per-repository)` |
| file differed before overwrite | `Reviewer baseline: replaced <path> (differed from the shipped baseline)` |
| file adopted | `Reviewer baseline: adopted <path>` |
| probable duplicate rule | `AGENTS.md: line <n> may duplicate the review rules block` |
| report-only YAML | `.coderabbit.yaml: left unchanged (<reason>); missing or differing: <files>` |
| malformed markers | `AGENTS.md: smithy:review markers malformed; left unchanged` |
| dangling reference on uninit | `<path> still references <removed baseline file>` |

### C7: `smithy.setup` skill

**Purpose**: Let an agent change Smithy's installation, extend repository review rules, and locate user-level state.
**Consumers**: Claude, Gemini, and Codex agents.
**Providers**: Deployed skill bundle.

#### Signature

```yaml
---
name: smithy.setup
description: "<≤ skill budget; install/configure framing; no review vocabulary>"
---
```

| Part | Content |
|------|---------|
| body | Router: read the manifest → choose a job → follow it. |
| `references/<extend-rules>` | Repository-layer rule procedure and shape rules (C5 / data-model §8). |
| `references/<user-surfaces>` | Data-model §9 inventory. |

#### Inputs

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| operator request | natural language | Yes | |
| manifest | JSON | No | Source of current settings. |

#### Outputs

| Field | Type | Description |
|-------|------|-------------|
| CLI invocation | `smithy init …` / `smithy update` | The only way settings change. |
| repository-layer files | instruction file / skill, YAML entry, `AGENTS.md` bullet | Outside reserved names, owned entries, and the block. |

#### Error Conditions

| Condition | Response | Description |
|-----------|----------|-------------|
| asked to edit a baseline file or the block | Decline; offer a repository-layer rule | FR-024. |
| asked for a user config file | State none exists | FR-025. |
| no manifest | Report "not installed" and offer `smithy init` | |

## Events / Hooks
<!-- audience: builder; mode: reference; length: tables only; diagram: optional; examples: required; applicability: code-shaped features only -->

N/A — the feature publishes and subscribes to no events. Its console lines are listed in C6.

## Integration Boundaries
<!-- audience: builder; mode: reference; length: tables only; diagram: optional; examples: required; applicability: code-shaped features only -->

| Boundary | Direction | Contract | Failure mode |
|----------|-----------|----------|--------------|
| Copilot code review | Smithy → repository files Copilot reads | `.github/instructions/*.instructions.md` with `applyTo` / `excludeAgent`; `.github/skills/<name>/SKILL.md` with `name` = directory | Malformed file silently ignored → prevented by C5 |
| Copilot skill catalog | Copilot reads `.claude/skills/`, `.agents/skills/` | `smithy.setup` description carries no review vocabulary | Setup skill loaded during review → prevented by FR-022 |
| Codex code review | Smithy → `AGENTS.md` | C3 block | Malformed markers → warn, unchanged |
| CodeRabbit | Smithy → `.coderabbit.yaml` | C4 owned entries; `inheritance: true` when created | Unparseable / flow-style → report-only |
| Smithy manifest | init ↔ update ↔ uninit | C2 | Field absent → off |
| Engraved block | Coexists in `AGENTS.md` | Separate marker pair | Overlap → malformed, unchanged |
