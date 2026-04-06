# Strike: Mark Feature Selection

**Date:** 2026-04-05  |  **Branch:** strike/mark-feature-selection  |  **Status:** Ready

## Summary

`smithy.mark` currently accepts RFC paths, feature descriptions, or empty input. It has no
awareness of `.features.md` (feature map) files. When given a feature map, it tries to spec
everything at once. This strike adds `.features.md` as a recognized input type with
single-feature auto-selection — picking the first feature that doesn't already have a spec
in `specs/`, mirroring how `smithy.render` auto-selects milestones and `smithy.forge`
auto-selects slices.

## Goal

Enable `smithy.mark` to accept a `.features.md` file as input and auto-select a single
feature for specification, matching the established auto-selection pattern across the
Smithy pipeline.

## Out of Scope

- TypeScript code changes (this is a prompt-only change)
- Changes to `smithy.render`, `smithy.forge`, `smithy.cut`, or other prompts
- Shared routing snippet extraction across prompts
- Bidirectional backlinks (updating `.features.md` when a spec is created)
- Feature-number-only input (e.g., just `3` without a file path)

## Requirements

- **FR-001**: Mark MUST accept a `.features.md` file path as input (with or without a feature number).
- **FR-002**: When given a `.features.md` without a feature number, mark MUST auto-select the first feature that does not have a corresponding spec folder in `specs/`.
- **FR-003**: When given a `.features.md` with a feature number, mark MUST target that specific feature.
- **FR-004**: When all features in a `.features.md` already have specs, mark MUST present a table of features with spec paths and ask which to audit (Phase 0).
- **FR-005**: Mark MUST validate that the `.features.md` contains parseable `### Feature N: <Title>` headings and abort with a diagnostic if not.
- **FR-006**: Mark MUST handle out-of-range feature numbers by listing available features.
- **FR-007**: The spec template MUST include a `Source Feature Map` traceability field when input is a `.features.md`.
- **FR-008**: Mark MUST extract the Source RFC path from the `.features.md` header and carry it as context.

## Success Criteria

- **SC-001**: Running `/smithy.mark path/to/file.features.md` auto-selects the first unspecced feature and proceeds through Phase 1.
- **SC-002**: Running `/smithy.mark path/to/file.features.md 3` targets Feature 3 specifically.
- **SC-003**: When all features have specs, mark presents a table and asks which to audit.
- **SC-004**: The produced `.spec.md` includes a `Source Feature Map` field linking back to the feature map.
- **SC-005**: Invalid `.features.md` files produce a clear diagnostic message.

## User Flow

1. User runs `/smithy.mark docs/rfcs/2026-001-foo/01-core.features.md`.
2. Mark reads the feature map, parses feature headings, scans `specs/` for existing specs.
3. Mark identifies that Features 1 and 2 already have specs but Feature 3 does not.
4. Mark announces: "Auto-selected Feature 3: <Title> (Features 1-2 already specc'd)."
5. Mark proceeds through Phase 1 (Intake) using the feature's description and scope as context.
6. The resulting spec includes `Source Feature Map` traceability.

## Data Model

N/A

## Contracts

N/A

## Decisions

- **Dedicated Routing section** (matching render's pattern) over inline logic, for pipeline consistency.
- **Slug matching** to detect existing specs — stateless scanning of `specs/` folders, matching the approach used by render and cut.
- **Auto-select by feature number order** — consistent with forge (first incomplete slice) and render (first unmapped milestone).
- **Source Feature Map traceability** — forward reference from spec to feature map, matching how render's `.features.md` includes `Source RFC`.
- **Extract Source RFC from `.features.md` header** — preserves full RFC-to-milestone-to-feature-to-spec lineage chain.

## Single Slice

**Goal**: Add `.features.md` input support with feature auto-selection to the `smithy.mark` prompt template.

**Justification**: All changes are confined to a single prompt file (~430 lines). The change adds ~30-40 lines of routing logic and minor adjustments to existing sections.

### Tasks

- [x] Task 1: Add `.features.md` input variants to the Input section
- [x] Task 2: Add Routing section between Input and Phase 1 with feature map parsing, spec-existence checking, auto-selection, table presentation, and validation
- [x] Task 3: Update Phase 1 (Intake) to handle feature map context (feature description extraction, Source RFC chaining, slug derivation from feature title)
- [x] Task 4: Add `Source Feature Map` traceability field to the spec template in Phase 3
- [x] Task 5: Update Rules section with `.features.md` acceptance rules

**PR Outcome**: `smithy.mark` accepts `.features.md` files as input and auto-selects a single feature for specification.

## Validation Plan

- [x] Build passes (`npm run build`)
- [x] Tests pass (`npm test`)
- [ ] Deploy to test repo with `smithy init` and verify `/smithy.mark` with a `.features.md` path auto-selects a feature
- [ ] Verify feature number targeting works (`/smithy.mark path 3`)
- [ ] Verify "all specc'd" table presentation
