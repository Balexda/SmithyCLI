# Strike: Claude Permissions Overhaul

**Date:** 2026-03-13  |  **Branch:** strike/claude-permissions-overhaul  |  **Status:** Complete

## Summary

Fix Claude Code permissions output to use the correct file (`.claude/settings.json`) and schema (`{ permissions: { allow: ["Bash(...)"] } }`), expand the shared permission set to cover multi-language development (npm, gradle, cargo) with safe-by-default commands, add Claude-specific non-Bash tool permissions (WebSearch, WebFetch, Skill), and introduce tests for the claude agent module.

## Approach

1. Expand `src/permissions.ts` with comprehensive safe commands across git, filesystem, npm, gradle, cargo, and gh categories.
2. Fix `src/agents/claude.ts` to write `.claude/settings.json` with correct schema, wrapping commands in `Bash(...)` and adding non-Bash tool permissions. Add merge logic for existing settings files.
3. Set up vitest and write tests for `src/agents/claude.ts` covering permissions output format, file targeting, and merge behavior.

## Tasks

- [x] Task 1: Expand `src/permissions.ts` with comprehensive safe command list
- [x] Task 2: Fix `src/agents/claude.ts` — correct file, schema, Bash() wrapping, non-Bash tools, merge logic
- [x] Task 3: Set up vitest and add tests for claude.ts writePermissions
- [x] Task 4: Build, typecheck, and run tests to verify

## Decisions

- Allow `mv`, `sed`, `awk` — standard dev tools, not more dangerous than the file editing the agent already has.
- Exclude `node`, `npx` — too powerful for auto-approval; can run arbitrary code.
- Exclude destructive commands: `rm`, `git push --force`, `git branch -D`, `git reset --hard`, `git clean`, `chmod`, `chown`, `kill`.
- Use vitest for testing (ESM + TypeScript compatible out of the box).
- Claude-specific tool permissions: `WebSearch`, `WebFetch`, `Skill(smithy.*:*)`.

## Notes

- Gemini and Codex agents are not modified (their formats are already correct) but benefit from the expanded permission list automatically.
- The `Skill(smithy.*:*)` pattern may need adjustment if Claude Code doesn't support wildcards — verify at runtime.
