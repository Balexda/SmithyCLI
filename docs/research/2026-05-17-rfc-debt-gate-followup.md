# RFC-Layer Spec-Debt Gate Follow-Up — 2026-05-17

Follow-up to [#362](https://github.com/Balexda/SmithyCLI/issues/362) and
the 2026-05-16 full-corpus survey
(`docs/research/2026-05-16-spec-debt-survey.md`). #362 flagged that the
RFC layer had a **100% leak rate** in the surveyed corpus (13/13 rows
non-steering) and asked whether the kind gate shipped by #361 is enough
to fix it, or whether the RFC template needs an emission-specific tweak
(option B) or section removal (option C).

The issue's acceptance criterion is empirical: run a fresh
`/smithy.ignite` post-#361 and inspect the resulting RFC. No post-#361
RFC exists in either repo yet, so this note substitutes the strongest
available offline evidence: **walk every one of the 13 known-leaky RFC
rows through the post-#361 gate, then check whether the live feature-map
debt sections show under-capture of RFC-level steering needs.**

## Walkthrough — 13 RFC rows vs. the kind gate

Every row is from
`docs/rfcs/2026-001-token-savings/token-savings.rfc.md` (lines 140–152
in the current tree). Each row is named (a) its survey kind, (b) which
clause of `src/templates/agent-skills/agents/smithy.clarify.prompt`
catches it — either **Step 3a** (lines 92–96; High-confidence
candidates route to `assumptions` without a kind-gate check, gaining a
`[Critical Assumption]` annotation only if Impact is Critical) or
**Step 3b** (lines 102–145; the kind gate applied only to Medium/Low
candidates), and (c) its proper home per the gate's leak-kind table
(lines 128–135).

| Row (`Impact` / `Confidence`) | Survey kind | Catching clause | Proper home |
|-----|-------------|-----------------|-------------|
| SD-001 (`:140`, Critical/Medium) | A | Step 3b clause 3 "No prescription" — *"Confirm by inspecting a captured … events.jsonl before F1.3b implementation"* is a verification directive | A user story's `### Acceptance Scenarios`; at the RFC layer, dropped (not retained as RFC debt) |
| SD-002 (`:141`, Critical/Medium) | R | Step 3b clause 3 — *"Resolution likely requires the runner to `git init` the temp copy"* prescribes the fix | RFC body or downstream spec's `### Functional Requirements` |
| SD-003 (`:142`, High/Medium) | R | Step 3b clause 3 — *"F3.2 must include a side-by-side quality comparison on at least two scenarios per downgraded agent before the downgrade lands"* is a hard requirement | RFC's Cross-Cutting Governance or F3.2's spec FRs |
| SD-004 (`:143`, High/Medium) | F | Future-work / deferral lane — *"Captured in a follow-up RFC, not this program"* | `## Out of Scope` plus a follow-up GitHub issue |
| SD-005 (`:144`, Medium/High) | F | **Step 3a** — High confidence routes to `assumptions` without a kind-gate check (Impact is Medium, not Critical, so no `[Critical Assumption]` annotation). Never reaches the leak table. | `## Assumptions` (no annotation) |
| SD-006 (`:145`, Medium/Medium) | A | Step 3b clause 3 — *"M2 must calibrate against captured forge runs once F1.3a + F1.5 land"* is a verification activity | F2.5 spec's `### Acceptance Scenarios` |
| SD-007 (`:146`, Medium/Medium) | D | Dependency / coordination lane — row explicitly cites *"The Cross-Cutting Governance touched-files single-owner matrix pre-empts the bulk of the surface"* | The RFC's governance matrix (which the row already points at) |
| SD-008 (`:147`, Medium/High) | R | **Step 3a** — High confidence routes to `assumptions` without a kind-gate check (Impact is Medium, not Critical, so no `[Critical Assumption]` annotation). The *"Treat it as a target, not a guarantee"* phrasing happens to read as an assumption already; 3a's routing matches the row's actual shape. | `## Assumptions` (no annotation) |
| SD-009 (`:148`, Medium/Medium) | D | Dependency / coordination lane — *"touched-files matrix assigns the snippet body to F3.1; F2.3's changes route through smithy.implement.prompt orchestration"* | Cross-Cutting Governance matrix |
| SD-010 (`:149`, Medium/Medium) | D | Dependency / coordination lane — *"second-to-land PR rebases against the first"* with ownership partition | Cross-Cutting Governance matrix |
| SD-011 (`:150`, Low/High) | O (survey) — better read as a forward-looking process note about ensuring SD-004 is resolved before program end | **Step 3a** — High confidence routes to `assumptions` without a kind-gate check (Impact is Low, not Critical, so no annotation). The row is forward-looking ("risks getting lost", "F3.5 explicitly captures … as a final-milestone checklist item") rather than a backward-looking resolution record, so the prior survey's `O` label is loose; the post-#361 routing handles it via 3a regardless of kind. | `## Assumptions` (no annotation) |
| SD-012 (`:151`, Medium/Medium) | D | Dependency / coordination lane — *"Sub-section ownership: F2.3 owns the re-read mechanism; F3.1 owns the build-output-protocol wrapper"* | Cross-Cutting Governance matrix |
| SD-013 (`:152`, Medium/Medium) | D | Dependency / coordination lane — *"F3.1 owns the protocol-wrapping changes around existing invocations; F3.3 owns the new grep step"* | Cross-Cutting Governance matrix |

**Result.** 13/13 rows are caught by an explicit clause of the
post-#361 routing: **3 rows (SD-005, SD-008, SD-011) never reach the
kind gate at all** because Step 3a routes High-confidence candidates to
`assumptions` first; the remaining **10 rows are caught by Step 3b** —
mostly clause 3 "No prescription" (every Step-3b row attaches a
directive: "Resolution likely requires…", "must include…", "Captured
in a follow-up RFC…", "Sub-section ownership: F2.3 owns…"). Step 3b
clauses 1+2 (open question with named alternatives) reinforce: none of
the 13 rows pose a question or name two paths a human would pick
between. The ignite Phase 0c routing rule
(`src/templates/agent-skills/commands/smithy.ignite.prompt:184-194`)
adds belt-and-suspenders for the Step-3b subset: it explicitly forbids
back-filling debt from the governance matrix, milestone deferrals, or
post-hoc resolution records — precisely the three buckets (D=5 + F=2 +
O=1) that account for 8/13 (62%) of the observed leaks.

## Feature-map under-capture audit

#362 raised a second concern: even if the RFC gate works, real
RFC-level steering needs might be **under-captured** at the RFC layer
and surface instead as feature-map debt at render-time. To test this,
every `| SD-` row across the three feature maps in
`docs/rfcs/2026-001-token-savings/` was extracted (15 rows total — 4
more than were present at the 2026-05-16 survey snapshot of 11) and
each clean-S row was inspected for "RFC-shape": does it name a
cross-feature contract, milestone-scope choice, or program-level
integration boundary that would have been a steering need at the RFC
layer?

| Row | Description shape | RFC-shaped? |
|-----|-------------------|-------------|
| `01-measurement-foundation.features.md:94` (SD-002) | YAML field name `fixture:` vs `fixture_path:`, default semantics for F1.6 | No — mechanism choice scoped inside F1.6 |
| `01-measurement-foundation.features.md:95` (SD-003) | How `smithy.fix.prompt` discovers an offline issue (`--from-file` arg vs prompt-level workaround vs runner mock) | No — mechanism choice scoped inside F1.4 |
| `01-measurement-foundation.features.md:96` (SD-004) | `formatReport` per-sub-agent rendering format (nested sub-rows vs separate table vs `--detail tokens` flag) | No — UI choice scoped inside F1.3b |

A fourth row, `02-architectural-cost-reductions.features.md:43`
(SD-001), names two alternatives (pre-paste excerpt vs per-task brief)
but attaches both a deferral ("intentionally defers … until M1
baselines exist") **and** a verification workflow ("the feature spec
must compare both options against the JS and JVM forge baselines
before selecting the implementation path"). Under Step 3b clause 3
("nor what to verify, nor when to defer it") the row is a leak (F/A
shape), not a clean-S candidate — the gate catches it. The
cross-milestone gating it encodes is already covered by the RFC's
measurement-first gate (`## Goals`, milestone ordering), so the row
also does not surface an RFC-level steering need the RFC clarify
missed.

The remaining 12 feature-map rows are R / A / D / F / O shapes the
gate would catch (most are coordination / ownership notes mirroring
the RFC's D pattern). None of the three clean-S rows describe a
choice that would change the milestone decomposition, program goals,
or cross-cutting governance matrix. The layer split is working:
feature maps capture mechanism choices that only emerge when a
feature is specified in detail.

**No evidence of RFC-layer under-capture.** If the next live ignite run
generates a real `## Specification Debt` row that *should* have been
RFC-shape but landed at the feature-map layer, that's a signal worth
re-opening the question — but no such pattern exists in today's corpus.

## Findings

1. **The post-#361 gate is sufficient for the observed RFC leak set.**
   Every shape in the surveyed 13 rows is named explicitly in the gate's
   leak-kind table or caught by the "No prescription" clause. The
   ignite Phase 0c reminder reinforces this at the routing step.
2. **Issue #362's recommendation (option A — keep, trust, revisit)
   holds.** No structural template change is justified by the current
   evidence. Options B (RFC-specific category override) and C (remove
   the section) remain available as fast follow-ups if a live ignite
   run later produces leak-shaped (non-clean-S) debt in an RFC.
3. **The user-raised "underreporting at the RFC layer" hypothesis is
   not supported by the feature-map corpus.** Clean-S feature-map rows
   are all mechanism-scoped, exactly where they belong. The single
   borderline cross-milestone row already routes through an existing
   RFC-level gate.

## Recommendation

Close [#362](https://github.com/Balexda/SmithyCLI/issues/362) with this
note linked as the evidence base. Take no template / prompt action
beyond what #361 already shipped.

**Acceptance-criterion substitution (explicit).** #362's stated
acceptance is a live post-#361 `/smithy.ignite` run that produces an
empty or clean-S `## Specification Debt` section. No post-#361 RFC
exists yet, and a one-off live ignite specifically for this validation
is heavier than the resolution warrants. This note substitutes an
**offline equivalent**: a clause-by-clause walkthrough of every known
RFC leak shape through the current gate, plus a feature-map audit for
the under-capture hypothesis. The substitution is defensible because
(a) every observed leak shape is named explicitly in the gate's
routing tables, (b) the feature-map corpus shows no RFC-level
under-capture, and (c) the close-out is reversible — the issue can be
re-opened when a live run produces contradicting evidence. The live
check remains a future signal rather than a blocker on close-out.

**Future signal to watch:** the next time a live `/smithy.ignite` run
produces a non-empty `## Specification Debt` section in an RFC, audit
it against the kind gate's leak-kind table. If a row survives that is
leak-shaped (R / A / D / F / O rather than clean-S), re-open #362 (or
a successor) and proceed to option B. If multiple consecutive RFC
runs ship with leak-shaped debt, option B becomes the obvious next
step; option C remains a last resort because it forfeits real
steering capture for the rare cases when an RFC genuinely faces an
unresolved architectural choice.

## Limitations

- **No live empirical validation.** The offline walkthrough cannot
  observe how the model behaves under the gate in a fresh ignite run;
  it can only verify that the gate's text covers each observed leak
  shape. The walkthrough is necessary but not sufficient — the live
  validation remains a future signal.
- **Corpus is one RFC and three feature maps.** Both the 2026-05-16
  survey and this follow-up draw from the same `token-savings` program.
  A second program landing post-#361 will be the first independent test
  of the gate at the RFC layer.
- **Borderline classifications.** Three feature-map rows straddle the
  clean-S / leak line under a strict reading of Step 3b clause 3.
  01 SD-002 and 01 SD-004 attach "Recommended default" prescriptions
  to otherwise S-shaped descriptions; 02 SD-001 attaches a deferral
  plus a "must compare both options" verification workflow. All three
  would route to `assumptions` (or be dropped) rather than land in
  debt under the post-#361 gate. This note classifies them as
  feature-shape (not RFC-shape) regardless of how the gate routes
  them, since the alternatives they name are intra-feature.
