# Strike: Language-Aware Permissions

**Date:** 2026-04-07  |  **Branch:** strike/language-permissions  |  **Status:** Ready

## Summary

Smithy currently deploys permissions for all language toolchains (npm, Gradle, Cargo) regardless of what the project actually uses. This makes permission configurations overly broad. This strike adds language auto-detection, an interactive selection prompt, and a `--toolchains` CLI flag so only relevant toolchain permissions are deployed.

## Goal

Deploy only the language toolchain permissions that match the project's actual technology stack, reducing permission scope while maintaining backward compatibility.

## Out of Scope

- Maven (`pom.xml`) detection or `mvn` permissions
- Recursive/monorepo scanning for marker files
- Replacing the permission merge logic in deployers (existing union-merge behavior preserved)
- Codex deployer updates (not exposed in CLI)

## Requirements

- **FR-001**: Auto-detect project languages by checking for marker files at the project root (package.json, build.gradle, Cargo.toml, pyproject.toml, etc.)
- **FR-002**: Present a checkbox prompt during interactive `smithy init` showing all toolchains with detected ones pre-selected
- **FR-003**: Add `--toolchains <list>` CLI flag for non-interactive/CI usage
- **FR-004**: Filter `flattenPermissions()` to include only universal + selected toolchain permissions
- **FR-005**: Store selected languages in the manifest for `smithy update` to replay
- **FR-006**: Add Python (pip/pytest) as a 4th supported toolchain
- **FR-007**: Preserve backward compatibility: `--yes` with no detection defaults to all toolchains; old manifests without `languages` field default to all

## Success Criteria

- **SC-001**: `flattenPermissions(['node'])` includes npm entries but excludes cargo, gradle, pip, pytest, python entries
- **SC-002**: `flattenPermissions([])` includes only universal permissions (git, filesystem, text processing, gh, misc)
- **SC-003**: `flattenPermissions()` (no args) includes all permissions (backward compat)
- **SC-004**: `detectLanguages()` correctly identifies toolchains from marker files
- **SC-005**: `--toolchains node,python` deploys only npm + Python permissions
- **SC-006**: All existing tests continue to pass
- **SC-007**: Python permissions (pip, pytest, python) are included in the permission definitions

## User Flow

1. User runs `smithy init`
2. After selecting agent, location, and confirming permissions: Smithy scans the project root for language marker files
3. A checkbox prompt shows all toolchains (Node.js, Java/Kotlin, Rust, Python) with detected ones pre-checked
4. User confirms or adjusts selection
5. Only selected toolchain permissions are deployed to settings.json
6. Selection is stored in the manifest for future `smithy update`

Alternative: `smithy init --toolchains node,python` skips the prompt and deploys only those toolchains.

## Data Model

Manifest gains an optional `languages` field:
```json
{
  "version": 1,
  "languages": ["node", "python"],
  ...
}
```

## Contracts

- `flattenPermissions(languages?: LanguageToolchain[]): string[]` — new optional parameter
- `buildClaudeAllowList(languages?: LanguageToolchain[]): string[]` — forwards to flattenPermissions
- `buildGeminiAllowList(languages?: LanguageToolchain[]): string[]` — forwards to flattenPermissions
- `detectLanguages(targetDir: string): LanguageToolchain[]` — new function
- `promptToolchains(detected: LanguageToolchain[]): Promise<LanguageToolchain[]>` — new prompt

## Decisions

- **Filter at flatten time** rather than restructuring the permissions object — minimal diff, backward compatible
- **Separate `language-detect.ts` module** — fits codebase pattern of single-purpose files
- **`--toolchains` CLI flag** — consistent with existing `--agent`, `--location`, `--permissions` flags
- **Gradle markers only** (no pom.xml) — per user preference, avoids confusion about missing Maven permissions
- **Python added** as 4th toolchain — per user preference
- **`--yes` defaults to all when none detected** — preserves current CI behavior

## Single Slice

**Goal**: Ship language detection, toolchain selection prompt, permission filtering, Python toolchain, `--toolchains` flag, and manifest storage as a single coherent change.

**Justification**: All pieces are interdependent — detection feeds the prompt, the prompt feeds the filter, the filter feeds the deployers, and the manifest stores the result for updates.

### Tasks

- [x] Task 1: Add toolchain metadata map and Python permissions to `permissions.ts`; modify `flattenPermissions()` to accept optional language filter
- [x] Task 2: Create `src/language-detect.ts` with `detectLanguages()` function
- [x] Task 3: Add `promptToolchains()` checkbox prompt to `interactive.ts`
- [x] Task 4: Wire detection and prompt into `init.ts` init flow
- [x] Task 5: Thread language filter through Claude and Gemini deployers
- [x] Task 6: Add optional `languages` field to manifest schema
- [x] Task 7: Update `update.ts` to forward manifest languages to init
- [x] Task 8: Add `--toolchains <list>` CLI flag with validation
- [x] Task 9: Write tests for detection, permission filtering, and Python permissions

**PR Outcome**: `smithy init` detects project languages, prompts for confirmation, and deploys only relevant toolchain permissions. Python is supported as a new toolchain. `--toolchains` flag enables scriptable usage.

## Validation Plan

- [x] `npm run typecheck` passes with no errors
- [x] `npm test` — all 185 tests pass (existing + new)
- [x] `npm run build` compiles successfully
- [ ] Manual: `node dist/cli.js init` in a Node.js project auto-detects Node.js and shows checkbox
- [ ] Manual: `node dist/cli.js init --toolchains node,python` deploys only npm + Python permissions
- [ ] Manual: `node dist/cli.js init -y` in empty dir deploys all toolchain permissions
