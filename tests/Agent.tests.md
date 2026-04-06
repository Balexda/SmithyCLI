# Agent Tests (Claude Code session)

Run these in a Claude Code session with access to the SmithyCLI repo. These can also be delegated to a Claude agent.

---

## A1: Init deploys visible prompts and commands

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

## A2: Slash commands are invocable

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

## A3: Permissions in settings.json are enforced

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

## A4: Stale artifact cleanup on re-init

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

## A5: Sub-agent output structure (smithy-plan)

**Purpose**: Verify that smithy-plan produces output matching its documented structure when given a non-code planning context (feature map), confirming the generic output format works across artifact types.

**Steps**:
1. Build and deploy the latest templates:
   ```bash
   npm run build
   node dist/cli.js update -d /path/to/SmithyCLI
   ```
2. Invoke smithy-plan as a sub-agent (or via a general-purpose agent acting as smithy-plan) with this input:
   - **Planning context**: feature map artifact
   - **Feature description**: a multi-feature request (e.g., "Add multi-agent support to SmithyCLI")
   - **Codebase file paths**: 3-5 relevant source files
   - **Scout report**: none
   - **Additional planning directives**: none
3. Inspect the returned output.

**Expected**:
- [ ] Output starts with `## Plan` header
- [ ] Contains `**Directive**:` and `**Artifact type**:` metadata (artifact type reflects "feature map")
- [ ] Has exactly 4 sections: `### Approach`, `### Decisions`, `### Risks`, `### Tradeoffs`
- [ ] Does **not** contain `### Task Breakdown` or `### Architecture Decisions`
- [ ] Approach describes feature groupings/boundaries (not code changes)
- [ ] Decisions table has columns: `Decision | Alternatives | Rationale`
- [ ] Risks table has columns: `Risk | Likelihood | Mitigation`
- [ ] Tradeoffs table has columns: `Alternative | Pros | Cons | Directive relevance`
- [ ] References concrete elements (file paths, function names, entities) rather than generic advice
