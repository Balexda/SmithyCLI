/**
 * Canonical default body templates for `smithy.orders`.
 *
 * These four strings are the source of truth for the "Default Template
 * Content" promised by the smithy-orders-issue-templates spec. They serve
 * two purposes:
 *
 *   1. `smithy init` writes them verbatim to
 *      `<manifestDir>/templates/orders/<type>.md` when provisioning the
 *      user's default templates (US1 — provisioner not yet implemented;
 *      this module exposes only the body strings it will eventually
 *      consume).
 *   2. `smithy.orders` uses them as the built-in fallback when no
 *      `<manifestDir>/templates/orders/<type>.md` exists for an artifact
 *      type (US4). The Phase 5 fallback bodies in
 *      `src/templates/agent-skills/commands/smithy.orders.prompt` mirror
 *      these strings; a parity assertion in `src/templates.test.ts` locks
 *      the two surfaces together so they cannot silently drift.
 *
 * Placeholder syntax is `{{variable}}` per the spec. The authoritative
 * per-type variable namespace lives in the spec's
 * `smithy-orders-issue-templates.data-model.md` Template Variable table.
 *
 * NOTE: A higher-level `provisionOrdersTemplates` function that writes
 * these defaults to disk during `smithy init` is US1 Slice 2's
 * responsibility and is intentionally omitted here.
 */
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
