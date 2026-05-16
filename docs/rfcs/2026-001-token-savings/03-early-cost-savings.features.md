# Feature Map: Early Cost Savings

**Source RFC**: `docs/rfcs/2026-001-token-savings/token-savings.rfc.md`
**Milestone**: 3 — Early Cost Savings
**Created**: 2026-05-15

## Features

### Feature 3.1: Build-Output Protocol

**Description**: Add a shared `src/templates/agent-skills/snippets/build-output-protocol.md` that standardizes terse-mode flags, log-file capture, bounded tails, and raw-output handling for build, test, and CI commands. Inject the snippet into every M3-owned invocation site that can currently paste verbose tool output into agent context.

**User-Facing Value**: A contributor running `smithy.fix`, `smithy.forge`, or `smithy.implement` sees lower token spend from noisy `npm test`, `gradle`, `pytest`, and `gh run view` output while preserving enough diagnostic context for the agent to fix real failures.

**Scope Boundaries**:
- Includes: the new `src/templates/agent-skills/snippets/build-output-protocol.md`; snippet references in `src/templates/agent-skills/agents/smithy.implement.prompt`, `src/templates/agent-skills/commands/smithy.forge.prompt` Validation, `src/templates/agent-skills/commands/smithy.fix.prompt` Verify, and `src/templates/agent-skills/snippets/tdd-protocol.md`; the initial tool-by-tool flag table for `npm test`, `gradle`, `pytest`, and `gh run view`; measured token delta against the M1 baselines where applicable.
- Excludes: changing the per-task spec re-read mechanism in `smithy.implement.prompt` (M2 F2.3 owns); changing `smithy.forge.prompt` Phase 6 orchestration (M2 F2.4 owns); adding the CI-log failure-extraction grep step in `smithy.fix.prompt` (F3.3 owns); regenerating `.claude/` or `.smithy/smithy-manifest.json`.

### Feature 3.2: Scan-and-Triage Sub-Agent Model Downgrades

**Description**: Downgrade four scan-and-triage sub-agents from Opus to Sonnet after the expand-evals audit, mark, and cut scenarios have merged and provide the required quality net. The feature changes only the `model:` lines for `smithy.implementation-review`, `smithy.refine`, `smithy.plan-review`, and `smithy.clarify`, paired with side-by-side quality evidence.

**User-Facing Value**: Frequent Smithy workflows pay less for fixed-checklist review and triage work without reducing the quality of planning-artifact refinement or implementation review.

**Scope Boundaries**:
- Includes: `model:` line edits in `src/templates/agent-skills/agents/smithy.implementation-review.prompt`, `src/templates/agent-skills/agents/smithy.refine.prompt`, `src/templates/agent-skills/agents/smithy.plan-review.prompt`, and `src/templates/agent-skills/agents/smithy.clarify.prompt`; quality comparison on at least two expand-evals scenarios per downgraded agent; measured token delta against the M1 reporting substrate; explicit confirmation that expand-evals US1, US2, and US3 have merged before any model-line edit lands.
- Excludes: downgrading `smithy.implement`; changing any sub-agent prompt body beyond the model line; changing `smithy.survey`; adding new eval scenarios; weakening the RFC's quality regression gate.

### Feature 3.3: smithy.fix CI-Log Failure Extraction

**Description**: Add a bounded failure-extraction step to `smithy.fix.prompt`'s Verify section so the command filters `gh run view` output to the most relevant failure lines before reading it into context. The feature consumes the F1.4 `smithy.fix` baseline to show CI-log token consumption materially drops on the committed scenario.

**User-Facing Value**: A user asking Smithy to fix a CI failure gets the same actionable diagnosis with far fewer tokens spent on unrelated log noise.

**Scope Boundaries**:
- Includes: the `smithy.fix.prompt` Verify-section block that consumes `gh run view` output; the bounded grep-style extraction step for failure and error lines; downstream guidance to read the filtered log instead of the raw full log; measured token delta against the M1 `smithy.fix` baseline.
- Excludes: introducing the generic build-output protocol wrapper around `gh run view` or test commands (F3.1 owns); changing issue-ingestion behavior; editing the eval fixture or baseline except to consume committed M1 evidence; regenerating deployed artifacts.

### Feature 3.4: PR-Description Token-Delta Protocol

**Description**: Add a contributor-facing protocol to `CONTRIBUTING.md` requiring Smithy template PRs to include a concise token-delta line once the M1 baseline set exists. The section defines what to report, where the numbers come from, and how reviewers should interpret unchanged, improved, or regressed token totals.

**User-Facing Value**: Maintainers can review cost impact directly from a PR description without re-running evals locally, and contributors have a repeatable contract for proving a prompt or model change is net-positive on tokens.

**Scope Boundaries**:
- Includes: a new `CONTRIBUTING.md` section for token-delta reporting; the required PR-description line format; guidance for referencing baseline scenarios and structural-eval pass rate; at least one later M3 PR demonstrating the protocol in its description.
- Excludes: implementing eval-report token totals or baseline comparison (M1 owns); adding repository automation that blocks PRs without the line; changing PR templates outside the documented contributor protocol; applying the protocol retroactively to already-merged M1 or M2 PRs.

### Feature 3.5: M3 Snapshot-Refresh Chore

**Description**: Refresh the committed `.claude/` snapshot and `.smithy/smithy-manifest.json` only after the M3 source-template changes have landed, in a dedicated chore PR. The feature also closes the program by checking that prior M1 and M2 snapshot refreshes happened separately and that the open `smithy.implement` model-decision debt is not lost.

**User-Facing Value**: Developers using the repository's committed Smithy snapshot receive the final M3 template state without forcing every feature PR to carry noisy derived-artifact diffs.

**Scope Boundaries**:
- Includes: the dedicated end-of-M3 refresh of `.claude/` and `.smithy/smithy-manifest.json`; confirmation that no M3 feature or bugfix PR regenerated those artifacts as a side effect; a final checklist item for the open SD-004 `smithy.implement` model-decision follow-up; verification that the source templates remain the authoritative artifacts.
- Excludes: source-template feature work from F3.1 through F3.4; opening the follow-up RFC for `smithy.implement`; snapshot refreshes for M1 or M2, which are separate milestone-close chores; changing deployment semantics.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | F3.1's tool-by-tool flag table may need version-specific adjustments for Gradle, npm reporters, pytest flags, or GitHub CLI log output. The feature spec must validate the initial table against the available JS and JVM fixtures and document any tool variants that remain unsupported. | Integration Points | Medium | High | open | F3.1 spec records the tested commands and any deferred flag variants. |
| SD-002 | F3.1 and F3.3 both edit `src/templates/agent-skills/commands/smithy.fix.prompt` Verify section. F3.1 owns protocol wrapping around existing test and `gh run view` invocations; F3.3 owns the new failure-extraction step plus downstream filtered-log guidance. | Overlap Between Features | Medium | High | open | The first spec to land names the exact Verify subsection it edits; the second-to-land PR rebases without expanding scope. |
| SD-003 | F3.2 cannot safely land until expand-evals US1 (audit), US2 (mark), and US3 (cut) are merged to master and provide at least two quality samples per downgraded sub-agent. The feature spec must treat missing scenarios as a blocker, not as optional evidence. | Dependency Relationships | High | High | open | F3.2 spec verifies the merge state and includes side-by-side quality evidence before any model-line edit. |
| SD-004 | F3.4 depends on the M1 token-reporting and baseline-set substrate for meaningful token-delta reporting. If M1 lands with per-case totals only and per-sub-agent attribution descoped, the protocol must still work from committed per-case baselines and avoid requiring unavailable per-agent numbers. | Cross-Milestone Boundaries | Medium | High | open | F3.4 spec writes the protocol against the substrate M1 actually delivered. |
| SD-005 | F3.5 is a chore feature rather than source-template work, and it should not mask unresolved program debt. The final chore must explicitly surface the open `smithy.implement` model-decision follow-up from RFC SD-004 / SD-011 instead of treating snapshot refresh as program completion by itself. | Scope Within Milestone | Low | High | open | F3.5 PR checklist includes the open model-decision follow-up. |

## Dependency Order

Recommended specification sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| F3.1 | Build-Output Protocol | — | — |
| F3.2 | Scan-and-Triage Sub-Agent Model Downgrades | — | — |
| F3.3 | smithy.fix CI-Log Failure Extraction | — | — |
| F3.4 | PR-Description Token-Delta Protocol | — | — |
| F3.5 | M3 Snapshot-Refresh Chore | F3.1, F3.2, F3.3, F3.4 | — |

F3.1, F3.2, F3.3, and F3.4 are parallel-startable after M1 closes, subject to their external gates. F3.2 additionally waits on the expand-evals US1 / US2 / US3 quality net before implementation, and F3.5 runs last as the milestone-close chore after source-template and documentation work lands.

## Cross-Milestone Dependencies

Direction must be either `depends on` or `depended upon by`.

| Dependency | Direction | Notes |
|------------|-----------|-------|
| Milestone 1: Measurement Foundation | depends on | M3 starts after M1 provides per-case token totals, committed baselines, the `smithy.fix` high-cost CI-log scenario, and the JVM fixture needed to validate build-output protocol claims. |
| Cross-RFC: `specs/2026-05-03-005-expand-evals-coverage-planning-and-audit/` | depends on | F3.2 specifically depends on expand-evals US1 (audit), US2 (mark), and US3 (cut) being merged to master before model downgrades land. Other M3 features do not wait on this cross-RFC dependency. |

M2 and M3 construct in parallel after M1 with no dependency in either direction. The shared touched-files matrix (F3.1 edits `smithy.implement.prompt` and `smithy.forge.prompt`; M2 F2.3 and F2.4 own overlapping sections) requires coordination at PR time but does not impose a sequencing constraint between milestones.
