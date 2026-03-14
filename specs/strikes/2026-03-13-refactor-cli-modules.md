# Strike: Refactor cli.ts into Single-Responsibility Modules

**Date:** 2026-03-13  |  **Branch:** strike/refactor-cli-modules  |  **Status:** In Progress

## Summary

Break the monolithic `src/cli.ts` (307 lines) into focused modules following single responsibility principle. Each module handles one concern: CLI wiring, user interaction, template processing, agent-specific deployment (including permissions formatting), and shared utilities.

## Approach

Split `src/cli.ts` into these files:

| File | Responsibility |
|------|---------------|
| `cli.ts` | Entry point — Commander setup, command registration, `program.parse()` |
| `commands/init.ts` | `init` command handler — orchestrates the init flow |
| `commands/uninit.ts` | `uninit` command handler — orchestrates the uninit flow |
| `interactive.ts` | Inquirer prompt functions (agent selection, confirm, target dir input) |
| `templates.ts` | Reading base template files, parsing/stripping frontmatter |
| `agents/gemini.ts` | Deploy/remove Gemini skills + write Gemini permissions config |
| `agents/claude.ts` | Deploy/remove Claude prompts/commands + write Claude permissions config |
| `agents/codex.ts` | Deploy/remove Codex prompts + write Codex permissions config (TOML) |
| `permissions.ts` | Canonical nested permissions data structure |
| `utils.ts` | `copyDirSync`, `removeIfExists`, shared path constants |

The permissions structure is nested by base command (e.g., `git.status`, `gh."pr create"`), and each agent file flattens it into the agent's specific config format.

## Tasks

- [ ] Task 1: Create `utils.ts` with shared fs helpers and path constants
- [ ] Task 2: Create `permissions.ts` with the nested permissions structure
- [ ] Task 3: Create `templates.ts` with template reading and frontmatter logic
- [ ] Task 4: Create `interactive.ts` with Inquirer prompt functions
- [ ] Task 5: Create `agents/gemini.ts`, `agents/claude.ts`, `agents/codex.ts` with deploy/remove/permissions logic
- [ ] Task 6: Create `commands/init.ts` and `commands/uninit.ts` orchestrators
- [ ] Task 7: Slim down `cli.ts` to just Commander wiring
- [ ] Task 8: Build and verify with `npm run build` and `npm run typecheck`

## Decisions

- Permissions defined once in nested object structure in `permissions.ts`; each agent flattens to its own format.
- `interactive.ts` (not `prompts.ts`) to avoid confusion with agent prompt templates.
- Agent files own both template deployment AND permissions file writing for their agent.
- `commands/` directory (already exists) used for init/uninit orchestrators.

## Notes

- `tsup` bundles from a single entry point (`src/cli.ts`), so all new modules are pulled in via imports — no build config change needed.
- The `__dirname`-based template path resolution must be centralized in `utils.ts` to work correctly from any import depth.
