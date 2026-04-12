# Tasks: Reference Fixture Exists and Is Deployable

**Source**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md` — User Story 2
**Data Model**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md`
**Contracts**: `specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md`
**Story Number**: 02

---

## Slice 1: Reference Fixture Source Files

**Goal**: Create a minimal TypeScript Express-style API project in `evals/fixture/` that gives eval agents a concrete, stable codebase to plan against — with specific file paths, route patterns, and data types that plans can reference rather than producing generic advice.

**Justification**: Every eval case requires a real project directory as its CWD for `claude -p` invocations. The fixture must exist before the deployment verification test (Slice 2) or the eval runner (US3) can be built. Skills are NOT committed into the fixture — they are deployed into a temp copy at eval time, so the fixture stays clean and always uses the latest templates.

**Addresses**: FR-002 (fixture directory to copy); Acceptance Scenario 2.1 (fixture must exist for `smithy init` to run against)

### Tasks

- [x] **Create `evals/fixture/.gitignore`** — list `node_modules/`, `.claude/`, `.smithy/`, `dist/` as ignored entries. Create this first so subsequent git operations do not accidentally stage generated artifacts.

- [x] **Create `evals/fixture/package.json`** — minimal Node project manifest: `private: true`, `name: smithy-eval-fixture`, `description` identifying it as an eval fixture, `build` and `start` scripts, `express` as a dependency, TypeScript and `@types` as dev dependencies. Do NOT run `npm install` — the fixture is read by AI agents, not executed.

- [x] **Create `evals/fixture/tsconfig.json`** — minimal standalone TypeScript config using `commonjs` module resolution (this is an independent Express project, not part of the Smithy ESM build), targeting ES2022, with `strict` enabled, `src/` as the root, `dist/` as the output.

- [x] **Create `evals/fixture/README.md`** — brief description for AI agents to read when planning. Cover: what the project is (eval fixture, not a real app), what the files do, the intentional health-check gap, and how to manually deploy Smithy skills against a copy for local testing. Include a note that additions should only be made when a specific eval scenario requires them.

- [x] **Create `evals/fixture/src/types.ts`** — `User` and `CreateUserRequest` TypeScript interfaces exported for use by route handlers.

- [x] **Create `evals/fixture/src/routes/users.ts`** — Express Router with three user CRUD handlers using an in-memory array: `GET /` (list), `GET /:id` (get by id, 404 if not found), `POST /` (create). Imports types from `../types`.

- [x] **Create `evals/fixture/src/index.ts`** — Express app entry point that mounts the users router at `/api/users` and starts the server on a configurable `PORT`. Intentionally has **no health check endpoint** — that gap is the primary eval prompt target.

- [x] **Verify fixture structure** — confirm the directory contains exactly the source and config files listed above with no generated artifacts (no `.claude/`, `.smithy/`, `node_modules/`, or `dist/`).

**PR Outcome**: A committed Express TypeScript project in `evals/fixture/` providing a stable, controlled evaluation target. Eval agents can reference `src/routes/users.ts`, `src/types.ts`, and `src/index.ts` by path when producing plans. The intentionally absent health check endpoint drives the primary strike/plan eval prompt.

---

## Slice 2: Fixture Deployment Verification Test

**Goal**: Prove that `smithy init -a claude -y` successfully deploys skills into the fixture, and that the source fixture directory is not modified by deployment — establishing the deployability guarantee that Acceptance Scenario 2.1 requires and the SHA-256 checksum pattern that the eval runner (US3) will formalize for FR-011.

**Justification**: Acceptance Scenario 2.1 ("when `smithy init` runs against it, then skills are deployed") must be verified by an automated test that runs on every `npm test` invocation. Without this test, fixture deployability is a manual assumption that silently breaks when templates change.

**Note on FR-010**: FR-010 requires evals to be decoupled from `npm test`. This test is **not an eval case** — it makes no `claude -p` invocations and has no API key dependency. It is a unit test validating CLI deployment behavior, the same tier as `src/cli.test.ts`. FR-010 governs the eval runner (`run-evals.ts`); it does not prohibit fixture unit tests from running in `npm test`.

**Note on Acceptance Scenario 2.2**: The acceptance criterion "when a plan eval runs against it, then the plan references specific files and structures from the fixture" cannot be verified within US2 scope — it requires the eval runner (US3), structural validator (US4), and YAML scenario definitions (US7). This scenario is deferred and will be validated as part of US5 integration verification.

**Addresses**: FR-002 (copy-to-temp pattern), FR-011 (source fixture not modified); Acceptance Scenario 2.1

### Tasks

- [x] **Read `src/cli.test.ts` lines 36–73** before writing any code. The fixture test must follow the same established patterns: `path.resolve('dist/cli.js')` for the CLI path, `fs.mkdtempSync` + `fs.rmSync({ recursive, force })` + `afterEach` cleanup, and `{ cwd: tmpDir }` on `execFileSync` (not the `-d` flag). Consistency with the existing test style matters.

- [x] **Create `evals/fixture.test.ts`** with a `describe('evals/fixture deployment')` block containing two test cases:
  1. **Deployment test** — copies the fixture to a temp dir, runs `smithy init -a claude -y` with `cwd: tmpDir`, then asserts that `.claude/commands/`, `.claude/prompts/`, and `.claude/agents/` exist in the temp dir, each containing at least one `.md` file. Also asserts that `smithy.strike.md` is in commands and `smithy.plan.md` is in agents (the key skills for strike evals).
  2. **Immutability test (FR-011)** — computes a SHA-256 hash of the source `evals/fixture/` directory before running `smithy init` against a temp copy, then re-hashes after, and asserts the two hashes are equal. The hash function must sort files by relative path for determinism, read files as binary (no encoding) for cross-platform consistency, and exclude `node_modules/`, `.claude/`, `.smithy/`, and `dist/` directories.

  The `hashDirectory` helper is inline in this file for now. It will be extracted to `evals/lib/fixture.ts` in US3 when the eval runner needs it for FR-011 at runtime. Do not create `evals/lib/` prematurely.

  Use `fs.cpSync(src, dest, { recursive: true })` (Node ≥16.7) to copy the fixture to temp. `path.resolve('evals/fixture')` resolves correctly from the repo root where vitest runs.

- [x] **Run `npm test`** and confirm both new test cases pass alongside all existing tests. The `pretest` hook builds `dist/cli.js` automatically. Expected outcome: 2 new passing tests in `evals/fixture.test.ts`, no regressions.

- [x] **If vitest does not discover `evals/fixture.test.ts`**: the default vitest glob `**/*.test.ts` should pick it up automatically since `evals/` is under the project root. If it is missing from the test run, add a `vitest.config.ts` at the repo root with an `include` array covering both `src/**/*.test.ts` and `evals/**/*.test.ts`, then re-run `npm test`.

**PR Outcome**: An automated deployment verification test that proves Acceptance Scenario 2.1 on every `npm test` run. The inline `hashDirectory` helper establishes the SHA-256 checksum approach that US3 will extract into `evals/lib/fixture.ts` for FR-011 compliance in the eval runner. Any template change that breaks fixture deployment will fail this test immediately.

---

## Specification Debt

_None — all ambiguities resolved._

---

## Dependency Order

Recommended implementation sequence:

- [x] **Slice 1** — fixture source files are the foundation; the deployment test depends on them existing.
- [x] **Slice 2** — deployment verification test; depends on Slice 1 and on `dist/cli.js` (built by the `pretest` script).

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Validate Headless Execution Assumptions | depends on | The spike confirmed that `smithy init` deploys correctly into arbitrary directories and that headless `claude -p` loads `.claude/` files from CWD. US2 builds on this validated foundation. |
| User Story 3: Execute a Skill Headlessly and Capture Output | depended upon by | The eval runner (US3) copies `evals/fixture/` to a temp dir (FR-002), deploys skills there via `smithy init -a claude -y` with `cwd: tmpDir`, then invokes `claude -p`. The `hashDirectory` helper from Slice 2 will be extracted into `evals/lib/fixture.ts` in US3 for FR-011 runtime compliance. |
| User Story 5: Verify Strike End-to-End Output | depended upon by | The strike eval invokes `claude -p "/smithy.strike 'add a health check endpoint'"` against the fixture. The missing health check route in `src/index.ts` is the intentional gap that drives this eval prompt. US5 also verifies Acceptance Scenario 2.2 as an integration check after US3+US4 are in place. |
| User Story 8: Fixture Contains Deliberate Inconsistencies for Scout | depended upon by | US8 adds deliberate stale doc comments and mismatched signatures to the fixture for scout eval coverage. US2's fixture must be clean and stable before US8 introduces intentional flaws. |
