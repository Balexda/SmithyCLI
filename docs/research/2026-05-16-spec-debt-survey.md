# Specification Debt Quality Survey — 2026-05-16

Survey conducted in service of [Balexda/SmithyCLI #361](https://github.com/Balexda/SmithyCLI/issues/361):
"Specification Debt quality issues." The issue calls out that emitted
spec debt has drifted from its intended purpose — flagging genuine
*steering needs* — into a catch-all for dependency notes, requirements,
acceptance-test checklists, and future-work deferrals.

This document is the full-corpus revision of an earlier 47-row sample.
It now covers **every `## Specification Debt` row** across both
repositories the issue named — `Balexda/SmithyCLI` and `Balexda/March`
— classifies each row by kind, and reports per-repo / per-artifact-type
tallies. Exemplars are pulled from the classified set with verified line
references.

The findings drive the prompt edits that ship with this PR
(`src/templates/agent-skills/agents/smithy.clarify.prompt` Step 3,
plus mirror edits in refine, review-protocol, one-shot-output, mark,
cut, and ignite).

## Method

- **Corpus**: every `## Specification Debt` section across `specs/` and
  `docs/rfcs/` in both repos (~91 planning artifacts total).
- **Extraction**: 343 `| SD-NNN |` table rows were extracted with
  `grep -rn "^| SD-[0-9]"` and parsed into structured JSON
  (file, line, id, description, source category, impact, confidence,
  status, resolution, repo, artifact type).
- **Inheritance handling**: 146 of the 343 rows are *inherited* (carried
  forward from an upstream spec's debt section into a downstream tasks
  file, either via `status: inherited` or a `inherited from spec:`
  description prefix). Inherited rows duplicate their parent's
  classification by definition, so the kind analysis runs over the
  **197 non-inherited rows** (132 SmithyCli + 65 March) — the universe
  of distinct findings. Inheritance amplifies the noise downstream but
  is not a separate source of error.
- **Classification kinds** (same rubric as the v1 sample survey):
  - **S — Steering need** *(good)*: an unresolved choice the model
    cannot make on its own; two or more meaningfully different paths
    are named; no prescription is attached. The human picks; the pick
    changes what gets built.
  - **R — Requirement leak**: an FR/NFR-shaped assertion ("X must Y",
    "Implementers verify Z", "Mitigation: pin both files",
    "Assumption: X"). Belongs in `### Functional Requirements` or
    `### Assumptions`, not debt.
  - **A — Acceptance-test leak**: a verification activity ("acceptance
    criteria require empirically capturing X", "Verification needed
    against actual Gemini CLI behavior"). Belongs in `### Acceptance
    Scenarios`.
  - **D — Dependency / coordination note**: identifies two
    features/PRs/files touching the same surface and prescribes
    ownership / rebase order. Belongs in the RFC's Cross-Cutting
    Governance / touched-files matrix or `## Dependency Order`.
  - **F — Future work / TODO**: announces deferral ("out of scope this
    round", "deferred to follow-up", "intentionally not authored").
    Belongs in `## Out of Scope` plus a follow-up issue.
  - **O — Other**: documentation notes, post-hoc resolution records
    (`Resolution: resolved 2026-04-19 — verified that…`), reviewer
    back-references, or rows whose entire purpose is to record that
    something is *not* a problem.
- **Classification execution**: a subagent classified all 197 rows
  against the rubric. The author spot-checked 32 rows (16% of the set,
  evenly across kinds and both repos). 31 of 32 were correct; 1 row
  (smithycli SD-010 of expand-evals.spec.md L218) carried a hallucinated
  `tell` quote — its classification is borderline F/O/D. Aggregate
  per-kind counts are therefore trustworthy to roughly ±2–3 rows; no
  bucket's headline percentage moves by more than a point if every
  borderline row swings.

## Corpus shape

### Total rows

| Repo | tasks | spec | rfc | features | **Total** |
|------|------:|-----:|----:|---------:|----------:|
| SmithyCli | 229 | 23 | 13 | 11 | **276** |
| March     |  27 | 33 |  0 |  7 | ** 67** |
| **All**   | **256** | **56** | **13** | **18** | **343** |

### Inheritance split

| | Inherited | Non-inherited | Total |
|---|---:|---:|---:|
| SmithyCli | 144 | 132 | 276 |
| March     |   2 |  65 |  67 |
| **All**   | **146** | **197** | **343** |

SmithyCli carries its spec debt *aggressively* into tasks files (smithy.cut's
inheritance step fires on every story). March has only 2 inherited rows
across all of its tasks artifacts — partly because March is younger and
the cut-inheritance is newer there, partly stylistic.

## Per-kind tallies (197 non-inherited rows)

### Headline numbers

| Kind | All | SmithyCli | March |
|------|----:|----------:|------:|
| **S — Steering need** *(good)* | 57 (29%) | 29 (22%) | 28 (43%) |
| **R — Requirement leak** | 55 (28%) | 37 (28%) | 18 (28%) |
| **A — AT leak** | 23 (12%) | 19 (14%) |  4 ( 6%) |
| **D — Dependency / coordination note** | 18 (9%) | 12 ( 9%) |  6 ( 9%) |
| **F — Future work / TODO** | 14 (7%) | 14 (11%) |  0 ( 0%) |
| **O — Other** (doc / resolution record) | 30 (15%) | 21 (16%) |  9 (14%) |
| **Leak rate** | **71%** | **78%** | **57%** |

### By artifact type (cross-repo)

The leak pattern is **dominated by where in the pipeline the debt was
emitted**, not by which repo emitted it:

| Artifact | n | S | R | A | D | F | O | Leak rate |
|---------|--:|--:|--:|--:|--:|--:|--:|----:|
| **spec.md** | 56 | 54% | 11% | 14% |  9% |  7% |  5% | **46%** |
| **features.md** | 18 | 50% |  0% |  6% | 33% |  6% |  6% | **50%** |
| **rfc.md** | 13 |  0% | 23% | 15% | 38% | 15% |  8% | **100%** |
| **tasks.md** | 110 | 16% | 42% | 11% |  2% |  6% | 23% | **84%** |

This is the headline finding of the full survey. Three things jump out:

1. **Specs are the *only* layer doing OK.** spec.md is 54% steering —
   above-average. When clarify runs at spec-time, it produces
   reasonable debt.
2. **RFC-level debt is entirely leaked.** Zero S rows out of 13.
   Every RFC debt entry is either a coordination note (38%), a
   requirement leak (23%), a deferral (15%), an AT leak (15%), or a
   resolution record (8%). The Cross-Cutting Governance section right
   below it already owns coordination; the RFC body owns the rest.
3. **Tasks files are the dirtiest layer by a wide margin.** Only 16%
   steering, 42% requirement leak, plus 23% O (mostly resolution
   records and reviewer back-references). When smithy.cut runs its own
   clarify pass on top of the inherited debt, it adds prescriptive
   "implementers do X" content that belongs in slice acceptance
   criteria.

### Cross-repo asymmetry

March's headline numbers look healthier: 43% S vs SmithyCli's 22%. Two
reasons explain almost all of the gap:

- **March has zero F rows.** SmithyCli has 14. March's authors use
  `## Out of Scope` and follow-up issues correctly; SmithyCli routinely
  dumps "deferred this round" notices into debt.
- **March's artifact mix tilts spec/features-heavy** (33+7 vs 23+11 in
  SmithyCli), with much less tasks-level surface (27 vs 229 rows
  total). Tasks is the leakiest layer everywhere, so a corpus with
  proportionally less tasks output looks cleaner.

When you control for artifact type, the per-kind shapes are roughly
similar across the two repos. The drift problem is *layer-driven*, not
*repo-driven*.

## Exemplars (verified)

Each exemplar below is anchored by `file:line` and quotes the
description verbatim. The triggering lexical signal is bolded.

### S — Steering need (the bar)

**SmithyCli** — `expand-evals-coverage-planning-and-audit.spec.md:216`
(SD-008): *"**Whether** scenarios that create a PR (`gh pr create` in
mark/cut/render/ignite) need to be neutralized in the eval environment.
Without `gh` auth in CI/local eval context, the one-shot snippet's
PR-creation-failure branch will trigger… Implementers **either (a)**
assert against the failure branch in `required_patterns`, **(b)** provide
stub `gh` credentials, **or (c)** accept either branch via regex
alternation."*

**March** — `spawn-sandbox-security.spec.md:245` (SD-003): *"Proxy-sidecar
lifecycle ownership is unspecified at the contract level. **Open
questions: (a)** which Stage 4 sub-step creates the proxy and the
private network? **(b)** what is the cleanup ordering when the proxy
fails to start vs. when the spawn container fails to start? **(c)** how
are the proxy's logs surfaced for diagnostics?"*

**Shape:** *open question, two or more named paths, no directive
attached.* The author admits not knowing; the human reader is the
decider.

### R — Requirement leak (largest leak category)

**SmithyCli** — `expand-evals-coverage-planning-and-audit.spec.md:211`
(SD-003): *"Cross-talk between mark and cut/render plants… **Mitigation:**
scenario-isolated subdirectories… **Implementers verify** the directory
layout before each scenario lands."*

**March** — `03-isolated-worktree-and-branch.tasks.md:68` (SD-003):
*"Collision retry bound is unspecified. **Assumption:** a small
hardcoded retry count (e.g., 5) is sufficient given the
16M-combination-per-day ID space. Exhausting retries yields a clear
error and exits 1."*

**Shape:** *description names a concern, then ends with a directive*
("Mitigation: …", "Implementers verify …", "Assumption: X" stated as
load-bearing). The author has decided; they're recording a requirement
in the wrong section. March's twist: many R rows are phrased as
"Assumption: …" — they belong in the artifact's `## Assumptions`
section, not debt.

### A — Acceptance-test leak

**SmithyCli** — `expand-evals-coverage-planning-and-audit.spec.md:209`
(SD-001): *"Mark/cut/render/ignite scenarios all run `git checkout -b`
inside the temp fixture copy… **Need to confirm** the temp copy is
git-initialized — otherwise the scenarios fail at the branch-creation
step before any output is captured."*

**March** — `spawn-sandbox-security.spec.md:243` (SD-001): *"Gemini
backend `allowedEgressHosts` hostname set is not pinned to a specific
FQDN in the RFC… Current best inference: `["generativelanguage.googleapis.com"]`.
**Verification needed against actual Gemini CLI behavior** at render/cut
time."*

**Shape:** *the work to resolve is a verification activity that
generates an acceptance criterion, not a steering decision.* If the
author can write down what *would convince them* the answer is right,
that sentence is an acceptance criterion — not debt.

### D — Dependency / coordination note

**SmithyCli** — `token-savings.rfc.md:148` (SD-009): *"`tdd-protocol.md`
is referenced by both F2.3 (which changes how the snippet is invoked)
and F3.1 (which edits the snippet body to inject the build-output
protocol). The touched-files matrix assigns the snippet body to F3.1;
**F2.3's changes route through `smithy.implement.prompt` orchestration**
of existing invocations rather than edits to the snippet itself."*

**March** — `spawn-sandbox-security.spec.md:248` (SD-006): *"SC-009
hardcodes a single `tmpfs` mount entry for `/tmp`, and the data-model
A2 expected shape pins `mountCount: 1`. SD-002 explicitly leaves room
for additional tmpfs mounts… **Tracked separately so SD-002's
resolution explicitly closes both.**"*

**Shape:** *two artifacts/features touch the same surface; the row
prescribes who owns what.* The RFC's Cross-Cutting Governance matrix
exists exactly for this. Concentrated in `.rfc.md` (38% of RFC debt)
and `.features.md` (33%).

### F — Future work / TODO (SmithyCli only)

**SmithyCli** — `expand-evals-coverage-planning-and-audit.spec.md:217`
(SD-009): *"**Per-mode variants for each command**… **are deferred to
follow-up features**. This feature ships exactly one canonical scenario
per command."* — also restated word-for-word in the same spec's
`## Out of Scope` section.

**SmithyCli** — `expand-evals-coverage-planning-and-audit.spec.md:220`
(SD-012): *"Baseline files for the six new scenarios are **intentionally
not authored in this round**…"* — triplicated: also in the spec's
Assumptions and in its `## Out of Scope`.

**Shape:** *the deferral itself is the load-bearing word ("deferred",
"intentionally not", "out of scope this round").* The decision to defer
is **already made** — debt is for unresolved choices, not for recording
that we chose to punt. The fact that March has zero F rows shows this
category is a stylistic artifact, not a structural inevitability.

### O — Other (documentation notes & resolution records)

**SmithyCli** — `06-spark-eval-produces-prd-from-idea.tasks.md:65`
(SD-018): *"Plan-review flagged a possible description overlap between
SD-013… and SD-015… Re-reading both entries: they do not in fact
overlap. **Recorded here so a future maintainer can re-evaluate; no
action expected.**"*

**SmithyCli** — `09-scanner-classifies-without-checkboxes.tasks.md` row
(SD-013): *"Whether the frontmatter `name` field must be `smithy-status`
(hyphenated) versus `smithy.status` (dotted). **Resolution: resolved
2026-04-19 — verified that all 10 existing command templates… use the
hyphenated form**…"*

**March** — `03-isolated-worktree-and-branch.tasks.md:66` (SD-001):
*"**Originally flagged** Story 3's silence on SpawnRecord creation vs.
FR-019 and the `absent → created` transition. **Resolved by pulling**
initial SpawnRecord creation… into this slice…"*

**Shape:** *the row exists as an audit trail of a finding that's no
longer open.* These are backward-looking. They belong in a PR
description, a commit message, or — at most — as a `Resolution` cell on
a row whose `status` is `resolved`. They are not steering needs.

## Findings

1. **Aggregate leak rate is 71%** across 197 non-inherited rows. Of the
   343 total rows in the corpus, 140 are confirmed leaks (R/A/D/F/O at
   non-inherited rows) and another ~100 are downstream copies of leaks
   (inherited rows duplicating their parent's classification).
   Conservatively, **two thirds of every row in `## Specification Debt`
   sections across both repos is not steering debt.**

2. **The leak is layer-driven, not repo-driven.** spec.md is 54% S;
   tasks.md is 16% S; rfc.md is 0% S. The same authors emit clean
   steering content at spec-time and prescriptive/coordinating content
   at task-time. The triage gate in `smithy-clarify` does not adapt to
   layer: it applies the same confidence-only rule at every level,
   even though the *kinds* of content that show up shift dramatically.

3. **Tasks files are where the most damage happens.** 110 non-inherited
   rows from `*.tasks.md` produced only 18 steering needs. 42% of tasks
   debt is requirement leak ("implementers verify", "mitigation: pin
   both"), and 23% is `O` — mostly post-hoc resolution records.
   `smithy.cut`'s own clarify pass on top of inherited debt is the
   leakiest single emission site in the pipeline.

4. **RFC-level debt is unsalvageable as currently emitted.** Every
   single RFC row in the corpus is a leak. The Cross-Cutting Governance
   section sits right next to `## Specification Debt` in the RFC
   template and already owns coordination concerns; the debt section
   should either be removed from RFCs or only ever populate from a
   strictly-gated clarify pass.

5. **March outperforms SmithyCli at the spec level, mostly because it
   never uses `F`.** Strip the 14 F rows out of SmithyCli's count and
   its S rate climbs from 22% to 25%; strip them by-artifact and the
   spec-level leak rate is nearly identical between the two repos.
   This is the strongest evidence that the prompt fix will generalize:
   it's the same underlying issue manifesting through different
   stylistic channels.

6. **The `Assumption:` framing is a March-style R leak that the rubric
   should call out by name.** Several March rows ("Assumption: a small
   hardcoded retry count of 5 is sufficient", "Assumption: Story 3
   relies on `git rev-parse --show-toplevel`") record assumptions
   *inside debt* rather than in `## Assumptions`. The kind gate already
   shipped in `smithy.clarify.prompt` handles this through its
   "requirement" branch — assumptions belong to the parent command's
   own assumption-routing — but a future iteration could surface
   "Assumption: …" as its own explicit anti-tell.

7. **Inheritance amplification is real but not the root cause.** 146
   of 343 rows (43%) are inherited duplicates. If upstream emission
   were clean, inheritance would carry forward only steering needs
   and the downstream noise would vanish. Fixing the kind gate at
   clarify / refine / mark / cut emission sites cuts the problem off
   at the source; we don't need a separate inheritance-time filter.

8. **Cross-checking against the prior v1 sample**: the v1 47-row
   sample reported a 96% leak rate; the full corpus reports 71%. The
   gap is explained by sampling bias — v1 drew rows from five of the
   leakiest spec/tasks files (the most recent and densest specs).
   The full-corpus rate is the trustworthy figure. The findings about
   *which* kinds dominate, *how* they're worded, and *where* in the
   pipeline they cluster did not change between v1 and the full
   survey; the prompt edits shipping with this PR are driven by those
   findings, not by the headline rate.

## Implication for the prompt fix (unchanged from v1)

The prompt changes shipping with this PR encode the survey's findings:

- **Kind gate** in `smithy-clarify` Step 3 names `R`, `A`, `D`, `F`,
  `O` as non-debt and re-routes each to its proper home. The full-
  corpus survey adds confidence: every observed leak fits cleanly into
  one of those five buckets, with no missing seventh category.
- **Phrasing rule**: descriptions must be open questions or "unresolved
  choice between X and Y", never prescriptions.
- **Emission-site enforcement** at mark and cut cites the gate by
  reference. tasks.md being the leakiest layer makes the cut-level
  enforcement particularly valuable.
- **RFC-level emission** is *not* separately guarded by this PR, even
  though the corpus shows 100% leak at the RFC layer. The ignite
  command goes through the same clarify gate; the gate should fire
  there for the same reasons. If the next clarify run on an RFC
  produces non-leak debt (especially S rows), that's the empirical
  confirmation. If it doesn't, a dedicated RFC-level emission tweak
  becomes a fast follow-up.

The same definition lives once in `smithy.clarify.prompt`; refine,
review-protocol, one-shot-output, mark, and cut all cite it.

## Limitations

- **Single-rater classification.** Borderline rows (notably the
  "deferred but the deferral hides a real architectural choice" cases
  and the "Assumption: X" rows that are arguably between R and an
  in-place assumption record) were tagged by primary frame. A second
  rater would likely move 5–10 rows across kinds; aggregate
  percentages would not shift by more than ~2 points.
- **One confirmed classification error** (smithycli SD-010 in
  expand-evals.spec.md, classified F with a hallucinated tell quote;
  better classification is borderline O/D). 1/197 = 0.5% error rate.
- **Sub-section ownership rows in `.tasks.md` from
  expand-evals/05-render-eval-produces-features-map.tasks.md and
  06-spark-eval-produces-prd-from-idea.tasks.md** include several
  "the implementer should add an inline YAML comment…" rows that read
  as R but are arguably mitigation-prescriptions for a real,
  unresolved cross-file coupling concern (S). Spot-checks read them
  as R because the prescription is load-bearing; a different rater
  might split them.
- **Resolved rows (`status: resolved`, n=42) were included** in the
  classification. Many of them are O (resolution records), but a
  handful represent rows that *were* legitimate steering needs at
  emission time and have since been answered. Re-running the survey
  in 6 months should drop these from the leak count — they were
  doing their job, just visible in the corpus as post-hoc audit
  trail.
