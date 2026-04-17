/**
 * Strike end-to-end eval scenario (re-export of the YAML-declared case).
 *
 * The scenario's fields — `name`, `skill`, `prompt`, and
 * `structural_expectations` — live in `evals/cases/strike-health-check.yaml`
 * as the single declarative source of truth. This module loads that specific
 * file via `loadScenarioFromFile` and re-exports the resulting `EvalScenario`
 * under the historical `strikeScenario` name so existing consumers
 * (`evals/run-evals.ts` and `evals/lib/strike-scenario.test.ts`) continue to
 * import the same symbol unchanged. A later slice rewires `run-evals.ts` to
 * call the loader directly, at which point this file can be deleted.
 *
 * Loading by exact path rather than by name-search across the cases
 * directory keeps this export unambiguously bound to
 * `strike-health-check.yaml`: no alphabetically-earlier YAML claiming the
 * same `name` can redirect the canonical strike scenario. The spike-capture
 * test (`strike-scenario.test.ts`) remains the regression guard that the
 * YAML round-trip preserves the scenario's behavioral contract.
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

import { loadScenarioFromFile } from './scenario-loader.js';
import type { EvalScenario } from './types.js';

// Resolve the specific case file relative to this source file so the load
// works the same under `tsx evals/run-evals.ts` and under vitest regardless
// of CWD. Loading by exact path — rather than by name-search across the
// cases directory — ensures this export is always bound to
// `strike-health-check.yaml` and can never be hijacked by a different file
// that declares the same `name`.
const here = path.dirname(fileURLToPath(import.meta.url));
const strikeCasePath = path.resolve(here, '..', 'cases', 'strike-health-check.yaml');

export const strikeScenario: EvalScenario = loadScenarioFromFile(strikeCasePath);
