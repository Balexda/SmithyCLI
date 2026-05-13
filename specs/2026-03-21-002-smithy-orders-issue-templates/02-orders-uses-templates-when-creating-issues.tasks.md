# Tasks: Orders Uses Templates When Creating Issues

**Source**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.spec.md` — User Story 2
**Data Model**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.data-model.md`
**Contracts**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.contracts.md`
**Story Number**: 02

---

## Slice 1: Manifest-Aware Template Resolution and Spec-Type Rendering

**Goal**: Add a manifest-load + `<manifestDir>` resolution phase to `src/templates/agent-skills/commands/smithy.orders.prompt`, then convert the `.spec.md` mapping in Phase 5 from heredoc to template-driven rendering. After this slice merges, running `smithy.orders path/to/feature.spec.md` loads `<manifestDir>/smithy-manifest.json`, resolves `<manifestDir>` via the two-arg `resolveManifestDir(targetDir, location)`, reads `<manifestDir>/templates/orders/spec.md` when present, and globally interpolates the spec-type variable namespace. The other three artifact types keep their heredocs and continue working unchanged.

**Justification**: Anchors US2's infrastructure on the artifact type with the widest variable set (path placeholders, the `{{next_step}}` parenthetical, and the full inline-content cluster). Stands alone — the slice ships a working increment for one artifact type without depending on Slices 2 or 3, and leaves the other three heredocs in place so nothing regresses. Avoids a scaffolding-only PR because the resolution phase ships together with its first consumer.

**Addresses**: FR-005, FR-007, FR-008; AS 2.1, AS 2.5, AS 2.6 (spec branch).

### Tasks

- [x] **Add manifest discovery and manifest-dir resolution phase to orders prompt**

  Insert a new phase in `src/templates/agent-skills/commands/smithy.orders.prompt` that performs manifest discovery without circular reasoning: probe both candidate manifest paths — the repo-local `<targetDir>/.smithy/smithy-manifest.json` and the user-global `~/.smithy/smithy-manifest.json` — using the same two `resolveManifestDir(targetDir, location)` calls (one per `location` value) that `updateAction` and `uninitAction` use in `src/commands/update.ts` and `src/commands/uninit.ts`. Select the active manifest by precedence: **(a) neither exists** → halt with the "run `smithy init` first" error mandated by FR-005; **(b) only repo exists** → use repo; **(c) only user exists** → use user; **(d) both exist** → prefer the repo manifest (it is scoped to this repository and matches the deploy semantics a user got when they ran `smithy init --location repo` here). After selection, validate the self-consistency check used by `update.ts` — the selected manifest's stored `deployLocation` field must equal the `location` it was read from; if they diverge, halt with the same "fix the manifest or rerun `smithy init`" message that `update.ts` emits. The selected `(targetDir, location)` pair drives the final `<manifestDir>` value used by Phase 5 template lookups. Position the phase early enough that Phase 4 duplicate detection never runs against a missing-manifest state.

  _Acceptance criteria:_
  - Phase prose describes a non-circular discovery: probe both candidate paths first, then read `deployLocation` from the selected manifest — never the other way around.
  - Each `resolveManifestDir(targetDir, location)` call names both arguments explicitly and identifies their runtime sources (current working directory for `targetDir`; the hardcoded `'repo'`/`'user'` enum value for `location`, not a field read from a manifest the prompt has not yet loaded).
  - The four discovery outcomes (neither / repo-only / user-only / both) are each explicitly handled; the "both" case states the repo-precedence rule.
  - The selected manifest's stored `deployLocation` must match the location it was read from; mismatched manifests halt with a clear "fix the manifest or rerun `smithy init`" message matching the wording style in `src/commands/update.ts`.
  - Missing-manifest path (neither exists) emits a clear "run `smithy init` first" message and stops before Phase 4.
  - Phase prose forbids reading or modifying `smithy-manifest.json` as a template at either candidate path.
  - The composed `smithy.orders.md` template still satisfies the existing `smithy.orders command delegates GitHub ops to smithy.gh-issue scripts` structural assertion in `src/templates.test.ts`.

- [ ] **Replace `.spec.md` Phase 5 heredoc with template-driven rendering**

  In Phase 5 of `smithy.orders.prompt`, replace the `.spec.md` mapping's hardcoded heredoc body with prose that reads `<manifestDir>/templates/orders/spec.md` (when present) and globally substitutes every placeholder named in the data-model's spec row. When the template file is absent, fall through to the existing heredoc body so `orders` keeps producing an issue. Substitution must visit every occurrence of every known placeholder across the rendered body so the default template's `{{next_step}}` parenthetical does not leak literal `{{spec_folder}}` / `{{user_story_number}}` text after `{{next_step}}` itself is replaced.

  _Acceptance criteria:_
  - All spec-type variables from the data-model row are named in the interpolation context (covers AS 2.1's inline-content and AS 2.5's path placeholders).
  - `{{next_step}}` resolves to `smithy.cut <spec_folder> <user_story_number>` per the data-model next-step mapping (AS 2.6); nested `{{spec_folder}}` and `{{user_story_number}}` occurrences in the rendered body are also replaced (resolves the parenthetical-leak conflict).
  - Unknown `{{variable}}` names survive as literal text per the data-model validation rule.
  - When `<manifestDir>/templates/orders/spec.md` is absent the existing heredoc body is used.

- [ ] **Assert manifest-load and spec template lookup are present in composed orders prompt**

  Extend the existing `smithy.orders command delegates GitHub ops to smithy.gh-issue scripts` block in `src/templates.test.ts` with behavioral assertions that the composed `smithy.orders.md` references `resolveManifestDir`, names the `<manifestDir>/templates/orders/` path pattern, and references the `spec.md` template specifically. Match by content, not line number, so the assertion survives prompt reflows.

  _Acceptance criteria:_
  - Assertion fails if a future edit removes the manifest-load phase prose.
  - Assertion fails if the `.spec.md` mapping stops referencing `<manifestDir>/templates/orders/spec.md`.
  - No exact line numbers, error strings, or pasted prompt snippets are baked into the test body.
  - `npm test` passes.

**PR Outcome**: `smithy.orders` reads the manifest, resolves the deploy-location-aware `<manifestDir>`, and renders per-user-story issues from `<manifestDir>/templates/orders/spec.md` when present, with global variable substitution. RFC/features/tasks continue using their existing heredocs and remain regression-free.

---

## Slice 2: Template-Driven Rendering for RFC Child and Tasks Slice Issues

**Goal**: Convert the per-milestone RFC child issue body and the per-slice tasks issue body from heredoc to template-driven rendering using the manifest-load phase introduced in Slice 1. The RFC **parent tracking issue** body remains hardcoded — explicitly out of scope per AS 2.2 and the spec's `## Out of Scope` carve-out for the RFC parent tracking issue body.

**Justification**: Both artifact types share an identical render shape — single-pass interpolation against the parsed Phase 3 data with no extra parser work. Bundling them avoids fragmenting two near-identical Phase 5 changes into separate PRs and keeps the slice focused on body replacement. Depends only on S1 for the manifest-load infrastructure.

**Addresses**: FR-005, FR-007, FR-008; AS 2.2 (children only), AS 2.4, AS 2.6 (rfc + tasks branches).

### Tasks

- [ ] **Replace `.rfc.md` per-milestone child heredoc with template-driven body**

  In Phase 5 of `smithy.orders.prompt`, replace the per-milestone child body's heredoc with prose that reads `<manifestDir>/templates/orders/rfc.md` (when present) and globally substitutes every placeholder named in the data-model's rfc row. The RFC parent tracking issue (the one-per-RFC `[RFC] <rfc-title>` epic) keeps its existing hardcoded heredoc — that body is explicitly out of scope per AS 2.2. When the template file is absent, fall through to the existing per-milestone heredoc.

  _Acceptance criteria:_
  - Per-milestone child issues use the rfc template when present; the RFC parent tracking issue body is unchanged.
  - All rfc-type variables from the data-model row are named in the interpolation context.
  - `{{next_step}}` resolves to `smithy.render <rfc_path> <milestone_number>` per the data-model mapping (AS 2.6).
  - Global substitution — every occurrence of every known placeholder is replaced.
  - When `<manifestDir>/templates/orders/rfc.md` is absent the existing per-milestone heredoc is used.

- [ ] **Replace `.tasks.md` per-slice heredoc with template-driven body**

  In Phase 5 of `smithy.orders.prompt`, replace the per-slice child body's heredoc with prose that reads `<manifestDir>/templates/orders/tasks.md` (when present) and globally substitutes every placeholder named in the data-model's tasks row. When the template file is absent, fall through to the existing per-slice heredoc.

  _Acceptance criteria:_
  - Per-slice issues use the tasks template when present (AS 2.4).
  - All tasks-type variables from the data-model row are named in the interpolation context; multi-line markdown values (e.g. `{{slice_tasks}}`) preserve list structure.
  - `{{next_step}}` resolves to `smithy.forge` on this slice per the data-model mapping (AS 2.6).
  - Global substitution — every occurrence of every known placeholder is replaced.
  - When `<manifestDir>/templates/orders/tasks.md` is absent the existing per-slice heredoc is used.

- [ ] **Extend orders structural assertions to cover rfc and tasks template lookup**

  Extend the existing `smithy.orders` block in `src/templates.test.ts` with behavioral assertions that the composed prompt references `<manifestDir>/templates/orders/rfc.md` and `<manifestDir>/templates/orders/tasks.md`. Add an assertion that the RFC parent tracking issue body remains hardcoded (the prompt still contains the `[RFC] <rfc-title>` epic heredoc heading and references to `## RFC Tracking Issue`).

  _Acceptance criteria:_
  - Assertion fails if either rfc-child or tasks-slice template reference is removed.
  - Assertion fails if the RFC parent tracking issue's hardcoded body is removed.
  - No exact line numbers or pasted snippets in the test body.
  - `npm test` passes.

**PR Outcome**: Per-milestone RFC child issues and per-slice tasks issues both render from `<manifestDir>/templates/orders/<type>.md` when present, with global variable substitution and heredoc fallthrough. The RFC parent tracking issue body is intentionally unchanged.

---

## Slice 3: Features-Type Rendering with `{{features_path}}` Parser Extension

**Goal**: Convert the per-feature issue body from heredoc to template-driven rendering, and extend Phase 3's features parser so it locates the parent RFC and reads its `## Dependency Order` table `Artifact` column to populate `{{features_path}}` (per AS 2.3 and the data-model `{{features_path}}` row).

**Justification**: This is the only artifact type that requires Phase 3 parser work to satisfy its template's variable namespace. Isolating it keeps the rfc/tasks pair (S2) simpler and surfaces the parser change as a discrete reviewable diff. Depends only on S1's manifest-load infrastructure; could merge before or after S2.

**Addresses**: FR-005, FR-007, FR-008; AS 2.3, AS 2.6 (features branch).

### Tasks

- [ ] **Extend Phase 3 features parser to resolve `{{features_path}}` from the source RFC**

  In Phase 3 of `smithy.orders.prompt`, extend the `.features.md` parse instructions so the agent locates the source RFC referenced in the features file's header, then reads that RFC's `## Dependency Order` table, finds the milestone row whose ID matches this features file's milestone, and captures the `Artifact` column value as `{{features_path}}`. When the source RFC cannot be located, the milestone row is missing, or the `Artifact` cell is `—`, populate `{{features_path}}` with empty string per the data-model validation rule.

  _Acceptance criteria:_
  - Phase 3 prose describes locating the parent RFC by the features file's metadata, not by guessing a path.
  - Milestone lookup matches by milestone number (not title — names can collide across RFCs).
  - Empty `Artifact` cell (`—` or absent) yields empty-string substitution rather than the literal `{{features_path}}`.
  - The captured value is stored for Phase 5 interpolation context.

- [ ] **Replace `.features.md` per-feature heredoc with template-driven body**

  In Phase 5 of `smithy.orders.prompt`, replace the per-feature body's heredoc with prose that reads `<manifestDir>/templates/orders/features.md` (when present) and globally substitutes every placeholder named in the data-model's features row, using the `{{features_path}}` value captured by the Phase 3 parser extension. The parent milestone-linkage search logic earlier in the Phase 5 features section is preserved. When the template file is absent, fall through to the existing per-feature heredoc.

  _Acceptance criteria:_
  - Per-feature issues use the features template when present (AS 2.3).
  - All features-type variables from the data-model row are named in the interpolation context.
  - `{{features_path}}` is populated from the value captured by the Phase 3 parser extension.
  - `{{next_step}}` resolves to `smithy.mark` on this feature per the data-model mapping (AS 2.6).
  - Global substitution — every occurrence of every known placeholder is replaced.
  - When `<manifestDir>/templates/orders/features.md` is absent the existing per-feature heredoc is used.

- [ ] **Assert features template lookup and `{{features_path}}` parser are present**

  Extend the existing `smithy.orders` block in `src/templates.test.ts` with behavioral assertions that the composed prompt references `<manifestDir>/templates/orders/features.md`, names `{{features_path}}` as a populated placeholder, and references the source RFC's `## Dependency Order` table as the lookup site for the features path.

  _Acceptance criteria:_
  - Assertion fails if the features template reference is removed.
  - Assertion fails if the Phase 3 features parser stops referencing the source RFC's `## Dependency Order` table.
  - No exact line numbers or pasted snippets in the test body.
  - `npm test` passes.

**PR Outcome**: All four orders-eligible artifact types render their child issue bodies from `<manifestDir>/templates/orders/<type>.md` when present. The RFC parent tracking issue body remains hardcoded. `{{features_path}}` for features-type issues is populated from the source RFC's Dependency Order table when available. US2's full acceptance set (AS 2.1–2.6) is satisfied.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | The reconciled plan places the manifest-load + `<manifestDir>` resolution phase at the boundary between Phase 2 and Phase 3, but Phase 1 (Validate Environment) already invokes `check-env.sh` and is the natural fail-fast site for a "run `smithy init` first" error. Locating manifest-load in Phase 1 unifies error timing and prevents Phase 4 duplicate detection from running against a missing-manifest state. The implement agent must decide whether manifest-load lands in Phase 1 (alongside `check-env.sh`) or in a new phase between Phase 2 and Phase 3. | Slice Boundaries / Implementation Order | Medium | Medium | open | — |
| SD-002 | Spec AS 2.3 requires `{{features_path}}` to be read from the parent RFC's `## Dependency Order` table `Artifact` column, but the current Phase 3 features parser only parses the features file passed as `$ARGUMENTS`. The discovery rule for the parent RFC (which header field carries the RFC reference, behavior when the field is absent, behavior when the features file matches multiple milestone rows in the RFC) is not pinned down in the spec. The implement agent must choose a discovery heuristic; selection affects `{{features_path}}` accuracy on edge cases. | Technical Risk / Testing Strategy | Medium | Medium | open | — |
| SD-003 | No Tier-3 runtime test asserts that an `orders` run against a real artifact produces an issue body matching the active template after interpolation. The structural assertions in `src/templates.test.ts` only check composed-prompt text, not rendered output. A Tier-2-only landing is acceptable for US2's scope, but a follow-up evals scenario for orders template rendering should be on someone's radar. | Testing Strategy | Medium | Medium | open | — |
| SD-004 | The "global substitution" approach for the parenthetical-variable-leak conflict does not specify whether the agent should rewrite Phase 5 parentheticals in-line (preserving `(equivalent to …)` aside style) or remove them entirely once the surrounding heredoc becomes a template reference. The two outcomes produce structurally different prompts and different downstream readability. | Scope Edges | Low | Medium | open | — |
| SD-005 | Unresolved render-mechanism conflict from Phase 2.8: agent-instruction prose (the chosen direction for this task plan) vs a new `render-template.sh` script in the `smithy.gh-issue` skill. Recommendation is agent-prose because rendering is a localized substitution operation with no current second consumer; if Tier-3 evals later surface inconsistent agent substitution behavior, the planning agent should re-open this decision and extract a script. | Technical Risk | Medium | Medium | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Manifest-Aware Template Resolution and Spec-Type Rendering | — | — |
| S2 | Template-Driven Rendering for RFC Child and Tasks Slice Issues | S1 | — |
| S3 | Features-Type Rendering with `{{features_path}}` Parser Extension | S1 | — |

S2 and S3 are siblings under S1; neither reads the other's output. Implementation can proceed in either order after S1 lands. The canonical sequence ships S2 first because rfc/tasks rendering exercises the simpler single-pass substitution pattern before S3 introduces Phase 3 parser work.

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Provision orders templates during init | depends on | US1 provisions `<manifestDir>/templates/orders/{rfc,features,spec,tasks}.md` and creates `src/orders-templates.ts` for the default content. US2 reads those files at runtime but does **not** import `src/orders-templates.ts` from the prompt — that's a TypeScript module unreachable at prompt runtime. End-to-end behavior of US2 requires `smithy init` to have provisioned the templates. |
| User Story 3: Deployment location is honored end-to-end | depended upon by | US3 asserts that both provisioning and resolution honor `deployLocation`. S1's two-arg `resolveManifestDir(targetDir, location)` call with the manifest's persisted `deployLocation` is the resolution hook US3 verifies; no additional US2 work is required. |
| User Story 4: Orders falls back to built-in defaults | depended upon by | US4 implements the formal built-in-default fallback. Every slice in US2 leaves the existing heredoc in place as a fallthrough branch so US4 can replace heredocs with `src/orders-templates.ts` defaults without restructuring Phase 5. |
