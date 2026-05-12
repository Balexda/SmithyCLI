# Tasks: Deployment Location Is Honored End-to-End

**Source**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.spec.md` — User Story 3
**Data Model**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.data-model.md`
**Contracts**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.contracts.md`
**Story Number**: 03

---

## Slice 1: Cross-Location Isolation Tests for `smithy init` Provisioning

**Goal**: Prove that `smithy init --location repo` and `smithy init --location user` each confine orders-template provisioning to their respective `<manifestDir>` and never pollute the other location. Adds the inverse-direction non-pollution checks that US1 Slice 2's positive provisioning tests do not commit to.

**Justification**: Stands alone as a focused test-only PR adding two assertions to an existing test file. US1 Slice 2 Task 4 covers "the chosen location is populated"; this slice covers the unchosen location stays clean — the regression surface US3 owns. No production code; no dependency on Slice 2.

**Addresses**: FR-002; AS 3.1, AS 3.2.

### Tasks

- [ ] **Add cross-location isolation tests for repo and user init**

  Extend `src/cli.test.ts` with HOME-isolated test cases that exercise both `--location repo` and `--location user` provisioning, asserting the chosen `<manifestDir>` is populated AND the other manifest dir remains absent. Reuse whatever HOME-override mechanism US1 Slice 2 Task 4 establishes (see SD-001); if HOME override proves unreliable on the host, skip with an explicit message rather than producing a false positive. Satisfies AS 3.1 and AS 3.2.

  _Acceptance criteria:_
  - `--location repo` case: `<targetDir>/.smithy/templates/orders/{rfc,features,spec,tasks}.md` are present, and the isolated `<HOME>/.smithy/templates/orders/` is absent.
  - `--location user` case: `<HOME>/.smithy/templates/orders/{rfc,features,spec,tasks}.md` are present, and `<targetDir>/.smithy/templates/orders/` is absent.
  - The developer's real `~/.smithy/` is never read or written by either test.
  - Both temp directories are cleaned up after each test.
  - Assertions describe observable filesystem state, not internal prompt mechanics.
  - `npm test` passes.

**PR Outcome**: `src/cli.test.ts` gains two cross-location isolation assertions that fail if either init direction begins polluting the opposite manifest dir. The inverse-direction invariant from AS 3.1 / AS 3.2 is locked in against regression.

---

## Slice 2: Structural Assertions for Deploy-Location Awareness in Orders Prompt

**Goal**: Prove the composed `smithy.orders.md` prompt routes manifest resolution through `resolveManifestDir(targetDir, deployLocation)` for both deploy-location values rather than hardcoding one, and that the missing-manifest path surfaces a clear "run `smithy init` first" error. Tier-2 structural guards on top of US2 Slice 1's manifest-load phase.

**Justification**: Stands alone as a focused test-only PR adding assertions to the existing `smithy.orders` block in `src/templates.test.ts`. US2 Slice 1 Task 3 commits to asserting `resolveManifestDir` is referenced and `spec.md` is named; this slice asserts the routing is two-sided (both `'repo'` and `'user'` paths) and the missing-manifest error path is present — neither is covered by US2's existing task. No production code; no dependency on Slice 1.

**Addresses**: FR-005; AS 3.3, AS 3.4, AS 3.5.

### Tasks

- [ ] **Assert orders prompt routes by `deployLocation` and surfaces missing-manifest error**

  Extend the existing `smithy.orders command delegates GitHub ops to smithy.gh-issue scripts` block in `src/templates.test.ts` with structural assertions on the composed `smithy.orders.md` content: (a) the prompt names the manifest's persisted `deployLocation` field as the source of `<manifestDir>` resolution (catches a regression to a hardcoded location); (b) the prompt distinguishes both `'repo'` and `'user'` resolution paths so neither is silently dropped; (c) the prompt references `smithy init` in the missing-manifest error path. Match by content substrings, not line numbers, consistent with the convention US2 Slice 1 Task 3 establishes. Satisfies the structural side of AS 3.3, AS 3.4, and AS 3.5.

  _Acceptance criteria:_
  - Assertion fails if a future edit drops the `'user'` resolution path from the manifest-load phase.
  - Assertion fails if a future edit drops the `'repo'` resolution path from the manifest-load phase.
  - Assertion fails if the prompt stops naming `deployLocation` as the field driving resolution (catches regression to hardcoded `'repo'`).
  - Assertion fails if the missing-manifest error path no longer references `smithy init`.
  - No exact line numbers, copied prompt text, or hardcoded error sentences are baked into the test body.
  - `npm test` passes.

**PR Outcome**: The `smithy.orders` block in `src/templates.test.ts` gains structural guards that make any regression in deploy-location routing or the missing-manifest error path a CI-visible failure. AS 3.3, AS 3.4, and AS 3.5 are protected at Tier 2.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | The HOME-override mechanism for the `--location user` isolation test is inherited from US1 SD-001 (still open). The Slice 1 task pins down `env: { ...process.env, HOME: tmpHome }` with a "skip if unreliable" fallback, but Windows `USERPROFILE` parity, whether `os.homedir()` honors `HOME` on the CI runner, and whether the skip should be hard-fail or warn are not specified. If US1 lands a different mechanism, this slice's task must adopt it rather than re-deciding. | Testing Strategy / Technical Risk | High | Medium | open | — |
| SD-002 | Slice 2's structural assertions hinge on what the manifest-load phase prose actually contains, which depends on US2 SD-001's unresolved phase-position decision (Phase 1 vs new Phase 2.5). Different positions produce different surrounding text; the assertion "prompt distinguishes `~/.smithy/` and `.smithy/` paths" assumes a specific shape the US2 implementation may not emit verbatim. Implement agent must verify the composed prompt actually contains both literal location strings, or relax the assertions to check for `resolveManifestDir` calls with both location-typed arguments instead. | Testing Strategy / Slice Boundaries | High | Medium | open | — |
| SD-003 | The Slice 2 assertion "`<manifestDir>/templates/orders/` path pattern appears for both branches" is content-shape-dependent. The US2 S1 prompt may emit one templated path string that is deploy-location agnostic (since `<manifestDir>` is the same variable name regardless of location) rather than two separate path strings per branch. If the prompt uses a single resolved path placeholder, the "both branches" assertion is unsatisfiable as written and must be reframed (e.g., assert the prompt references both `'repo'` and `'user'` as inputs to `resolveManifestDir`, not that two literal path strings appear). | Scope Edges | Medium | Medium | open | — |
| SD-004 | The Slice 2 assertion that "smithy init" reference appears for the missing-manifest error path is ambiguous: does it require the literal string `smithy init` to appear in the error-message prose, or does it accept a structural reference (e.g., the `update.ts`-style "fix the manifest or rerun `smithy init`" message)? US2 Slice 1 Task 1's acceptance criterion uses the latter wording style, so a substring match for `smithy init` will pass — but a stricter "user-facing error message contains 'run smithy init first'" check would not. Implement agent should pick the looser substring match unless told otherwise. | Testing Strategy | Low | Medium | open | — |
| SD-005 | The two-slice split is one of several plausible decompositions. Alternatives: (a) single combined PR (both test additions are tests-only and small enough to bundle); (b) three slices splitting Slice 2 into "resolution path assertions" and "missing-manifest error assertion"; (c) folding US3 entirely into US1/US2 PRs as additional acceptance scenarios. The chosen split keeps each PR mergeable as soon as its respective cross-story prereq lands and avoids artificial fragmentation, but if both upstream stories merge close together a parent agent may consolidate. | Slice Boundaries | Medium | Medium | open | — |
| SD-006 | A shared `createIsolatedUserHome(tmpDir)` test helper extracted into `src/test-helpers.ts` would honor the Structural Integrity directive's preference for well-placed shared utilities and would benefit US4 if US4 needs the same HOME-isolation pattern. Deferred until a second consumer materializes; inline the override in `src/cli.test.ts` for now. | Scope Edges | Low | Medium | open | — |
| SD-007 | A Tier-3 evals scenario for runtime deploy-location resolution (`smithy.orders` actually reads from the correct `<manifestDir>` at agent runtime) was unanimously deferred per US2 SD-003. Tier-2 structural assertions (Slice 2) plus Tier-1 isolation tests (Slice 1) cover the regression surface, but a future evals scenario would catch agent-runtime drift the structural assertions cannot see. | Testing Strategy | Medium | Medium | open | — |
| SD-008 | Slice 2 Task 1's acceptance criteria assert separate `'user'` and `'repo'` resolution paths in the composed prompt, but the assumption that US2 Slice 1 emits two distinct location-typed paths may not hold (see SD-002 / SD-003). If US2's manifest-load prose uses a single deploy-location-agnostic `<manifestDir>` placeholder rather than two literal location strings, the implementer must reframe the assertion to match SD-003's fallback wording: assert that both `'repo'` and `'user'` appear as arguments to `resolveManifestDir` calls, not that two literal path strings appear. The acceptance criteria as written are conditional on a prompt shape the upstream story has not yet committed to. | plan-review:Assumption-output drift | Important | Low | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Cross-Location Isolation Tests for `smithy init` Provisioning | — | — |
| S2 | Structural Assertions for Deploy-Location Awareness in Orders Prompt | — | — |

Both slices are intra-US3 independent — neither depends on the other. They can ship in either order once their respective cross-story prerequisites land.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Provision orders templates during init | depends on | Slice 1 cannot pass CI until US1 (specifically US1 Slice 2) has merged — the provisioning behavior the isolation tests assert about must exist. Slice 1 also adopts whatever HOME-override mechanism US1 Slice 2 Task 4 establishes (see SD-001). |
| User Story 2: Orders uses templates when creating issues | depends on | Slice 2 cannot pass CI until US2 Slice 1 has merged — the manifest-load phase and `resolveManifestDir` references the structural assertions match against must exist in the composed `smithy.orders.md` prompt. |
| User Story 4: Orders falls back to built-in defaults | depended upon by | US4 will likely reuse the HOME-isolation pattern Slice 1 introduces; if a second consumer materializes there, the deferred helper extraction in SD-006 should be reconsidered as part of US4. |
