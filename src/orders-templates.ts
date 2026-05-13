/**
 * Canonical default body templates for `smithy.orders` and the init-time
 * provisioner that writes them under `<manifestDir>/templates/orders/`.
 *
 * The four `ORDERS_DEFAULT_TEMPLATES` strings below are the source of truth
 * for the "Default Template Content" promised by the
 * smithy-orders-issue-templates spec. They are NOT consumed by
 * `smithy.orders` at runtime — the agent reads the Phase 5 heredoc fallback
 * bodies inline in
 * `src/templates/agent-skills/commands/smithy.orders.prompt`. The
 * relationship is a build/test-time invariant, not a runtime import:
 *
 *   - The Phase 5 heredoc fallback bodies in `smithy.orders.prompt`
 *     mirror these strings. A parity assertion in `src/templates.test.ts`
 *     (inside the `smithy.orders command delegates GitHub ops to
 *     smithy.gh-issue scripts` test) verifies that every variable and
 *     hybrid section header appears in both surfaces, so the two cannot
 *     silently drift.
 *   - `smithy init` writes these strings verbatim to
 *     `<manifestDir>/templates/orders/<type>.md` as the user's default
 *     templates via `provisionOrdersTemplates` (defined below). The
 *     provisioner only ever touches the four canonical `<type>.md` files
 *     under `templates/orders/`; `smithy-manifest.json` and any other
 *     sibling under `<manifestDir>` (including peer template families and
 *     user extras like READMEs or backups) are left untouched.
 *
 * Placeholder syntax is `{{variable}}` per the spec. The authoritative
 * per-type variable namespace lives in the spec's
 * `smithy-orders-issue-templates.data-model.md` Template Variable table.
 */
import fs from 'fs';
import path from 'path';
import type { DeployLocation } from './interactive.js';
import { resolveManifestDir } from './manifest.js';

export const ORDERS_DEFAULT_TEMPLATES: Readonly<
  Record<'rfc' | 'features' | 'spec' | 'tasks', string>
> = {
  rfc: `# {{title}}

**Milestone {{milestone_number}}**: {{milestone_title}}

{{milestone_description}}

## Success Criteria

{{milestone_success_criteria}}

## Source

- RFC: \`{{rfc_path}}\`

**Parent**: {{parent_issue}}

## Next Step

Run \`{{next_step}}\` to produce a feature map for this milestone.
`,
  features: `# {{title}}

{{feature_description}}

**Milestone {{milestone_number}}** — parent issue: {{parent_issue}}

## Source

- Feature map: \`{{features_path}}\`

## Next Step

Run \`{{next_step}}\` on this feature to produce a spec with user stories.
`,
  spec: `# {{title}}

**Priority**: {{priority}} | **Story #{{user_story_number}}**

{{user_story}}

## Acceptance Criteria

{{acceptance_scenarios}}

## Context

- Spec: \`{{spec_path}}\`
- Data Model: \`{{data_model_path}}\`
- Contracts: \`{{contracts_path}}\`

## Next Step

Run \`{{next_step}}\` (equivalent to \`smithy.cut {{spec_folder}} {{user_story_number}}\`) to decompose this story into implementable slices, then \`smithy.forge\` on each slice.
`,
  tasks: `# {{title}}

**Slice {{slice_number}}**

{{slice_goal}}

## Tasks

{{slice_tasks}}

## Context

- Tasks file: \`{{tasks_path}}\`

**Story issue**: {{parent_issue}}

## Next Step

Run \`{{next_step}}\` to implement this slice as a PR.
`,
};

/** Canonical template type identifiers, ordered for deterministic output. */
const ORDERS_TEMPLATE_TYPES = ['rfc', 'features', 'spec', 'tasks'] as const;
type OrdersTemplateType = (typeof ORDERS_TEMPLATE_TYPES)[number];

export interface ProvisionOrdersTemplatesOptions {
  /** Target directory whose `.smithy/` is used when `location === 'repo'`. */
  targetDir: string;
  /** Active deploy location — drives `<manifestDir>` resolution. */
  location: DeployLocation;
  /**
   * When `true`, replace existing canonical `<type>.md` files with the
   * default bodies. Defaults to `false`, which preserves any existing
   * canonical file (presence — not content — is the override signal, so
   * empty files count as "exists" too). Non-canonical siblings under
   * `templates/orders/` are never written regardless of this flag.
   */
  overwrite?: boolean;
}

export interface ProvisionOrdersTemplatesResult {
  /** Absolute paths of canonical template files written (created or overwritten). */
  templatesWritten: string[];
  /** Absolute paths of canonical template files that already existed and were preserved. */
  templatesPreserved: string[];
}

/**
 * Ensure `<manifestDir>/templates/orders/` exists and write default body
 * templates for any of the four canonical types that are missing.
 *
 * Behavior:
 *   - Resolves `<manifestDir>` via `resolveManifestDir(targetDir, location)`
 *     so deploy-location semantics match the rest of init.
 *   - Creates `<manifestDir>/templates/orders/` (and intermediate
 *     `templates/`) when absent. The mkdir call never stats or modifies
 *     `<manifestDir>/smithy-manifest.json` or any other sibling.
 *   - For each canonical type (`rfc`, `features`, `spec`, `tasks`), writes
 *     the default body if `<type>.md` does not exist; otherwise, when
 *     `overwrite` is `true` writes the default, and when `overwrite` is
 *     falsy (default) preserves the existing file untouched. Existing
 *     files are never opened or read — only `existsSync` checks them.
 *   - Returns the set of paths written and the set preserved, matching the
 *     contract's `templates_written` / `templates_preserved` outputs.
 */
export function provisionOrdersTemplates(
  opts: ProvisionOrdersTemplatesOptions,
): ProvisionOrdersTemplatesResult {
  const manifestDir = resolveManifestDir(opts.targetDir, opts.location);
  const ordersDir = path.join(manifestDir, 'templates', 'orders');
  if (!fs.existsSync(ordersDir)) {
    fs.mkdirSync(ordersDir, { recursive: true });
  }

  const templatesWritten: string[] = [];
  const templatesPreserved: string[] = [];

  for (const type of ORDERS_TEMPLATE_TYPES) {
    const dest = path.join(ordersDir, `${type}.md`);
    const exists = fs.existsSync(dest);
    if (!exists || opts.overwrite === true) {
      fs.writeFileSync(dest, ORDERS_DEFAULT_TEMPLATES[type as OrdersTemplateType]);
      templatesWritten.push(dest);
    } else {
      templatesPreserved.push(dest);
    }
  }

  return { templatesWritten, templatesPreserved };
}
