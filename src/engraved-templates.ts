/**
 * Canonical schema, lifecycle constants, and scaffold templates for the
 * **engraved-knowledge** artifact family (decisions, invariants, principles).
 *
 * This module is the single source of truth that every downstream sub-issue of
 * EPIC #412 builds on:
 *
 *   - `smithy.engrave` (#414) reads the per-kind template bodies below when
 *     scaffolding a new record and applies the same frontmatter shape.
 *   - `smithy.recall` (#415) discovers engraved records by suffix and reads
 *     `topics` / `scope` / `applies_to` from frontmatter to surface relevant
 *     records during planning.
 *   - The status scanner / parser (#416) types its parsed frontmatter against
 *     {@link EngravedFrontmatter} and uses the kind/status enums for
 *     classification.
 *   - The graph + stale-ref check (#417) walks the `supersedes` /
 *     `superseded_by` / `establishes` / `established_by` edges declared here.
 *   - Orders templates + audit checklists (#418) embed the per-kind body
 *     headings (e.g. the Known-Exceptions ledger) so issue bodies stay in
 *     lockstep with the on-disk artifact shape.
 *
 * Records are **roots** in the planning graph — they have no `## Dependency
 * Order` row and never appear as parent/child entries in milestone, feature,
 * story, or slice tables. They participate in the graph via *citation edges*:
 * `establishes` / `established_by` and `supersedes` / `superseded_by`. The
 * `applies_to` / `scope` / `topics` fields are recall / filter metadata, not
 * graph edges — `smithy.recall` (#415) uses them to surface relevant
 * records at planning time, but they never become nodes or edges in the
 * status graph (#416, #417).
 *
 * Placeholder syntax in the template bodies is `{{variable}}` (matches the
 * convention established in `src/orders-templates.ts`). Variables are filled
 * in by `smithy.engrave` when authoring a record.
 *
 * Cross-link: the human-facing schema reference, lifecycle diagrams, and
 * worked example records live in `docs/engraved-knowledge-schema.md`. When
 * changing the constants or template bodies in this file, update that
 * document in the same change.
 */

/** Discriminator for the three engraved-knowledge kinds. */
export const ENGRAVED_KINDS = ['decision', 'invariant', 'principle'] as const;
export type EngravedKind = (typeof ENGRAVED_KINDS)[number];

/**
 * Ownership / recall partition. `system` is the default for architectural
 * commitments owned by engineering; `design` is the optional design-domain
 * partition (UI, interaction, product surface) owned by design. The two
 * domains share machinery — they are separated only by frontmatter and by
 * directory layout.
 */
export const ENGRAVED_DOMAINS = ['system', 'design'] as const;
export type EngravedDomain = (typeof ENGRAVED_DOMAINS)[number];
export const ENGRAVED_DEFAULT_DOMAIN: EngravedDomain = 'system';

/**
 * Lifecycle states for a decision record (immutable / append-only). New
 * decisions start `proposed`; they move to `accepted` once ratified;
 * `superseded` marks a decision replaced by a newer one (the replacement
 * cites it via `supersedes`, and this record back-links via `superseded_by`);
 * `deprecated` marks a decision retired without a replacement.
 */
export const DECISION_STATUSES = [
  'proposed',
  'accepted',
  'superseded',
  'deprecated',
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/**
 * Alignment state for an invariant. Derived from the Known-Exceptions ledger:
 *
 *   - `aligned` — the ledger is empty (or contains only `accepted` permanent
 *     carve-outs that the team has decided to live with indefinitely).
 *   - `drifting` — the ledger lists at least one `temporary` exception with
 *     an open tracking issue; reality currently diverges from the rule.
 *
 * The status is recorded in frontmatter for fast catalog queries but is
 * authoritative only as a *summary* of the ledger — the ledger is the
 * primary source of truth.
 */
export const INVARIANT_STATUSES = ['aligned', 'drifting'] as const;
export type InvariantStatus = (typeof INVARIANT_STATUSES)[number];

/**
 * Lifecycle for a principle. Apex, cross-domain, rarely changes — there is
 * only one steady state.
 */
export const PRINCIPLE_STATUSES = ['active'] as const;
export type PrincipleStatus = (typeof PRINCIPLE_STATUSES)[number];

/** Severity grades used in the Known-Exceptions ledger of an invariant. */
export const KNOWN_EXCEPTION_SEVERITIES = ['low', 'medium', 'high'] as const;
export type KnownExceptionSeverity = (typeof KNOWN_EXCEPTION_SEVERITIES)[number];

/**
 * Disposition of a known exception. These constants are **normalized
 * lowercase keys** used by tooling (parser, scanner, audit). The canonical
 * on-disk token in the "Disposition + Why" column of an invariant's
 * Known-Exceptions ledger is the Capitalized form — `Accepted: <reason>`
 * or `Temporary: <reason>` — to match the example records and the
 * scaffold template body. Parsers MUST lowercase the on-disk token
 * before comparing to these constants.
 *
 *   - `accepted` (on-disk: `Accepted:`) — a permanent carve-out the team
 *     has decided to live with.
 *   - `temporary` (on-disk: `Temporary:`) — a known divergence with an
 *     open tracking issue; the team intends to close the gap.
 */
export const KNOWN_EXCEPTION_DISPOSITIONS = ['accepted', 'temporary'] as const;
export type KnownExceptionDisposition = (typeof KNOWN_EXCEPTION_DISPOSITIONS)[number];

/**
 * File suffix conventions. Decision and invariant records are discovered by
 * suffix:
 *
 *   - `*.decision.md` — a decision record.
 *   - `*.invariant.md` — an invariant record.
 *
 * Principle records carry **no dedicated suffix** — the family is
 * intentionally small and centralized. Each principle is its own
 * `kind: principle` file under the constitution directory (see
 * {@link ENGRAVED_DEFAULT_LOCATIONS}); the "constitution" is the union of
 * every such file in that directory. Scanners discover principles by
 * walking the constitution directory, not by suffix.
 */
export const ENGRAVED_SUFFIXES: Readonly<Record<Exclude<EngravedKind, 'principle'>, string>> = {
  decision: '.decision.md',
  invariant: '.invariant.md',
};

/**
 * Default repository locations for engraved records, per domain. Authors are
 * free to override these per-record; the locations below are what
 * `smithy.engrave` will propose when scaffolding.
 */
export const ENGRAVED_DEFAULT_LOCATIONS: Readonly<
  Record<EngravedDomain, Readonly<Record<EngravedKind, string>>>
> = {
  system: {
    decision: 'docs/decisions/',
    invariant: 'docs/invariants/',
    principle: 'docs/constitution/',
  },
  design: {
    decision: 'docs/design/decisions/',
    invariant: 'docs/design/invariants/',
    principle: 'docs/design/constitution/',
  },
};

/**
 * Shared frontmatter fields present on every engraved record, regardless of
 * kind. Kind-specific extensions live on the discriminated interfaces below.
 */
export interface EngravedFrontmatterBase {
  /**
   * Globally unique identifier within the repository. Suggested prefixes:
   * `D-` for decisions, `INV-` for invariants, `P-` for principles. Stable
   * across renames; never reused.
   */
  id: string;
  /** Discriminator: which kind of engraved record this is. */
  kind: EngravedKind;
  /** Ownership / recall partition. Defaults to `system`. */
  domain: EngravedDomain;
  /** Human-readable title, also rendered as the H1 in the body. */
  title: string;
  /**
   * Searchable tags used by `smithy.recall` to surface relevant records
   * during planning. Free-form but lowercase-kebab is the convention
   * (e.g., `offline-first`, `agent-router`, `accessibility`).
   */
  topics: string[];
  /**
   * Code paths, modules, or architectural layers the record governs.
   * Repo-relative globs or package names (e.g., `src/agents/**`,
   * `evals/`, `@balexda/smithy-cli`).
   */
  scope: string[];
  /**
   * User-visible surfaces or product components the record affects
   * (e.g., `CLI`, `Web UI`, `Status JSON`, `init flow`).
   */
  applies_to: string[];
}

/** Frontmatter shape for a decision record. */
export interface DecisionFrontmatter extends EngravedFrontmatterBase {
  kind: 'decision';
  status: DecisionStatus;
  /** ISO 8601 date (YYYY-MM-DD) the decision was first authored. */
  decided_at: string;
  /** Decision IDs this decision replaces. Empty array when none. */
  supersedes: string[];
  /**
   * Decision IDs that have replaced this decision. Empty array while this
   * decision is still active; populated when a newer decision supersedes it.
   */
  superseded_by: string[];
  /** Invariant IDs this decision establishes. Empty array when none. */
  establishes: string[];
}

/** Frontmatter shape for an invariant record. */
export interface InvariantFrontmatter extends EngravedFrontmatterBase {
  kind: 'invariant';
  /**
   * Derived alignment summary. Set to `drifting` whenever the
   * Known-Exceptions ledger contains a `temporary` row; otherwise
   * `aligned`. Tooling MAY recompute this from the ledger.
   */
  status: InvariantStatus;
  /**
   * Decision IDs that established this invariant. Required (an invariant
   * always traces back to at least one decision).
   */
  established_by: string[];
}

/** Frontmatter shape for a principle record. */
export interface PrincipleFrontmatter extends EngravedFrontmatterBase {
  kind: 'principle';
  status: PrincipleStatus;
}

/** Discriminated union over all engraved-knowledge frontmatter shapes. */
export type EngravedFrontmatter =
  | DecisionFrontmatter
  | InvariantFrontmatter
  | PrincipleFrontmatter;

/**
 * Scaffold body templates for each engraved kind. `smithy.engrave` (#414)
 * writes one of these into the target file when authoring a new record,
 * substituting `{{variable}}` placeholders. Each scaffold INCLUDES the YAML
 * frontmatter so the deployed record is self-contained.
 *
 * These strings are the authoritative source: the `smithy.engrave` prompt
 * will embed inline copies and a parity test (analogous to the existing
 * `ORDERS_DEFAULT_TEMPLATES` parity test in `src/templates.test.ts`) will
 * keep the two in lockstep.
 */
export const ENGRAVED_DEFAULT_TEMPLATES: Readonly<Record<EngravedKind, string>> = {
  decision: `---
id: {{id}}
kind: decision
domain: {{domain}}
title: "{{title}}"
status: proposed
decided_at: {{decided_at}}
topics: [{{topics}}]
scope: [{{scope}}]
applies_to: [{{applies_to}}]
supersedes: [{{supersedes}}]
superseded_by: []
establishes: [{{establishes}}]
---
# {{title}}

## Context

{{context}}

## Decision

{{decision}}

## Consequences

{{consequences}}

## Establishes

{{establishes_prose}}

## Citations

{{citations}}
`,
  invariant: `---
id: {{id}}
kind: invariant
domain: {{domain}}
title: "{{title}}"
status: aligned
topics: [{{topics}}]
scope: [{{scope}}]
applies_to: [{{applies_to}}]
established_by: [{{established_by}}]
---
# {{title}}

## Rule

{{rule}}

## Rationale

{{rationale}}

## Known Exceptions

The ledger below is the authoritative source of alignment state. The
\`status\` field in frontmatter is a derived summary: \`drifting\` whenever
this table has at least one \`Temporary\` row, otherwise \`aligned\`.

| Where | What diverges | Disposition + Why | Tracking Issue | Severity |
|-------|---------------|-------------------|----------------|----------|
| — | — | — | — | — |

## Citations

{{citations}}
`,
  principle: `---
id: {{id}}
kind: principle
domain: {{domain}}
title: "{{title}}"
status: active
topics: [{{topics}}]
scope: [{{scope}}]
applies_to: [{{applies_to}}]
---
# {{title}}

## Statement

{{statement}}

## Why this is apex

{{rationale}}

## How decisions cite this

{{citation_guidance}}
`,
};

/**
 * Canonical list of body section headings each engraved kind MUST contain.
 * Tooling (status scanner #416, audit checklist #418) reads these to lint
 * an engraved record's structure. Order matters: the headings appear in
 * the listed order in the scaffold templates.
 */
export const ENGRAVED_REQUIRED_SECTIONS: Readonly<Record<EngravedKind, readonly string[]>> = {
  decision: ['Context', 'Decision', 'Consequences', 'Establishes', 'Citations'],
  invariant: ['Rule', 'Rationale', 'Known Exceptions', 'Citations'],
  principle: ['Statement', 'Why this is apex', 'How decisions cite this'],
};
