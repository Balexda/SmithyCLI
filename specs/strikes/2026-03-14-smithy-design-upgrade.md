# Strike: Smithy Design Upgrade

**Date:** 2026-03-14  |  **Branch:** strike/smithy-design-upgrade  |  **Status:** Complete

## Summary

Rewrite `smithy.design` from a milestone-oriented RFC-to-feature-plan converter into a spec-oriented design command. The new command accepts either a direct feature description or an RFC path, runs structured one-at-a-time clarifications, and produces a spec folder (`specs/<date>-<NNN>-<slug>/`) containing `<slug>.spec.md`, `<slug>.data-model.md`, and `<slug>.contracts.md`. User stories are the primary organizational unit, ready for downstream task decomposition.

## Approach

Rewrite `src/templates/base/smithy.design.md` with `command: true` frontmatter. The new prompt has 7 phases: Intake (parse input, create branch + folder), Clarify (taxonomy scan, 1-at-a-time questions with recommendations), Specify (user stories, requirements, edge cases), Model (data entities), Contract (interfaces/APIs), Review (present for approval), and Repeat=Audit (self-audit on re-run).

## Tasks

- [x] Task 1: Rewrite `src/templates/base/smithy.design.md` with the new prompt
- [x] Task 2: Build and verify the template deploys correctly
- [x] Task 3: Update strike document status

## Decisions

- Clean replacement of old smithy.design — no backward compatibility with milestone-based output.
- Branch name matches spec folder name: `<YYYY-MM-DD>-<NNN>-<slug>`.
- Accepts both direct feature descriptions and RFC paths as input.
- Clarifications presented one at a time with recommended answers (spec-kit style).
- Downstream command left generic ("ready for task decomposition") — naming TBD.
- Data-model and contracts files included even when N/A (with minimal note).

## Notes

- This will break the existing pipeline flow diagram in README.md — that's intentional and will be revisited after this command works.
- `smithy.slice` and other downstream commands that expected `docs/feature-plan/` will need updates separately.
