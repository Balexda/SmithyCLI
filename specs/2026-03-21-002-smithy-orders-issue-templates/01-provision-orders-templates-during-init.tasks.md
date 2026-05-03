# Tasks: Provision Orders Templates During Init

**Source**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.spec.md` — User Story 1
**Data Model**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.data-model.md`
**Contracts**: `specs/2026-03-21-002-smithy-orders-issue-templates/smithy-orders-issue-templates.contracts.md`
**Story Number**: 01

---

## Slice 1: Retire Legacy Issue-Templates Flow

**Goal**: Remove every code path, flag, manifest field, prompt, and asset tied to the pre-rework YAML issue-forms feature so the codebase is ready for unconditional orders-template provisioning. After this slice merges, `smithy init` no longer asks about issue templates and no longer ships `src/templates/issues/`; `update` and `uninit` continue to work because their references are removed in lockstep.

**Justification**: Stands alone as a clean retirement PR — the codebase compiles, the test suite is green, and the user-visible delta is "the `--issue-templates` prompt and flag are gone." This must precede Slice 2 because Slice 2 reuses the same step in `initAction` that the legacy flow occupies, and because retaining `SmithyManifest.issueTemplates` while introducing the new flow would mislead future readers about a feature that no longer exists.

**Addresses**: FR-011; supports preconditions for FR-001 / FR-002 / FR-003 / FR-004 (US1 AS 1–5).

### Tasks

- [ ] **Delete legacy YAML templates and path helpers**

  Remove the `src/templates/issues/` directory along with the `issueTemplatesSrcDir` constant and `resolveIssueTemplatePath` helper in `src/utils.ts` that target it. Both helpers are reachable only from the legacy flow and must vanish together so no dead exports remain. Per FR-011 in the spec.

  _Acceptance criteria:_
  - `src/templates/issues/` no longer exists in the tree.
  - The legacy path constant and resolver are no longer exported from `src/utils.ts`.
  - `npm run typecheck` succeeds once the call sites in subsequent tasks are also gone (the type errors should pinpoint exactly which files still need editing).

- [ ] **Remove the issue-templates prompt, CLI flags, and `InitOptions` field**

  Strip `promptIssueTemplates` from `src/interactive.ts`, the `issueTemplates` field from `InitOptions`, the matching `--issue-templates` / `--no-issue-templates` flags from `src/cli.ts`, and the prompt/flag handling block plus `copyDirSync`-into-`<manifestDir>` branch in `src/commands/init.ts`. Per FR-011.

  _Acceptance criteria:_
  - `promptIssueTemplates` has no remaining export or callers.
  - `smithy init --help` does not mention `--issue-templates` / `--no-issue-templates`.
  - `initAction` no longer reads, prompts for, or branches on an issue-templates choice.
  - The legacy `Installing Smithy issue templates in …` log line is gone.

- [ ] **Drop `issueTemplates` from the manifest contract and update redeploy**

  Remove the `issueTemplates: boolean` field from `SmithyManifest` and `WriteManifestOptions` in `src/manifest.ts`, the corresponding write in `initAction`'s manifest-write step, and the read-back used by `redeployFromManifest` in `src/commands/update.ts`. These three edits must land in the same commit because removing the manifest field breaks both call sites simultaneously and there is no useful intermediate state.

  _Acceptance criteria:_
  - `SmithyManifest` and `WriteManifestOptions` no longer expose an `issueTemplates` member.
  - Manifests written by `initAction` no longer include the field.
  - `update`'s redeploy path does not pass it through.
  - Old manifests on disk that still carry the field continue to load (the existing reader ignores extra JSON properties).

- [ ] **Remove the legacy issue-template cleanup block from `uninit`**

  Delete the uninit step that scans `issueTemplatesSrcDir`, computes a destination via `resolveIssueTemplatePath`, and removes legacy YAML/MD files from both `<manifestDir>` and `.github/ISSUE_TEMPLATE/`. Without this edit `uninit.ts` will fail to compile after the previous tasks land. Manifest-driven removal continues to handle anything tracked under `files['…']`.

  _Acceptance criteria:_
  - `uninit.ts` no longer imports `issueTemplatesSrcDir` or `resolveIssueTemplatePath`.
  - The legacy `.github/ISSUE_TEMPLATE/` cleanup loop is removed (see SD-003 for the behavior-change note flagged for the PR description).
  - `smithy uninit` against a manifest-tracked install still removes every manifest-listed artifact.

- [ ] **Refresh CLI tests for the retired flag and manifest field**

  Update `src/cli.test.ts` so the existing assertions that exercise `--issue-templates` / `--no-issue-templates` and the `issueTemplates` manifest field are replaced with assertions that the flag is absent from `--help` and the field is absent from a freshly written manifest. Test descriptions follow the new behavior; no new test file is added.

  _Acceptance criteria:_
  - No remaining test references the legacy flag or manifest field as a positive assertion.
  - `npm test` passes.
  - Tests describe behavior in user-visible terms (no references to specific prompt internals).

**PR Outcome**: A single PR removes the YAML issue-forms feature surface (templates, helper, prompt, flags, manifest field, uninit cleanup, test coverage) without yet introducing the new orders provisioning. The CLI surface shrinks; everything else still builds and passes.

---

## Slice 2: Provision Orders Body Templates Unconditionally

**Goal**: After `smithy init`'s permission, session-title, and language-toolchain steps complete, write `<manifestDir>/templates/orders/{rfc,features,spec,tasks}.md` with the spec's default bodies, creating intermediate directories as needed and gating only existing files behind a single overwrite prompt. Provisioning must never read or alter `<manifestDir>/smithy-manifest.json` or any sibling outside `templates/orders/`.

**Justification**: Stands alone as a coherent feature PR — once Slice 1 has cleared the legacy surface, this slice introduces the new behavior end-to-end. It delivers US1's user-visible promise: every `smithy init` ends with the four orders templates on disk in the active deploy location.

**Addresses**: FR-001, FR-002, FR-003, FR-004; US1 AS 1, AS 2, AS 3, AS 4, AS 5.

### Tasks

- [ ] **Add `src/orders-templates.ts` with default bodies and a provisioner**

  Create one flat module under `src/` (matching the repo's existing `permissions.ts` / `language-detect.ts` / `manifest.ts` convention) that exports the four default body strings keyed by artifact type (`rfc`, `features`, `spec`, `tasks`) with content matching the spec's Default Template Content section verbatim, plus a `provisionOrdersTemplates` function that ensures `<manifestDir>/templates/orders/` exists and writes any missing defaults. Centralizing both in one module lets US4's built-in fallback import the same defaults later without a follow-up extraction. Resolve `<manifestDir>` through the existing manifest-directory helper in `src/manifest.ts` so deploy-location semantics match the rest of init.

  _Acceptance criteria:_
  - Default bodies match `smithy-orders-issue-templates.spec.md` "Default Template Content" verbatim for all four types.
  - `templates/` and `templates/orders/` are created when absent (intermediate directory creation).
  - Function reports which template paths it wrote and which it preserved (matches the contract's `templates_written` / `templates_preserved` outputs).
  - The function never opens, reads, writes, truncates, or stats `<manifestDir>/smithy-manifest.json` or any non-`<type>.md` sibling under `<manifestDir>` (satisfies AS 3 and AS 5).
  - File presence (not content) is the override signal — empty existing files count as "exists" for overwrite gating, per the spec's Edge Cases section ("A template file exists but is empty" bullet).

- [ ] **Add an overwrite prompt for existing orders templates**

  Add a new prompt to `src/interactive.ts` that asks once whether to overwrite existing orders templates at `<manifestDir>/templates/orders/`, defaulting to `no`, with phrasing aligned to the Init Template Provisioning Contract's step 4 message. The prompt is invoked only when at least one of the four canonical files already exists; missing templates are always written without asking.

  _Acceptance criteria:_
  - Prompt defaults to `no`.
  - In `--yes` / non-interactive mode the implementation skips the prompt and behaves as if the user declined (preserves user content under automation, consistent with FR-003's default).
  - The prompt fires at most once per init invocation regardless of how many of the four files pre-exist.
  - Behavior matches AS 4 (decline → existing preserved, missing still written) and AS 5 (accept → only the four canonical files replaced).

- [ ] **Wire orders-template provisioning into `initAction`**

  After permission setup, language-toolchain selection, and the session-title decision (where the legacy `deployIssueTemplates` block previously sat), call into the new module to detect pre-existing files, prompt only when needed, and write defaults. Provisioning must run before the manifest-write step and must not alter the manifest file. Surface a brief console message reporting how many templates were written and how many were preserved, matching the existing init step's UX style (see SD-002 for the rationale).

  _Acceptance criteria:_
  - Init produces all four files in a fresh repo for both `--location repo` and `--location user` (AS 1, AS 2).
  - The manifest-write step still writes `<manifestDir>/smithy-manifest.json` and is not modified by provisioning (AS 3).
  - With pre-existing files and overwrite declined, all four canonical files are preserved while any missing ones are still created (AS 4).
  - With overwrite accepted, only the four canonical `<type>.md` files are replaced; non-canonical extras under `templates/orders/` and any peer `templates/<family>/` subtrees are untouched (AS 5).
  - A console line reports the written/preserved counts on each init run.

- [ ] **Add CLI integration tests for unconditional provisioning**

  Extend `src/cli.test.ts` with cases that run `init` against a fresh temp directory and assert the four files exist with default content, that the manifest is byte-identical before and after re-running provisioning under "decline overwrite", and that overwrite preserves non-canonical neighbors. The `--location user` case must isolate the user's real `~/.smithy/` from the test — the isolation mechanism is left to implementation; see SD-001 for the open portability question.

  _Acceptance criteria:_
  - Coverage spans US1 AS 1, AS 2, AS 3, AS 4, and AS 5.
  - The `--location user` test never reads from or writes to the developer's real `~/.smithy/`.
  - Assertions describe observable filesystem state, not internal prompt mechanics.
  - `npm test` passes on Linux; cross-platform behavior (Windows `USERPROFILE`) is documented in the test or marked as out of scope.

- [ ] **Refresh `CLAUDE.md` to reflect the new template family**

  Update the project preamble in `CLAUDE.md` so the line referencing `src/templates/issues/` and the prose describing smithy as installing "issue templates" describe the new `<manifestDir>/templates/orders/` provisioning instead. This belongs in Slice 2 because the doc accurately describes the codebase only once both removal (Slice 1) and addition (Slice 2 prior tasks) have landed.

  _Acceptance criteria:_
  - No remaining mention of `src/templates/issues/` in `CLAUDE.md`.
  - The "What Smithy Does" section names orders body templates rather than YAML issue forms.
  - No spec line numbers or implementation details are baked into the prose.

**PR Outcome**: A single PR ships US1's user-visible behavior: every `smithy init` provisions the four orders body templates at the active deploy location, with a single overwrite prompt for pre-existing files and no opt-in step. CLI tests cover the five acceptance scenarios; the manifest is provably untouched by provisioning; project docs reflect the new template family.

---

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|-----------|--------|------------|
| SD-001 | Slice 2 Task 4 calls for stubbing `HOME` in the `--location user` integration test, but the existing `src/cli.test.ts` infrastructure uses `execFileSync` / `spawnSync` with only `cwd` and `encoding` overrides — there is no precedent for overriding environment variables. The implement agent must choose a mechanism (passing `env: { ...process.env, HOME: tmpHome }`, deciding whether to also override `USERPROFILE` for Windows parity, and whether to skip the test on platforms where `os.homedir()` ignores `HOME`). Choice affects test reliability and CI portability. | Testing Strategy / Technical Risk | High | Medium | open | — |
| SD-002 | The Init Template Provisioning Contract returns `templates_written` and `templates_preserved`, but neither the spec nor FRs mandate a specific user-visible console message in `initAction`. Existing init steps emit messages like `Installing Smithy issue templates in …` and `Cleaned up N stale artifacts`, so silence would be a UX consistency regression. Slice 2 Task 3 commits to surfacing a counts message but the exact wording is left to the implement agent. | Scope Edges | Medium | Medium | open | — |
| SD-003 | Slice 1 Task 4 removes the uninit cleanup block that also handled `.github/ISSUE_TEMPLATE/`. This is a behavior change for users who ran an old smithy version that deployed YAML forms there: the next `smithy uninit` will no longer remove those files. The spec's Out of Scope bullet on legacy `src/templates/issues/` YAML form cleanup covers `<manifestDir>` deployments but does not explicitly bless dropping the `.github/ISSUE_TEMPLATE/` cleanup path. Likely intentional (the source dir is gone, so the loop becomes a no-op anyway), but worth confirming on the PR. | Scope Edges | Medium | Medium | open | — |
| SD-004 | The new overwrite prompt's exact message wording, whether it interpolates an absolute `<manifestDir>` path or a repo-relative one, and whether it accepts a list of conflicting paths or just a count, are not specified beyond the example prompt string in the Init Template Provisioning Contract's Flow step 4. Inquirer's `confirm` with `default: false` is well-understood, but message-formatting choices remain open. | Technical Risk | Low | Medium | open | — |

---

## Dependency Order

Recommended implementation sequence:

| ID | Title                                              | Depends On | Artifact |
|----|----------------------------------------------------|------------|----------|
| S1 | Retire Legacy Issue-Templates Flow                 | —          | —        |
| S2 | Provision Orders Body Templates Unconditionally    | S1         | —        |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Orders uses templates when creating issues | depended upon by | US2 reads the templates this story provisions; US2's resolution work assumes the canonical four `<type>.md` files exist when init has run. |
| User Story 3: Deployment location is honored end-to-end | depended upon by | US3 asserts that both provisioning (this story) and `orders` resolution honor the active `deployLocation`; this story owns the provisioning side. |
| User Story 4: Orders falls back to built-in defaults | depended upon by | US4 will reuse the same default body strings introduced by Slice 2 (`src/orders-templates.ts`) as its built-in fallback content. |
