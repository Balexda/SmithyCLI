# Strike: Revamp smithy.patch → smithy.fix as action-oriented command

**Date:** 2026-03-13  |  **Branch:** strike/smithy-fix-command  |  **Status:** Complete

## Summary

Rename `smithy.patch` back to `smithy.fix` and rewrite it as a command-enabled (`command: true`) action-oriented prompt. The new `smithy.fix` is invoked as `/smithy.fix <error or CI link>`, triages complexity, fixes directly or gets approval first, auto-commits, runs tests, and pushes if the trigger was CI.

## Approach

- Delete `src/templates/base/smithy.patch.md`
- Create `src/templates/base/smithy.fix.md` with `command: true` frontmatter and a rewritten prompt
- No CLI code changes needed — `smithy init` already handles `command: true` templates

## Tasks

- [x] Task 1: Create `smithy.fix.md` with command-enabled frontmatter and action-oriented prompt
- [x] Task 2: Delete `smithy.patch.md`
- [x] Task 3: Build and verify
- [x] Task 4: Update references in smithy.forge, bug report template, and README

## Decisions

- Rename back to `fix` — it's the verb you reach for naturally
- No branch creation — fix runs on an existing branch with a failure
- No task/spec file output — just diagnose, fix, commit
- Auto-commit after fix, run tests, push if CI-triggered
- Reuse `gh run view` fast path from smithy.patch for CI log fetching

## Notes

- This is a template-only change, no CLI modifications required
