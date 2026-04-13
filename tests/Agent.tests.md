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

**Purpose**: Verify that smithy-clarify's two-category triage routes High-confidence candidates into assumptions and Medium/Low-confidence candidates into structured debt items, with no Questions category present.

**Steps**:
1. Build and deploy the latest templates:
   ```bash
   npm run build
   node dist/cli.js update -d /path/to/SmithyCLI
   ```
2. Invoke smithy-clarify as a sub-agent (or via a general-purpose agent acting as smithy-clarify) with a context that will produce candidates at mixed confidence levels. For example:
   - **Criteria**: standard clarify categories (Functional Scope, Domain & Data Model, etc.)
   - **Context**: "Add an activity log feature to the app. It should capture user actions and store them for analytics. The storage mechanism, retention policy, and privacy controls are unspecified."
   - **Special instructions**: none
3. Inspect the returned summary.

**Expected**:
- [ ] High-confidence candidates appear in the `assumptions` list
- [ ] Medium/Low-confidence candidates appear in the returned `debt_items` structure with the full column set: ID (SD-NNN), Description, Source Category, Impact, Confidence, Status (`open`), Resolution (`—`)
- [ ] No `### Questions` section or "questions" category appears anywhere in the returned output
- [ ] The returned summary contains `bail_out` (boolean) and, when `bail_out: true`, a `bail_out_summary` guidance string

---

## A8: mark spec artifact contains a populated `## Specification Debt` section

**Purpose**: Verify that `smithy.mark` produces a spec file whose `## Specification Debt` section is positioned between `## Assumptions` and `## Out of Scope` and is populated with at least one structured debt item when the feature description contains ambiguity.

**Steps**:
1. Build and deploy the latest templates:
   ```bash
   npm run build
   node dist/cli.js update -d /path/to/SmithyCLI
   ```
2. In a test repo, invoke `/smithy.mark` with a feature description that includes at least one ambiguous domain term whose confidence will triage as Medium (e.g., "Add a notification center that surfaces relevant updates to the user"). The terms "notification center" and "relevant updates" should read as Medium confidence.
3. Let the command run through to Phase 3 (Specify) and inspect the written `.spec.md` file on disk.

**Expected**:
- [ ] The spec file contains a `## Specification Debt` heading
- [ ] `indexOf('## Specification Debt')` falls between `indexOf('## Assumptions')` and `indexOf('## Out of Scope')`
- [ ] The section contains at least one structured debt row with an `SD-NNN` ID, a description, a source category, Impact, Confidence, Status (`open`), and Resolution (`—`)

---

## A9: cut tasks artifact inherits debt from the upstream spec

**Purpose**: Verify that `smithy.cut` reads the source spec's `## Specification Debt` section during Phase 1 (Intake) and inherits each open item into the tasks file with `inherited` status and an origin annotation.

**Steps**:
1. Build and deploy the latest templates:
   ```bash
   npm run build
   node dist/cli.js update -d /path/to/SmithyCLI
   ```
2. Prepare a spec folder whose `.spec.md` has a `## Specification Debt` section with at least one row whose Status is `open`, for example:
   ```
   | SD-001 | Retention policy for activity log entries | Non-Functional Quality | High | Medium | open | — |
   ```
3. Invoke `/smithy.cut` on that spec (passing the spec folder path and a user story number).
4. Let the command run through to Phase 4 (Slice) and inspect the written `<NN>-<story-slug>.tasks.md` file on disk.

**Expected**:
- [ ] The tasks file contains a `## Specification Debt` heading
- [ ] The section contains a row corresponding to the upstream `SD-001` item
- [ ] The inherited row's Description cell is prefixed with `inherited from spec: ` followed by the original upstream description
- [ ] The inherited row's Status cell is `inherited` (not `open`)
- [ ] If cut's own clarify run produced new debt, those items appear as additional rows with Status `open` and SD-NNN IDs that continue numbering from where the inherited list leaves off
