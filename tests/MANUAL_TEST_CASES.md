# Smithy Manual Test Cases

Pre-release checklist for tests that cannot be fully automated. Run these before publishing a new version.

Automated tests (`npm test`) cover unit and integration tests. The cases below cover agent-runtime and interactive-terminal scenarios that automated tests cannot reach.

---

## Agent Tests (Claude Code session)

Run these in a Claude Code session with access to the SmithyCLI repo. These can also be delegated to a Claude agent.

### A1: Init deploys visible prompts and commands

**Purpose**: Verify `smithy init` creates all expected files for Claude.

**Steps**:
```bash
cd /path/to/SmithyCLI
node dist/cli.js init -a claude --permissions repo -y -d /tmp/smithy-test
ls /tmp/smithy-test/.claude/prompts/
ls /tmp/smithy-test/.claude/commands/
head -3 /tmp/smithy-test/.claude/prompts/smithy.strike.md
```

**Expected**:
- [ ] 12 files in `.claude/prompts/` (all `smithy.*.md`)
- [ ] 9 files in `.claude/commands/` (only templates with `command: true`)
- [ ] No YAML frontmatter (`---`) at the top of any deployed file
- [ ] First line of each file is a markdown heading (e.g., `# smithy-strike`)

---

### A2: Slash commands are invocable

**Purpose**: Verify deployed commands are recognized by Claude Code as slash commands.

**Steps**:
1. Run `smithy init -a claude --permissions repo -y` in a test repo
2. Start a **new** Claude Code session in that repo (commands are loaded at session start)
3. Type `/smithy.strike "add a health check endpoint"`

**Expected**:
- [ ] `/smithy.strike` appears as a recognized command
- [ ] The prompt content is loaded and Claude begins the strike workflow
- [ ] `$ARGUMENTS` is replaced with the user's input text

> **Note**: Claude Code must be restarted to pick up new or changed commands.

---

### A3: Permissions in settings.json are enforced

**Purpose**: Validate the generated permissions file has correct structure and no security issues.

**Steps**:
```bash
node dist/cli.js init -a claude --permissions repo -y -d /tmp/smithy-test

cat /tmp/smithy-test/.claude/settings.json | node -e "
const config = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const allow = config.permissions.allow;
const deny = config.permissions.deny;

// 1. No destructive commands in allow list
const dangerous = ['rm', 'chmod', 'chown', 'kill', 'curl', 'xargs'];
const leaks = allow.filter(e => dangerous.some(d => e.match(new RegExp('\\\\b' + d + '\\\\b'))));
console.log('Dangerous in allow:', leaks.length === 0 ? 'NONE (PASS)' : leaks);

// 2. Required deny entries present
const requiredDeny = ['git branch -D', 'git reset --hard', 'git checkout --', 'git checkout .', 'git stash drop', 'git clean'];
const missing = requiredDeny.filter(d => !deny.some(e => e.includes(d)));
console.log('Missing deny entries:', missing.length === 0 ? 'NONE (PASS)' : missing);

// 3. Claude tool permissions
console.log('WebSearch:', allow.includes('WebSearch') ? 'PASS' : 'FAIL');
console.log('WebFetch:', allow.includes('WebFetch') ? 'PASS' : 'FAIL');
const hasSmithySkill = allow.some(e => e.startsWith('Skill(smithy.'));
console.log('Skill(smithy.*):', hasSmithySkill ? 'PASS' : 'FAIL');

// 4. No duplicates
console.log('Allow dupes:', allow.length - new Set(allow).size === 0 ? 'NONE (PASS)' : allow.length - new Set(allow).size);
console.log('Deny dupes:', deny.length - new Set(deny).size === 0 ? 'NONE (PASS)' : deny.length - new Set(deny).size);

// 5. No allow/deny conflicts
const conflicts = deny.filter(d => allow.includes(d));
console.log('Conflicts:', conflicts.length === 0 ? 'NONE (PASS)' : conflicts);
"
```

**Expected**:
- [ ] All checks print `PASS` or `NONE (PASS)`
- [ ] No dangerous commands leak into the allow list
- [ ] All required deny entries are present

---

### A4: Stale artifact cleanup on re-init

**Purpose**: Verify that renamed/deleted templates are cleaned up when init runs again.

**Steps**:
```bash
node dist/cli.js init -a claude --permissions repo -y -d /tmp/smithy-test

# Plant fake "old" artifacts
echo "# stale" > /tmp/smithy-test/.claude/prompts/smithy.oldname.md
echo "# stale" > /tmp/smithy-test/.claude/commands/smithy.oldname.md

# Re-run init
node dist/cli.js init -a claude --permissions repo -y -d /tmp/smithy-test

# Check
ls /tmp/smithy-test/.claude/prompts/smithy.oldname.md 2>/dev/null && echo "FAIL: stale prompt survived" || echo "PASS: stale prompt cleaned"
ls /tmp/smithy-test/.claude/commands/smithy.oldname.md 2>/dev/null && echo "FAIL: stale command survived" || echo "PASS: stale command cleaned"
```

**Expected**:
- [ ] Both stale files are removed
- [ ] All current templates are still present

---

## Human Tests (Interactive terminal)

These require a real terminal with interactive input. They cannot be automated because the CLI uses Inquirer prompts that do not accept piped stdin.

### H1: Interactive agent selection

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

### H2: Interactive permissions prompt (decline)

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

### H3: Interactive target directory with custom path

**Purpose**: Verify the target directory prompt accepts a custom path.

**Steps**:
1. Run `node dist/cli.js init`
2. Accept defaults until the target directory prompt
3. Enter a custom path (e.g., `/tmp/custom-target`)

**Expected**:
- [ ] Artifacts are deployed to the custom path, not `cwd`
- [ ] `.gitignore` is created in the custom path

---

### H4: Interactive uninit confirmation (decline)

**Purpose**: Verify declining the uninit confirmation aborts without changes.

**Steps**:
1. First, initialize: `node dist/cli.js init -y -d /tmp/smithy-test`
2. Run `node dist/cli.js uninit -d /tmp/smithy-test`
3. Answer **No** to the confirmation prompt

**Expected**:
- [ ] Output shows "Operation cancelled."
- [ ] All previously deployed files remain untouched
- [ ] `.claude/settings.json` is intact

---

## Cleanup

After running tests, clean up temp directories:
```bash
rm -rf /tmp/smithy-test /tmp/custom-target
```
