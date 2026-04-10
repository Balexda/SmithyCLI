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

- [ ] **Create `evals/fixture/.gitignore`** — this is the first file to create, before any other fixture files, so that subsequent git operations do not accidentally stage generated artifacts. Contents:
  ```
  node_modules/
  .claude/
  .smithy/
  dist/
  ```

- [ ] **Create `evals/fixture/package.json`** — minimal Node project metadata. Do NOT run `npm install` — `node_modules/` is gitignored and the fixture exists for AI reading, not execution:
  ```json
  {
    "name": "smithy-eval-fixture",
    "version": "0.1.0",
    "private": true,
    "description": "Minimal Express API — eval fixture for Smithy agent-skills",
    "scripts": {
      "build": "tsc",
      "start": "node dist/index.js"
    },
    "dependencies": {
      "express": "^4.18.0"
    },
    "devDependencies": {
      "@types/express": "^4.17.0",
      "@types/node": "^20.0.0",
      "typescript": "^5.0.0"
    }
  }
  ```

- [ ] **Create `evals/fixture/tsconfig.json`** — standalone TypeScript config, independent of the Smithy repo's `nodenext` tsconfig. Uses `commonjs` since this is a self-contained Express project, not part of the Smithy ESM build:
  ```json
  {
    "compilerOptions": {
      "target": "es2022",
      "module": "commonjs",
      "strict": true,
      "esModuleInterop": true,
      "outDir": "dist",
      "rootDir": "src"
    },
    "include": ["src"]
  }
  ```

- [ ] **Create `evals/fixture/README.md`** — brief description that AI agents will read when planning:
  ```markdown
  # Smithy Eval Fixture

  A minimal Express TypeScript API used as the evaluation target for Smithy agent-skills evals.

  ## Purpose

  This project is the CWD for `claude -p` invocations during eval runs. Agents plan against
  its source files — the project is not compiled or executed during evals.

  ## Structure

  - `src/index.ts` — Express app entry point (no health check endpoint — intentional gap)
  - `src/routes/users.ts` — User CRUD routes (GET /users, POST /users, GET /users/:id)
  - `src/types.ts` — Shared TypeScript interfaces (User, CreateUserRequest)

  ## Skills deployment

  Smithy skills are deployed into a **temp copy** of this directory at eval time — not
  committed here. To deploy manually for local testing, from the repo root run:

      node dist/cli.js init -a claude -y

  with your shell's working directory set to a copy of this fixture.

  ## Adding to this fixture

  Only add files that serve a specific eval scenario. Every addition increases maintenance
  burden and may affect existing evals that reference current file structure.
  ```

- [ ] **Create `evals/fixture/src/types.ts`** — shared TypeScript interfaces referenced by routes and planned by eval agents:
  ```typescript
  export interface User {
    id: number;
    name: string;
    email: string;
  }

  export interface CreateUserRequest {
    name: string;
    email: string;
  }
  ```

- [ ] **Create `evals/fixture/src/routes/users.ts`** — Express Router with user CRUD operations using an in-memory array. Import paths use no extension (commonjs module resolution):
  ```typescript
  import { Router, type Request, type Response } from 'express';
  import type { User, CreateUserRequest } from '../types';

  export const usersRouter = Router();

  const users: User[] = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
  ];

  let nextId = 3;

  usersRouter.get('/', (_req: Request, res: Response) => {
    res.json(users);
  });

  usersRouter.get('/:id', (req: Request, res: Response) => {
    const user = users.find((u) => u.id === Number(req.params['id']));
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  });

  usersRouter.post('/', (req: Request, res: Response) => {
    const body = req.body as CreateUserRequest;
    const user: User = { id: nextId++, name: body.name, email: body.email };
    users.push(user);
    res.status(201).json(user);
  });
  ```

- [ ] **Create `evals/fixture/src/index.ts`** — Express app entry point. Intentionally has **no health check endpoint** — that gap is the primary eval prompt target ("add a health check endpoint"):
  ```typescript
  import express from 'express';
  import { usersRouter } from './routes/users';

  const app = express();
  const PORT = Number(process.env['PORT'] ?? 3000);

  app.use(express.json());
  app.use('/api/users', usersRouter);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  ```

- [ ] **Verify fixture structure** — confirm the directory contains exactly the expected files with no generated artifacts:
  ```
  evals/fixture/.gitignore
  evals/fixture/package.json
  evals/fixture/tsconfig.json
  evals/fixture/README.md
  evals/fixture/src/types.ts
  evals/fixture/src/routes/users.ts
  evals/fixture/src/index.ts
  ```
  No `.claude/`, `.smithy/`, `node_modules/`, or `dist/` should be present.

**PR Outcome**: A committed Express TypeScript project in `evals/fixture/` providing a stable, controlled evaluation target. Eval agents can reference `src/routes/users.ts`, `src/types.ts`, and `src/index.ts` by path when producing plans. The intentionally absent health check endpoint drives the primary strike/plan eval prompt.

---

## Slice 2: Fixture Deployment Verification Test

**Goal**: Prove that `smithy init -a claude -y` successfully deploys skills into the fixture, and that the source fixture directory is not modified by deployment — establishing the deployability guarantee that Acceptance Scenario 2.1 requires and the SHA-256 checksum pattern that the eval runner (US3) will formalize for FR-011.

**Justification**: Acceptance Scenario 2.1 ("when `smithy init` runs against it, then skills are deployed") must be verified by an automated test that runs on every `npm test` invocation. Without this test, fixture deployability is a manual assumption that silently breaks when templates change.

**Note on FR-010**: FR-010 requires evals to be decoupled from `npm test`. This test is **not an eval case** — it makes no `claude -p` invocations and has no API key dependency. It is a unit test validating CLI deployment behavior, the same tier as `src/cli.test.ts`. FR-010 governs the eval runner (`run-evals.ts`); it does not prohibit fixture unit tests from running in `npm test`.

**Note on Acceptance Scenario 2.2**: The acceptance criterion "when a plan eval runs against it, then the plan references specific files and structures from the fixture" cannot be verified within US2 scope — it requires the eval runner (US3), structural validator (US4), and YAML scenario definitions (US7). This scenario is deferred and will be validated as part of US5 (Verify Strike End-to-End Output) integration verification.

**Addresses**: FR-002 (copy-to-temp pattern), FR-011 (source fixture not modified); Acceptance Scenario 2.1

### Tasks

- [ ] **Read `src/cli.test.ts` lines 36–73** before writing any code. The fixture test must follow the same established patterns: import style (`node:child_process`, `node:fs`, `node:os`, `node:path`), `path.resolve('dist/cli.js')` for CLI path, `fs.mkdtempSync` + `fs.rmSync` + `afterEach` cleanup, and `{ cwd: tmpDir }` option on `execFileSync` (not the `-d` flag). This consistency matters — reviewers will compare the two files.

- [ ] **Create `evals/fixture.test.ts`** following the `src/cli.test.ts` conventions:

  ```typescript
  import { describe, it, expect, afterEach } from 'vitest';
  import { execFileSync } from 'node:child_process';
  import fs from 'node:fs';
  import os from 'node:os';
  import path from 'node:path';
  import { createHash } from 'node:crypto';

  const CLI = path.resolve('dist/cli.js');
  const FIXTURE_DIR = path.resolve('evals/fixture');

  /**
   * Compute a deterministic SHA-256 hash of all files under `dir`.
   *
   * Files are sorted by relative path for cross-platform consistency.
   * Binary reads (no encoding arg) prevent line-ending normalization.
   * Excludes generated/deployed subdirectories that init may create.
   *
   * NOTE: This helper will be extracted to `evals/lib/fixture.ts` in US3
   * when the eval runner needs it for FR-011 runtime compliance.
   */
  function hashDirectory(dir: string): string {
    const EXCLUDED = new Set(['.claude', '.smithy', 'node_modules', 'dist']);
    const hash = createHash('sha256');

    function collect(current: string, relative: string): void {
      const entries = fs.readdirSync(current, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (EXCLUDED.has(entry.name)) continue;
        const fullPath = path.join(current, entry.name);
        const relPath = path.join(relative, entry.name);
        if (entry.isDirectory()) {
          collect(fullPath, relPath);
        } else if (entry.isFile()) {
          hash.update(relPath);                   // path contributes to hash
          hash.update(fs.readFileSync(fullPath)); // binary read — no encoding
        }
      }
    }

    collect(dir, '');
    return hash.digest('hex');
  }

  describe('evals/fixture deployment', () => {
    let tmpDir: string;

    afterEach(() => {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('smithy init deploys commands, prompts, and agents into a fixture copy', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-fixture-test-'));
      fs.cpSync(FIXTURE_DIR, tmpDir, { recursive: true });

      execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
        encoding: 'utf-8',
        cwd: tmpDir,
      });

      const commandsDir = path.join(tmpDir, '.claude', 'commands');
      const promptsDir = path.join(tmpDir, '.claude', 'prompts');
      const agentsDir = path.join(tmpDir, '.claude', 'agents');

      expect(fs.existsSync(commandsDir), '.claude/commands/ must exist after init').toBe(true);
      expect(fs.existsSync(promptsDir), '.claude/prompts/ must exist after init').toBe(true);
      expect(fs.existsSync(agentsDir), '.claude/agents/ must exist after init').toBe(true);

      const commandFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.md'));
      const promptFiles = fs.readdirSync(promptsDir).filter((f) => f.endsWith('.md'));
      const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));

      expect(commandFiles.length, 'commands/ must contain .md skill files').toBeGreaterThan(0);
      expect(promptFiles.length, 'prompts/ must contain .md skill files').toBeGreaterThan(0);
      expect(agentFiles.length, 'agents/ must contain .md skill files').toBeGreaterThan(0);

      // Key skills needed by strike evals must be present
      expect(commandFiles, 'smithy.strike.md must be deployed').toContain('smithy.strike.md');
      expect(agentFiles, 'smithy.plan.md must be deployed').toContain('smithy.plan.md');
    });

    it('source fixture directory is not modified after deployment into a temp copy (FR-011)', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-fixture-test-'));
      fs.cpSync(FIXTURE_DIR, tmpDir, { recursive: true });

      const checksumBefore = hashDirectory(FIXTURE_DIR);

      execFileSync('node', [CLI, 'init', '-a', 'claude', '-y'], {
        encoding: 'utf-8',
        cwd: tmpDir,
      });

      const checksumAfter = hashDirectory(FIXTURE_DIR);

      expect(
        checksumAfter,
        'source fixture must not be modified when init runs in a temp copy'
      ).toBe(checksumBefore);
    });
  });
  ```

  **Implementation notes**:
  - `fs.cpSync` requires Node.js ≥16.7. On the Linux dev environment this is safe. If unavailable, use a manual recursive copy.
  - `path.resolve('evals/fixture')` resolves from CWD. Vitest runs from the repo root via `npm test`, so this resolves correctly — same pattern as `path.resolve('dist/cli.js')` in `src/cli.test.ts`.
  - The `hashDirectory` helper is intentionally inline here. It will be extracted to `evals/lib/fixture.ts` in US3 when the eval runner needs it for FR-011 runtime checks. Do not create `evals/lib/` prematurely.

- [ ] **Run `npm test`** and confirm both new test cases pass alongside all existing tests. The `pretest` script builds `dist/cli.js` automatically before vitest runs. Expected outcome: 2 new passing tests in `evals/fixture.test.ts`, all existing tests unchanged.

- [ ] **If vitest does not discover `evals/fixture.test.ts`**: verify by checking the test output for the `evals/` path. The default vitest glob `**/*.test.ts` should discover it since `evals/` is under the project root. If it is missing, create `vitest.config.ts` at the repo root:
  ```typescript
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      include: ['src/**/*.test.ts', 'evals/**/*.test.ts'],
    },
  });
  ```
  Then re-run `npm test`.

**PR Outcome**: An automated deployment verification test that proves Acceptance Scenario 2.1 on every `npm test` run. The inline `hashDirectory` helper establishes the SHA-256 checksum approach that US3 will extract into `evals/lib/fixture.ts` for FR-011 compliance in the eval runner. Any template change that breaks fixture deployment will fail this test immediately.

---

## Dependency Order

Recommended implementation sequence:

1. **Slice 1** — fixture source files are the foundation; the deployment test depends on them existing.
2. **Slice 2** — deployment verification test; depends on Slice 1 and on `dist/cli.js` (built by the `pretest` script).

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 1: Validate Headless Execution Assumptions | depends on | The spike confirmed that `smithy init` deploys correctly into arbitrary directories and that headless `claude -p` loads `.claude/` files from CWD. US2 builds on this validated foundation. |
| User Story 3: Execute a Skill Headlessly and Capture Output | depended upon by | The eval runner (US3) copies `evals/fixture/` to a temp dir (FR-002), deploys skills there via `smithy init -a claude -y` with `cwd: tmpDir`, then invokes `claude -p`. The `hashDirectory` helper from Slice 2 will be extracted into `evals/lib/fixture.ts` in US3 for FR-011 runtime compliance. |
| User Story 5: Verify Strike End-to-End Output | depended upon by | The strike eval invokes `claude -p "/smithy.strike 'add a health check endpoint'"` against the fixture. The missing health check route in `src/index.ts` is the intentional gap that drives this eval prompt. US5 also verifies Acceptance Scenario 2.2 as an integration check after US3+US4 are in place. |
| User Story 8: Fixture Contains Deliberate Inconsistencies for Scout | depended upon by | US8 adds deliberate stale doc comments and mismatched signatures to the fixture for scout eval coverage. US2's fixture must be clean and stable before US8 introduces intentional flaws. |
