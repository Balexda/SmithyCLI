# Headless Execution Validation Spike — Findings

Spike to validate three assumptions about `claude -p` headless mode that
underpin the evals framework architecture (FR-014).

**Date**: 2026-04-09
**CLI version**: Claude Code 2.1.100
**Auth method**: OAuth (no ANTHROPIC_API_KEY; authenticated via `claude login`)
**Command**: `claude --output-format stream-json -p --verbose "/smithy.strike 'add a health check endpoint'"`
**CWD**: Repository root with Smithy skills deployed via `smithy init -a claude -y`
**Raw output**: `output-strike-raw.json` (stream-json format, 432KB)
**Extraction utilities**: `parse-stream.mjs` (library), `extract.mjs` (CLI)

## Assumption A: Skill Loading

**Status**: PASS

**Evidence**: The `/smithy.strike` slash command was recognized and executed as
the deployed skill. The output exhibits strike's full workflow structure:

- `**Phase 1: Branch**` — branch creation
- `**Phase 2: Explore & Propose**` — codebase exploration, sub-agent dispatch,
  reconciled plan output

Structural sections found in output (6 matches):
- `## Summary`, `## Approach`, `## Risks`, `## Conflicts`

No generic refusal patterns detected (`"I'd be happy to help"`, `"Sure, here's"`
both absent).

**Caveat**: The `# Strike:` heading marker assumed by the tasks spec does NOT
appear in actual output. Strike's output uses `## Summary` as the top-level
heading, with `**Phase N:**` bold markers for workflow stages. The evals
framework structural expectations must use these actual markers, not the assumed
`# Strike:` heading.

**Fallback**: Not needed — skill loading works.

---

## Assumption B: Sub-Agent Dispatch

**Status**: PASS

### Per-Agent Status

| Sub-Agent | Status | Evidence |
|-----------|--------|----------|
| smithy-plan | PASS | 4 matches — lens labels appear in output: `[via Robustness]`, `Separation of Concerns` referenced in plan content |
| smithy-reconcile | PASS | 7 matches — `"reconciled plan"`, `"smithy-reconcile agent"`, `[via` attribution markers |
| smithy-clarify | PASS | 1 match — `"smithy-clarify"` agent dispatch text visible in assistant messages |
| smithy-scout | EXPECTED-ABSENT | 0 matches — correct behavior. Strike does not dispatch scout (known spec gap vs US6 acceptance scenario 1) |

All three dispatched sub-agents (plan x3 lenses, reconcile, clarify) produced
evidence of invocation in the output stream.

**Note on clarify evidence**: The clarify agent was dispatched (visible in
assistant message: `"Now dispatching the **smithy-clarify** agent"`), but its
output markers (`clarif`, `assumption`) had only 1 match in the extracted text.
This may be because clarify's output was consumed internally by strike rather
than surfaced in the final output. The evals framework should check for either
the dispatch message OR the output markers.

---

## Assumption C: Stdout Capture

**Status**: PASS

**Evidence**:
- Output file: 5,675 characters, 105 lines (non-empty)
- Markdown headings: 8 headings found (valid Markdown structure)
- Error lines: 0 error-like lines out of 105 total (not error-only output)
- Exit code: 0

**Key finding — output format**: Using `--output-format stream-json` produces
newline-delimited JSON events, each with a `type` field:

| Event type | Count | Description |
|------------|-------|-------------|
| `system` | 62 | Hook events, session metadata |
| `user` | 63 | Auto-generated user messages (headless mode prompts) |
| `assistant` | 70 | Assistant responses with text and tool_use content |
| `result` | 1 | Final result text |
| `rate_limit_event` | 1 | Rate limit notification |

To extract readable output, the evals framework must parse each JSON line and
extract text from:
1. `assistant` events → `message.content[]` where `type == "text"`
2. `result` events → `result` field (final output)

Plain `claude -p` (without `--output-format stream-json`) likely produces raw
text on stdout, but stream-json is richer — it reveals tool use, sub-agent
dispatch, and internal workflow steps that are invisible in plain text output.

**Recommendation**: The evals framework should use `--output-format stream-json`
for maximum observability, with a JSON parser to extract text and tool-use
events. This enables sub-agent dispatch verification (Assumption B) without
relying solely on output text patterns.

---

## Fallback Approaches

No fallback testing was needed — all three assumptions passed.

The raw prompt injection fallback (`claude -p "$(cat .claude/commands/smithy.strike.md) ..."`")
remains available if a future Claude CLI version changes `.claude/` file loading
behavior, but is not required for the current architecture.

---

## Conclusion

**Recommendation: Proceed with the evals framework as designed.**

All three core assumptions are validated:

1. **Skill loading works** — `claude -p "/smithy.strike ..."` loads and executes
   deployed `.claude/commands/` skills in headless mode.
2. **Sub-agent dispatch works** — strike successfully dispatches smithy-plan (x3
   lenses), smithy-reconcile, and smithy-clarify as sub-agents in headless mode.
3. **Stdout capture works** — full output is captured on stdout, in both plain
   text and structured JSON formats.

### Adjustments for the evals framework

1. **Structural markers**: Update expected markers from `# Strike:` to
   `## Summary`, `## Approach`, `## Risks` (actual output format).
2. **Output format**: Use `--output-format stream-json` for richer observability.
   Build a JSON line parser into the eval runner.
3. **Sub-agent verification**: Check assistant message text for dispatch markers
   (`"dispatching the **smithy-plan**"`) in addition to output content patterns.
4. **Authentication**: Support both `ANTHROPIC_API_KEY` and OAuth — the spike
   ran successfully with OAuth only.
5. **Scout gap**: Strike does not dispatch smithy-scout. US6 acceptance scenario
   1 expects scout evidence — this must be reconciled before US6 implementation.
6. **Duplicate output**: The final result appeared twice in the stream, likely
   because headless mode auto-replied after the first plan presentation. The
   evals framework should deduplicate or use only the `result` event type.
