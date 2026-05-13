/**
 * Canonical default body templates for `smithy.orders`.
 *
 * These four strings are the source of truth for the "Default Template
 * Content" promised by the smithy-orders-issue-templates spec. They are
 * NOT consumed by `smithy.orders` at runtime — the agent reads the
 * Phase 5 heredoc fallback bodies inline in
 * `src/templates/agent-skills/commands/smithy.orders.prompt`. The
 * relationship is a build/test-time invariant, not a runtime import:
 *
 *   - The Phase 5 heredoc fallback bodies in `smithy.orders.prompt`
 *     mirror these strings. A parity assertion in `src/templates.test.ts`
 *     (inside the `smithy.orders command delegates GitHub ops to
 *     smithy.gh-issue scripts` test) verifies that every variable and
 *     hybrid section header appears in both surfaces, so the two cannot
 *     silently drift.
 *   - When US1 ships, `smithy init` will write these strings verbatim to
 *     `<manifestDir>/templates/orders/<type>.md` as the user's default
 *     templates. That provisioner (`provisionOrdersTemplates`) lives in
 *     US1 Slice 2 and is intentionally omitted from this module today —
 *     only the body string exports are needed to satisfy the parity
 *     assertion.
 *
 * Placeholder syntax is `{{variable}}` per the spec. The authoritative
 * per-type variable namespace lives in the spec's
 * `smithy-orders-issue-templates.data-model.md` Template Variable table.
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
