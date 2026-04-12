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

---

## A6: smithy-clarify promotes Critical+High items to assumptions

**Purpose**: Verify that smithy-clarify treats Critical+High-confidence candidates as `[Critical Assumption]` assumptions rather than interactive questions.

**Steps**:
1. Build and deploy the latest templates:
   ```bash
   npm run build
   node dist/cli.js update -d /path/to/SmithyCLI
   ```
2. Invoke smithy-clarify as a sub-agent (or via a general-purpose agent acting as smithy-clarify) with this input:
   - **Criteria**: standard clarify categories (Functional Scope, Domain & Data Model, etc.)
   - **Context**: "Add payment processing to the checkout flow. Payment data must be stored securely and comply with PCI-DSS. Support Stripe and PayPal as providers."
   - **Special instructions**: none
3. Inspect the returned output.

**Expected**:
- [ ] The item about PCI-DSS compliance or data storage (Critical impact, High confidence) appears in the **assumptions list**, not in the questions list
- [ ] That assumption carries a `[Critical Assumption]` annotation in the format `[Impact: Critical · Confidence: High]`
- [ ] No Critical+High item appears as an interactive question
- [ ] Non-High-confidence items (if any) remain in the questions section

---

## A7: smithy-clarify produces debt items for Medium/Low-confidence candidates

**Purpose**: Verify that smithy-clarify's two-category triage routes
Medium/Low-confidence candidates into `debt_items` (with structured metadata)
rather than into an interactive Questions list.

**Steps**:
1. Build and deploy the latest templates:
   ```bash
   npm run build
   node dist/cli.js update -d /path/to/SmithyCLI
   ```
2. Invoke smithy-clarify as a sub-agent (or via a general-purpose agent acting
   as smithy-clarify) with this input:
   - **Criteria**: standard clarify categories (Functional Scope, Domain &
     Data Model, Non-Functional, Integration & Dependencies, Edge Cases,
     Scope Edges)
   - **Context**: a feature description that yields candidates at mixed
     confidence levels — some clear/High-confidence items and at least two
     ambiguous domain terms or unresolved integration details that should
     land at Medium or Low confidence.
   - **Special instructions**: none
3. Inspect the returned output.

**Expected**:
- [ ] High-confidence items appear in the assumptions list
- [ ] Medium and Low-confidence items appear in a `debt_items` list with
      structured columns: ID (SD-NNN), Description, Source Category, Impact,
      Confidence, Status (`open`)
- [ ] Each debt item has a sequential SD-NNN identifier starting at SD-001
- [ ] No `### Questions` section appears in the output
- [ ] The return summary includes `bail_out` (boolean) and
      `bail_out_summary` (string, populated only when `bail_out` is true)

---

## A8: mark spec artifact contains a populated Specification Debt section

**Purpose**: Verify that smithy.mark threads clarify's `debt_items` into the
spec's `## Specification Debt` section with correct placement and structure.

**Steps**:
1. Build and deploy the latest templates:
   ```bash
   npm run build
   node dist/cli.js update -d /path/to/SmithyCLI
   ```
2. Invoke smithy.mark (or a general-purpose agent acting as smithy.mark) with
   a feature description that includes at least one ambiguous domain term
   that will register as a Medium-confidence candidate in clarify's triage.
3. Inspect the produced `.spec.md` file.

**Expected**:
- [ ] The spec file contains a `## Specification Debt` section
- [ ] The `## Specification Debt` heading appears between `## Assumptions`
      and `## Out of Scope`
- [ ] At least one structured debt item is present with columns: ID,
      Description, Source Category, Impact, Confidence, Status, Resolution
- [ ] Each item's ID follows the `SD-NNN` format (sequential from SD-001)
- [ ] Open items have Resolution set to `—`

---

## A9: cut tasks artifact inherits debt from the upstream spec

**Purpose**: Verify that smithy.cut inherits `## Specification Debt` items
from the source spec and carries them forward into the generated tasks file
with the correct origin annotation and status.

**Steps**:
1. Build and deploy the latest templates:
   ```bash
   npm run build
   node dist/cli.js update -d /path/to/SmithyCLI
   ```
2. Prepare a spec folder where `<slug>.spec.md` contains a
   `## Specification Debt` section with at least one item whose status is
   `open` (e.g., `SD-001 | <description> | Domain & Data Model | Medium |
   Medium | open | —`).
3. Invoke smithy.cut (or a general-purpose agent acting as smithy.cut) on
   that spec and user story.
4. Inspect the produced `<NN>-<story-slug>.tasks.md` file.

**Expected**:
- [ ] The tasks file contains a `## Specification Debt` section
- [ ] The upstream debt item appears in the tasks file's debt table
- [ ] The inherited item's Description is prefixed with
      `inherited from spec: <original SD-NNN description>`
- [ ] The inherited item's Status is `inherited` (not `open`)
- [ ] The Resolution column remains `—` for the inherited item
