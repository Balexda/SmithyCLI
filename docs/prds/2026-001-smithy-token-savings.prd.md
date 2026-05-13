# PRD: Smithy Token-Savings Program

**Created**: 2026-05-12  |  **Status**: Draft

## Problem Statement

Smithy's quality story is excellent — users report consistently strong
outputs from `smithy.cut`, `smithy.forge`, and `smithy.fix`, the three
commands that dominate day-to-day invocations. The cost story is not.
Per-run token spend has been climbing steadily as the system has grown
more sophisticated: more sub-agents, more cross-artifact validation, more
re-reads of the same planning documents at every phase, and verbose build
and test output piped directly into agent context without bounding. The
trajectory is unsustainable for the rate at which users adopt smithy
across their PR flow.

The cost is concentrated in three identifiable layers, each with a
different correction. First, sub-agent model selection: ten of thirteen
sub-agents run on Opus, including categorical scan-and-triage roles
(implementation review, plan review, refine, clarify) that produce
structured findings against fixed checklists — exactly the workload Sonnet
handles well at a fraction of the cost. Second, artifact re-read
cascades: `smithy.forge` dispatches a fresh Opus sub-agent per task,
each one re-loading the same spec, data-model, and contracts files from
a cold context to look up acceptance scenarios for a single task; a
ten-task slice can spend two hundred thousand tokens on re-reads before
any reasoning happens. Third, build-tool output handling: there is no
prescribed protocol for terse-mode flags, log-file capture, or tail
bounds when the system runs `npm test`, `gradle`, `pytest`, or fetches a
CI log via `gh run view`. The Docker skill already demonstrates the
right pattern (`--tail 200`) but it has not been generalized.

The user cannot make confident decisions about which corrections to
prioritize because the evals framework today reports structural pass/fail
but not token usage. Worse, the framework only exercises `strike` and
`scout` — neither of which are heavily used in practice — and only on a
JavaScript fixture. The two commands that drive most cost (`forge` and
`fix`) have zero automated coverage, and the in-flight expand-evals spec
deliberately excludes them. Without per-case + per-sub-agent token
reporting and forge-shaped scenarios on a multi-language fixture, every
optimization is a guess.

## Proposed Solution

A staged token-savings program organized as a single RFC with three
milestones. Milestone 1 establishes measurement: every eval run reports
input and output tokens per case and per dispatched sub-agent, with
committed baselines so future PRs can show their delta. Milestone 2
delivers the architectural cost reductions that need measurement to
ship safely — forge eval coverage, multi-language fixtures, and the
deeper changes to `smithy.implement` and the forge orchestration model.
Milestone 3, constructable in parallel with M2, ships the low-risk
quick wins that are visible against existing strike + landing-soon
planning-command scenarios: a build-output protocol snippet, sub-agent
model downgrades for the scan-and-triage roles, and improved CI-log
handling in `smithy.fix`.

The user-observable capability is that smithy's quality remains intact
while per-invocation cost drops materially on the high-frequency
commands, and every future change to smithy carries a defensible token
delta in its PR description.

## Target Users

- **Smithy power users (the primary author of this PRD)** — daily heavy
  use of `smithy.fix`, `smithy.forge`, and `smithy.cut`. Currently
  experiences runaway per-PR cost without a clear lever to reduce it.
- **Smithy contributors** — need a way to evaluate whether a proposed
  change to a prompt or sub-agent is net-positive on cost as well as
  on quality.
- **Future smithy adopters** — onboarding decisions partly depend on
  predictable per-PR cost; the program reduces a barrier to wider
  adoption.

## Success Signals

- Every `npm run eval` report includes a token-usage column per
  scenario and per dispatched sub-agent.
- Strike, cut, audit, mark scenarios in the expand-evals work carry
  committed token baselines; PRs that change templates show a delta
  against those baselines in their description.
- `smithy.forge` and `smithy.fix` have at least one eval scenario each
  exercising their high-cost paths.
- A typical `smithy.forge` slice on the JS fixture costs at least 40%
  fewer tokens than the M1 baseline, with no regression in
  structural-eval pass rate or in human-reviewed output quality.
- The build-output protocol snippet is referenced from every command
  that runs build/test/CI commands; raw verbose output no longer lands
  in any agent's context window.

## Alternatives / Build-vs-Buy

### Alternatives Considered

| Name | URL | Category | Fit | Why not |
|------|-----|----------|-----|---------|
| Anthropic Messages Batches API | https://docs.anthropic.com/en/docs/build-with-claude/batch-processing | API feature | Partial | Reduces per-message price but not per-message token count; orthogonal to the underlying re-read / verbose-output problems. Already deferred to a follow-up feature per the expand-evals spec. |
| Manual cost dashboards (Anthropic console panel) | https://console.anthropic.com/ | Built-in observability | Partial | Surfaces total spend but cannot attribute cost to individual sub-agent dispatches or to particular smithy commands. Useful as a sanity check, not as a primary signal. |
| Prompt-caching reliance | https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching | API feature | Poor | Cache lifetime is 5 minutes within a single conversation; sub-agents are spawned with fresh contexts and cannot inherit a cache from the parent. The dominant smithy cost shape (per-task fresh sub-agents re-reading specs) is exactly the workload prompt caching does not help. |
| LangSmith / external LLM observability platforms | https://www.langchain.com/langsmith | SaaS observability | Poor | Adds an external dependency and a separate UI; smithy's eval framework already runs locally and is the natural place for token reporting. The instrumentation cost is roughly one engineer-day inside the existing framework versus integration plus account-management overhead externally. |

### Build-vs-Buy Rationale

The build path is small and self-contained. Smithy's eval runner already
parses the Claude CLI's stream-json output to extract `extracted_text`
for structural validation; the same stream carries `usage.input_tokens`
and `usage.output_tokens` per message and per sub-agent dispatch. Adding
those fields to `EvalReport` and rendering them in `formatReport` is
one focused PR. Compared with integrating an external observability
platform — separate auth, separate UI, no awareness of smithy's
sub-agent dispatch semantics — the build path delivers more precise
signal at lower long-term operational overhead. The Batches API and
prompt caching both remain available as orthogonal future wins; this
program does not preclude either.

## Assumptions

- [Critical Assumption] The Claude CLI's stream-json output reliably
  emits `usage.input_tokens` and `usage.output_tokens` on both top-level
  messages and dispatched sub-agent records. If sub-agent dispatches
  attribute their usage only to the parent transcript, the per-sub-agent
  attribution in F1.3 is degraded to per-case totals only.
- [Critical Assumption] Sub-agent model downgrades from Opus to Sonnet
  for `smithy.implementation-review`, `smithy.refine`,
  `smithy.plan-review`, and `smithy.clarify` do not degrade structural
  eval pass rate on existing or landing-soon scenarios. M3 explicitly
  validates this before downgrades land.
- The in-flight `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/`
  spec is on track to complete in roughly the same timeframe as M1 of
  this program, providing the cut / audit / mark scenarios that M3 uses
  as a quality net for model-downgrade validation.
- A minimal JVM workload under `evals/fixture/jvm/` is sufficient to
  validate the gradle clauses of the build-output protocol. Cargo, Go,
  and Python coverage are nice-to-have but not blocking.
- The user's existing memory entries about `.claude/` snapshot policy
  (`project_gitignore_philosophy.md`) continue to apply: token-savings
  PRs edit `src/templates/` only; snapshot refresh is a separate chore.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | The Claude CLI stream-json may attribute sub-agent usage only to the parent transcript rather than per-dispatch. If so, F1.3 falls back to per-case totals only and per-sub-agent attribution becomes a follow-up. Confirm by inspecting a captured `evals/captures/strike-health-check.events.jsonl` before F1.3 implementation. | Functional Scope | Critical | Medium | open | — |
| SD-002 | The forge eval scenario in M2 needs the runner's temp-copy fixture to be a working git repository (forge runs `git checkout -b` and creates commits). Mirrors SD-001 / SD-007 of the expand-evals spec. Resolution likely requires the runner to `git init` the temp copy before each forge scenario. | Edge Cases | Critical | Medium | open | — |
| SD-003 | Sub-agent model downgrades for `smithy.implementation-review`, `smithy.refine`, `smithy.plan-review`, and `smithy.clarify` are theoretical until validated against landing-soon expand-evals scenarios. M3 must include a side-by-side quality comparison on at least two scenarios per downgraded agent before the downgrade lands in `src/templates/`. | Functional Scope | High | Medium | open | — |
| SD-004 | `smithy.implement` model assignment is deliberately left at Opus in M3 and revisited only after M1 + M2.1 deliver measurement on a real forge run. The decision criterion is whether per-task spec re-reads (F2.3) plus a Sonnet downgrade together regress structural quality. | Functional Scope | High | Medium | open | — |
| SD-005 | The build-output protocol's tool-by-tool flag table (`gradle --console=plain --quiet`, `npm test -- --reporter=line`, etc.) may need version-specific adjustments. M3 ships an initial table; entries are refined as multi-language fixtures land in M2.2. | Non-Functional Quality | Medium | High | open | — |
| SD-006 | The trivial-slice review-skip heuristic (`<50 lines / <3 files`) is a guess; M2.5 must calibrate against captured forge runs once F1.3 + F2.1 land. Initial threshold may need to be tuned upward or downward, and the slimmed inline checklist needs design once the threshold is set. | Functional Scope | Medium | Medium | open | — |
| SD-007 | Parallel construction of M2 and M3 requires that their template edits do not conflict. Coordinate via the RFC's feature map: M3's slices touch `snippets/build-output-protocol.md` (new), four sub-agent `model:` lines, and one `smithy.fix.prompt` block. M2's slices touch `smithy.implement.prompt`, `smithy.forge.prompt` orchestration, and `evals/`. Conflict-free as currently scoped, but re-check at M2/M3 spec drafting. | Integration | Medium | Medium | open | — |
| SD-008 | The expected 40% per-slice token reduction in the success signals is an order-of-magnitude estimate from the cost analysis, not a measurement. Treat it as a target, not a guarantee; M1 baseline numbers will calibrate the achievable range, and M2 + M3 success criteria may be reset based on what M1 reveals. | Non-Functional Quality | Medium | High | open | — |

## Open Questions

- Should `smithy.implement` migrate to Sonnet eventually, or is Opus
  genuinely load-bearing for TDD quality? Deferred to post-M2.1 data.
- Is the existing competing-lens fan-out in `smithy.cut` Phase 2.8 (3
  parallel slice agents + reconcile) worth its cost relative to a
  single-lens variant? Not addressed by this program; possible
  follow-up RFC if M1 measurement shows it is a larger share of cost
  than currently estimated.
- Does the Anthropic Messages Batches API integration belong in a
  follow-on RFC or is it always-orthogonal? Currently treated as
  orthogonal per the expand-evals spec's deferral.

---

> Ready for `smithy.ignite docs/prds/2026-001-smithy-token-savings.prd.md` to expand into an RFC.
