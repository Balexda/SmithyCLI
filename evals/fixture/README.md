# Smithy Eval Fixture

This is a minimal Express TypeScript API project used as the **reference fixture** for Smithy eval scenarios. It is **not a real application** — it exists solely to give eval agents a concrete, stable codebase with specific file paths, route patterns, and data types that plans can reference.

## Project Structure

- `src/index.ts` — Express app entry point. Mounts the users router at `/api/users` and starts the server on a configurable `PORT`.
- `src/types.ts` — TypeScript interfaces (`User`, `CreateUserRequest`) used by route handlers.
- `src/routes/users.ts` — Express Router with three user CRUD handlers: list, get by id, and create.
- `package.json` — Node project manifest with Express as a runtime dependency, and TypeScript, `@types/express`, and `@types/node` as dev dependencies.
- `tsconfig.json` — TypeScript config targeting ES2022 with CommonJS module resolution.

## Intentional Gap

The app intentionally has **no health check endpoint**. This gap is the primary eval prompt target — eval scenarios ask agents to "add a health check endpoint" and validate that the resulting plan references the specific files and structures in this fixture.

## Planted Inconsistencies

In addition to the intentional gap above, the fixture contains **deliberate, scout-detectable inconsistencies** that exist solely to exercise smithy-scout coverage for **User Story 8 (US8)** of the evals framework spec (`specs/2026-04-06-003-smithy-evals-framework/08-fixture-deliberate-inconsistencies-for-scout.tasks.md`). **Do not "clean up" these plants.** Future maintainers, `smithy-fix`, and `smithy-scout` runs at deeper depths must leave them in place — removing them silently breaks the US8 scout scenario, which asserts that at least one Warning or Conflict finding is surfaced against this fixture.

Each plant maps to a row in smithy-scout's Severity Guidelines table (see `src/templates/agent-skills/agents/smithy.scout.prompt`).

| File | Location | Plant | Expected scout category |
|------|----------|-------|-------------------------|
| `evals/fixture/src/routes/users.ts` | Line 14 — the `// GET /:id — get user by email address` comment above the `router.get('/:id', ...)` handler | Doc comment claims the handler fetches a user "by email address", but the handler parses `req.params.id` as an integer and matches on `u.id` — the doc comment contradicts the signature and behavior. | **Conflict** (doc comment doesn't match signature) |
| `evals/fixture/src/routes/users.ts` | Line 25 — the `// TODO: add request validation before creating user (reject empty name/email, enforce email format)` comment above the POST handler | An explicit `TODO` marker flagging missing request validation in an otherwise scoped area. | **Warning** (TODO/FIXME marker in scoped area) |

Together with the **Intentional Gap** above, these plants are the fixture's twin purposes: the missing health-check endpoint drives eval scenarios that ask agents to add new behavior, and the planted inconsistencies drive eval scenarios that ask agents to detect existing flaws.

## Usage

This fixture is **read by AI agents, not executed**. Do not run `npm install` in this directory. At eval time, the eval runner copies this directory to a temp location, deploys Smithy skills into the copy via `smithy init -a claude -y`, and runs `claude -p` against it.

To manually test Smithy skill deployment against a copy:

```bash
cp -r evals/fixture /tmp/fixture-test
node dist/cli.js init -a claude -y -d /tmp/fixture-test
# Inspect /tmp/fixture-test/.claude/ for deployed skills
rm -rf /tmp/fixture-test
```

## Adding Files

Only add files to this fixture when a specific eval scenario requires them. Keep the fixture minimal to reduce maintenance burden and ensure eval stability.
