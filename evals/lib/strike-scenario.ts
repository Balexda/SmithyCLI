/**
 * Strike end-to-end eval scenario (re-export of the YAML-declared case).
 *
 * The scenario's fields — `name`, `skill`, `prompt`, and
 * `structural_expectations` — live in `evals/cases/strike-health-check.yaml`
 * as the single declarative source of truth. This module loads that file
 * through `loadScenarios` and re-exports the resulting `EvalScenario` under
 * the historical `strikeScenario` name so existing consumers
 * (`evals/run-evals.ts` and `evals/lib/strike-scenario.test.ts`) continue to
 * import the same symbol unchanged.
 *
 * Keeping this indirection for the duration of Slice 1 means the pre-existing
 * spike-capture test transitively exercises the loader's happy path: if the
 * YAML round-trip drifts from the original literal, `strike-scenario.test.ts`
 * will catch it without any test churn. A later slice rewires `run-evals.ts`
 * to call `loadScenarios` directly, at which point this file can be deleted.
 *
 * The load runs at module-import time (the loader uses synchronous `fs`
 * calls). That matches the test file's own top-level `fs.readFileSync`, and
 * lets the export remain a plain `const` for import ergonomics.
 *
 * Addresses: FR-005, FR-006, FR-007, FR-012; Acceptance Scenarios 5.1, 5.2,
 * 5.3, 7.1
 *
 * Spec:         specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.spec.md
 * Data model:   specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.data-model.md
 * Contracts:    specs/2026-04-06-003-smithy-evals-framework/smithy-evals-framework.contracts.md
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadScenarios } from './scenario-loader.js';
import type { EvalScenario } from './types.js';

// Resolve `evals/cases/` relative to this source file so the load works the
// same under `tsx evals/run-evals.ts` and under vitest regardless of CWD.
const here = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.resolve(here, '..', 'cases');

const found = loadScenarios(casesDir).find((s) => s.name === 'strike-health-check');
if (!found) {
  throw new Error(
    'strike-health-check scenario not found in evals/cases/ — strike-health-check.yaml may have been renamed or removed, or it may exist but have failed validation. Check stderr output for parse or validation errors from scenario loading.',
  );
}

export const strikeScenario: EvalScenario = found;
