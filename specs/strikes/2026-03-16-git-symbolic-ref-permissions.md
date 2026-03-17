# Strike: Fix git permission gaps (symbolic-ref + bare push)

**Date:** 2026-03-16  |  **Branch:** strike/git-symbolic-ref-permissions  |  **Status:** Complete

## Summary

The smithy.forge workflow instructs the agent to run `git symbolic-ref` to discover the default branch, but this command is not in the pre-packaged permissions. Similarly, bare `git push` (no arguments) is blocked despite push-with-args being allowed. This strike adds both commands to the allow list and adds deny rules for the destructive `git symbolic-ref --delete` variant.

## Approach

Single file change in `src/permissions.ts`:
- Add `"symbolic-ref": ["*"]` to the `git` permissions block
- Add `"push": []` to the `git` permissions block (bare push)
- Add `"git symbolic-ref --delete *"` and `"git symbolic-ref -d *"` to `denyPermissions`

## Tasks

- [x] Task 1: Add `symbolic-ref` and bare `push` to allowed git permissions
- [x] Task 2: Add `symbolic-ref --delete` deny rules
- [x] Task 3: Build and verify

## Decisions

- Keep `symbolic-ref` wildcard-allowed but deny the `--delete` and `-d` variants since deleting refs (e.g. HEAD) is destructive.
- Bare `git push` is safe to allow — it only pushes the current branch to its already-configured upstream.
- No changes needed outside `permissions.ts`; deployment logic propagates automatically.

## Notes

- Resolves GitHub issues #11 and #12
