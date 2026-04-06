# Human Tests (Interactive terminal)

These require a real terminal with interactive input. They cannot be automated because the CLI uses Inquirer prompts that do not accept piped stdin.

---

## H1: Interactive agent selection

**Purpose**: Verify the agent selection prompt works and deploys only the chosen agent.

**Steps**:
1. Run `node dist/cli.js init` (no flags)
2. Select **Claude** from the menu
3. Accept defaults for remaining prompts

**Expected**:
- [ ] Agent selection menu shows all 4 options (Gemini CLI, Claude, Codex, All)
- [ ] Only `.claude/prompts/` and `.claude/commands/` are created
- [ ] No `.gemini/` or `tools/codex/` directories exist

---

## H2: Interactive permissions prompt (decline)

**Purpose**: Verify declining permissions skips settings.json creation.

**Steps**:
1. Run `node dist/cli.js init`
2. Select any agent
3. When prompted for permissions, select **None**
4. Accept defaults for remaining prompts

**Expected**:
- [ ] No `.claude/settings.json` (or equivalent agent config) is created
- [ ] Prompts/commands are still deployed normally

---

## H3: Interactive target directory with custom path

**Purpose**: Verify the target directory prompt accepts a custom path.

**Steps**:
1. Run `node dist/cli.js init`
2. Accept defaults until the target directory prompt
3. Enter a custom path (e.g., `/tmp/custom-target`)

**Expected**:
- [ ] Artifacts are deployed to the custom path, not `cwd`
- [ ] `.gitignore` is created in the custom path

---

## H4: Interactive uninit confirmation (decline)

**Purpose**: Verify declining the uninit confirmation aborts without changes.

**Steps**:
1. First, initialize: `node dist/cli.js init -y -d /tmp/smithy-test`
2. Run `node dist/cli.js uninit -d /tmp/smithy-test`
3. Answer **No** to the confirmation prompt

**Expected**:
- [ ] Output shows "Operation cancelled."
- [ ] All previously deployed files remain untouched
- [ ] `.claude/settings.json` is intact
