# Smithy Evals Framework

Tier 3 testing for Smithy agent-skills: invokes deployed `.claude/` skills via the
headless `claude` CLI against a static reference fixture, then validates the
captured output structurally (headings, tables, regex patterns, sub-agent
dispatch evidence, baseline drift).

The evals framework is decoupled from `npm test`. It costs real model tokens and
takes minutes per scenario, so it runs locally on demand only — never in CI.

> Status — the framework is operational end-to-end (fixture copy, skills
> deployment, headless invocation, stream-json parsing, structural / sub-agent /
> baseline checks, summary report). Scenarios and baselines are pinned to the
> rolling capture at `evals/captures/`; refresh both when prompt-template
> drift makes a check fail — see
> [Maintenance — when patterns drift](#maintenance--when-patterns-drift) below.

---

## Prerequisites

1. **`claude` CLI** in `PATH` and authenticated. Either path works:
   - `ANTHROPIC_API_KEY` env var, or
   - Interactive OAuth login: `claude login`
2. **Node** + the project's npm dependencies: `npm install` from the repo root.
3. **Built CLI**: `npm run eval` and `npm run test:evals` both pre-build via tsup
   (`preeval` / `pretest:evals` hooks). No manual `npm run build` needed.

The runner's `preflight()` (`evals/lib/runner.ts`) probes `claude --version` and
auth state before the first scenario; missing tooling exits 1 with a clear
message.

## Running

```bash
# Full eval suite (all scenarios in evals/cases/ + the TS-declared scout scenario)
npm run eval

# Single scenario by name (matches EvalScenario.name, not filename)
npm run eval -- --case strike-health-check
npm run eval -- --case scout-fixture-shallow

# Override per-scenario timeout (seconds; default is 120s in runner.ts).
# strike's full pipeline (3 plan lenses + reconcile + clarify) routinely
# needs 300-600s; --timeout 600 is a safe baseline for an unattended run.
npm run eval -- --timeout 600

# Point at a different fixture directory (default: evals/fixture)
npm run eval -- --fixture /path/to/other/fixture

# Dump each scenario's canonical extracted text + raw stream events to disk
# for triage. Writes <dir>/<scenario>.txt and <dir>/<scenario>.events.jsonl.
# Useful when refreshing expectations against drifted prompt output.
npm run eval -- --dump /tmp/eval-captures
```

Exit code is `0` on overall PASS, `1` on any FAIL / TIMEOUT / ERROR.

### Unit tests (no model cost)

```bash
npm run test:evals
```

Runs every `evals/**/*.test.ts` via vitest — covers the parser, runner (mocked
`claude`), structural validator, scenario loader, baseline library, report
formatter, and the strike + scout scenario shapes. Fast and free; run it any
time you touch `evals/lib/`.

## Output

```text
Running 2 case(s)

Running scenario: strike-health-check
  Skill:   /smithy.strike
  Prompt:  add a health check endpoint
  Fixture: /.../evals/fixture
  Timeout: 600s (--timeout override)

  Duration:  442502ms
  Text length: 2488 chars
  Stream events: 176

Checks:
  [PASS] has '## Summary' heading
  [FAIL] has '## Approach' heading — expected: ## Approach, actual: not found
  ...
  [PASS] smithy-plan evidence present
  [FAIL] smithy-reconcile evidence present — expected: dispatching.*smithy-reconcile, actual: no match found

Eval Summary
  [FAIL] strike-health-check (442502ms) baseline: FAIL
  [FAIL] scout-fixture-shallow (27830ms) baseline: n/a

Total elapsed: 471117ms
Result: FAIL (0/2 passed, 2 total)
```

Status tokens: `PASS`, `FAIL`, `TIMEOUT`, `ERROR` (FR-009, AS 9.3). The
`baseline:` column appears only when at least one scenario has a baseline file
(see [Baselines](#baselines)).

## Layout

```
evals/
├── cases/                  # YAML scenario definitions (FR-007)
│   └── strike-health-check.yaml
├── fixture/                # Static reference codebase (Express TS API)
│   ├── src/                # 5-6 file fixture; do NOT npm install in here
│   └── README.md           # Documents intentional gaps + planted inconsistencies
├── lib/                    # Framework internals (all unit-tested)
│   ├── runner.ts           # spawn claude, copy fixture, checksum, cleanup
│   ├── parse-stream.ts     # stream-json NDJSON → events / text / dispatches
│   ├── structural.ts       # validateStructure + verifySubAgents
│   ├── scenario-loader.ts  # YAML → EvalScenario[] with validation
│   ├── baseline.ts         # loadBaseline + compareToBaseline
│   ├── report.ts           # scenarioRunToResult + buildReport + formatReport
│   ├── strike-scenario.ts  # YAML re-export shim for strike (transitional)
│   ├── scout-scenario.ts   # TS-declared scout scenario (skill="" prevents YAML)
│   ├── types.ts            # Shared types — single source of truth
│   └── *.test.ts           # vitest specs colocated with source
├── baselines/              # Optional known-good output snapshots (US10)
│   └── strike-health-check.json
├── captures/               # Most recent live capture per scenario (rolling).
│   ├── strike-health-check.txt           # Output `--dump` would write today
│   ├── strike-health-check.events.jsonl  # Raw stream-json for the same run
│   ├── scout-fixture-shallow.txt
│   └── scout-fixture-shallow.events.jsonl
├── spike/                  # FR-014 validation spike outputs (frozen 2026-04-09)
│   ├── FINDINGS.md         # Three assumptions probed against claude 2.1.100
│   ├── output-strike.txt   # Captured strike output from the spike run
│   └── parse-stream.mjs    # Original parser; promoted to lib/parse-stream.ts
├── fixture.test.ts         # Verifies smithy init -a claude -y works on fixture
├── run-evals.ts            # Orchestrator entry point (npm run eval)
└── vitest.config.ts        # Includes evals/**/*.test.ts only
```

## How a scenario runs

1. **Preflight** — `claude --version` + auth probe (FR-003).
2. **Load** every `*.yaml` in `evals/cases/` via `loadScenarios`; append the
   TS-declared `scoutScenario` unless a YAML case already claims that name.
3. **Filter** by `--case` if supplied; otherwise run all.
4. For each scenario:
   - Copy `evals/fixture/` to a unique `os.tmpdir()/smithy-eval-XXXX/` (FR-002).
   - Run `node dist/cli.js init -a claude -y` in the temp copy to deploy
     `.claude/` skills fresh from the current `src/templates/`.
   - Checksum the **source** fixture (FR-011, before).
   - Spawn `claude --output-format stream-json --verbose -p "<skill> <prompt>"`
     with the temp copy as `cwd`. Default per-case timeout 120 s; SIGTERM →
     SIGKILL → force-resolve grace ladder.
   - Parse NDJSON via `parseStreamString`; extract canonical text via
     `extractCanonicalText` (FR-001 precedence: `result.text` if non-empty,
     else concatenated assistant text blocks — never both).
   - Re-checksum the source fixture (FR-011, after) and abort with a clear
     error if it changed.
   - Always remove the temp copy in `finally` (FR-013).
5. **Validate** — `validateStructure` + `verifySubAgents` + `compareToBaseline`
   if a baseline file exists.
6. **Aggregate** into an `EvalReport`; `formatReport` renders the summary.

## Authoring a scenario

A YAML scenario file under `evals/cases/<name>.yaml`. The shape mirrors the
`EvalScenario` type in `evals/lib/types.ts`:

```yaml
name: my-scenario              # Must be unique across all cases. The --case filter and
                               # baseline filename both key off this.
skill: /smithy.strike          # The slash command to invoke. Leave unset only when
                               # invoking a sub-agent directly without a parent skill
                               # (currently only scout — and that requires the TS
                               # declaration path because the loader rejects empty skill).
prompt: add a health check endpoint
timeout: 300                   # Optional, seconds. Falls back to runner default (120s).
                               # Surfaceable via --timeout CLI override.
structural_expectations:
  required_headings:           # Required, non-empty. ATX exact-match per line (right-trimmed).
    - '## Summary'
    - '## Approach'
  required_patterns:           # Optional regex strings (no flags). Pattern must match
    - '\*\*Phase \d+: [^*]+\*\*'    # somewhere in the canonical text.
  forbidden_patterns:          # Optional regex strings. Each MUST NOT match in the
    - "I'd be happy to help"        # canonical text. Empty output also fails this check.
    - "Sure, here's"
    - '^---\r?\n'              # Catches leading YAML frontmatter (AS 5.2).
  required_tables:             # Optional. A line containing `|` and every named column substring.
    - columns: [Risk, Mitigation]
sub_agent_evidence:            # Optional. Per FR-016, the pattern must match in EITHER
  - agent: smithy-plan         # the extracted text OR an Agent tool dispatch's
    pattern: '\[via (Separation of Concerns|Robustness|Simplification)\]'
  - agent: smithy-reconcile    # description / resultText. Agent-name-only detection is
    pattern: 'dispatching.*smithy-reconcile'   # NOT sufficient (FR-016).
```

Single-quote regex strings in YAML so backslash escapes round-trip byte-for-byte
(`\d`, `\*`, `\n`, etc.). Patterns compile as `new RegExp(pattern)` with no
flags — `.` does not cross newlines; use `[\s\S]*` if you need to bridge them.

The loader skips invalid files with a stderr note (`loadScenarios: skipping
<file> — <reason>`) and continues with the rest. Duplicate `name` values cause
the second-loaded file to be skipped.

### Why scout lives in TypeScript, not YAML

`/smithy.scout` is not a user-invocable slash command — the sub-agent is only
dispatched by other smithy skills. To exercise it standalone the prompt has to
instruct Claude to dispatch the agent directly, and the `skill` field is empty.
The YAML loader rejects empty `skill` on purpose; rather than weaken that rule
for one case, scout stays in `evals/lib/scout-scenario.ts` and the orchestrator
appends it after the YAML load. When a future Smithy version exposes scout as a
slash command, migrate the scenario to YAML and delete the TS shim.

## Baselines

Optional per-scenario snapshot of the headings + tables a known-good run
emitted. Detect content drift on top of structural checks.

- **Lookup**: `evals/baselines/<scenario.name>.json`. Missing file → no baseline
  checks (AS 10.3). Malformed file → hard error.
- **Format**: see `evals/baselines/strike-health-check.json` for the canonical
  shape — `scenario_name` (must match), `captured_at` (ISO 8601), `headings`
  (string array), `tables` (`[{ columns: [...] }]`, optional).
- **Semantics**: regression signal, not a content lock. Headings/tables present
  in output but absent from the baseline are neutral; only items in the
  baseline that disappear from output flag drift.
- **Updating**: manual. After a deliberate template change that shifts output
  structure, capture the new headings/tables and rewrite the JSON file. There
  is no auto-generation tool by design (out of scope, see spec §Out of Scope).

## Maintenance — when patterns drift

The scenarios are tightly coupled to the **prose** that strike, scout, plan,
reconcile, and clarify emit. Every prompt edit in `src/templates/agent-skills/`
can shift wording, headings, dispatch phrasing, or table column names. The eval
output is the canonical record of what's actually emitted today — `claude`
version, the relevant Smithy template commit, and the resulting structure.

Triage workflow when a check fails:

1. **Read the actual output.** Re-run with `--dump <dir>` to write the
   canonical extracted text and the raw stream-json events to disk:
   ```bash
   npm run eval -- --case <name> --timeout 600 --dump /tmp/eval-captures
   ```
   Then inspect `/tmp/eval-captures/<scenario>.txt` (what `validateStructure`
   actually saw) and `/tmp/eval-captures/<scenario>.events.jsonl` (every
   stream-json event, including Agent tool dispatches with their description
   and result). The spike's `evals/spike/extract.mjs` is a useful reference if
   you want to derive a different summary view from the events.
2. **Decide: regression or drift?**
   - **Regression** (the skill no longer does the right thing): file an issue
     against the template and leave the eval failing as the canary.
   - **Drift** (the skill changed but is still correct): refresh the suite
     end-to-end. The unit tests in `evals/lib/*-scenario.test.ts` and
     `baselines-seed.test.ts` pin the YAML scenarios + baseline JSON against
     the files in `evals/captures/`, so all four surfaces have to move
     together:
     1. Update `evals/cases/<scenario>.yaml` (or the TS-declared scenario for
        scout) with the new `required_headings`, `required_patterns`,
        `forbidden_patterns`, and `sub_agent_evidence` matching what the
        capture actually shows.
     2. Update `evals/baselines/<scenario>.json` if its headings/tables list
        has shifted.
     3. Copy the fresh dump into `evals/captures/`:
        ```bash
        cp /tmp/eval-captures/<scenario>.txt evals/captures/
        cp /tmp/eval-captures/<scenario>.events.jsonl evals/captures/
        ```
     4. Run `npm run test:evals` to confirm the unit tests still lock the
        scenario against the new capture, then `npm run eval -- --case
        <name>` to confirm the live run is green.

The `evals/captures/` files are the rolling current canonical capture used by
the offline unit tests. They differ from `evals/spike/` (frozen 2026-04-09
ground-truth for FR-014) — refresh `captures/`, not `spike/`, when prompts
drift.

Each scenario's `sub_agent_evidence` patterns target the cleaned-up
`AgentDispatch.resultText` exposed by `extractSubAgentDispatches` —
`extractToolResults` flattens the array-of-text-blocks shape the claude CLI
returns for `Agent` tool dispatches into a single newline-joined string, so
patterns match real newlines instead of JSON-escaped `\n` substrings. When
authoring a sub-agent pattern, target a stable template-driven marker in the
sub-agent's output (e.g. `## Plan\n\n\*\*Directive\*\*` for smithy-plan,
`## Step 1: Scan Assessment` for smithy-clarify, `## Scout Report\n\n\*\*Depth\*\*`
for smithy-scout) — those are far more durable than narration in the
parent agent's assistant text, which current claude versions tend to omit.

### Fixture-planted inconsistencies

`evals/fixture/src/routes/users.ts` carries two **deliberate** flaws to feed
`smithy-scout`:

| Plant | Expected scout finding |
|---|---|
| Doc comment "GET /:id — get user by email address" but the handler matches by integer `id` | Conflict |
| `// TODO: add request validation ...` above the POST handler | Warning |

Don't "clean these up." The scout scenario asserts at least one Warning or
Conflict row is emitted; removing the plants breaks the eval (AS 8.1, 8.2).
See `evals/fixture/README.md` for the full table.

## The validation spike

`evals/spike/` is the FR-014 dry run that confirmed the three architectural
assumptions before any framework code was written:

| Assumption | Status |
|---|---|
| `claude -p` loads `.claude/commands|prompts|agents` from `cwd` | PASS |
| Sub-agent dispatch works in headless mode | PASS |
| Stdout capture works (especially with `stream-json`) | PASS |

Read `evals/spike/FINDINGS.md` for the full record (CLI version, command,
event-type breakdown, evidence per sub-agent). The contents are frozen — they
document the ground-truth state on 2026-04-09 against `claude` 2.1.100. If a
future CLI version breaks behavior, re-spike rather than editing the existing
findings.

## Out of scope (today)

Per the feature spec — defer until structural evals prove valuable:

- **Rubric grading / LLM-as-judge** (v2, alongside multi-run statistical analysis).
- **Docker isolation** (v2 if cross-case contamination becomes a real problem;
  temp dir + checksum is sufficient for v1).
- **CI integration** (evals are local-on-demand only — they cost tokens and
  minutes).
- **`smithy.orders` evals** (needs GitHub API mocking, which needs Docker).
- **Gemini / Codex evals** (Tier 3 covers Claude Code execution only).
- **Automatic baseline regeneration** (manual on purpose so structure changes
  are reviewed).

## References

- Spec: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md`
- Data model: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md`
- Contracts: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md`
- Project-level overview of testing tiers: top-level `CLAUDE.md` ("Testing").
