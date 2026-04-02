## Code Review Protocol

Review the implementation diff against the plan, spec, and contracts.

### 1. Gather context

Read the changed files and the raw diff. Cross-reference each change against:
- The slice goal and task descriptions
- The spec requirements (`.spec.md`)
- The data model (`.data-model.md`) and contracts (`.contracts.md`)

### 2. Identify findings

Check for:
- **Missing tests** — behavior added without corresponding test coverage
- **Broken contracts** — implementation diverges from declared interfaces
- **Security issues** — injection, auth bypass, data exposure
- **Error handling gaps** — unhappy paths not covered
- **Naming inconsistencies** — conventions broken within the change
- **Scope creep** — changes beyond what the slice tasks require

### 3. Categorize each finding

| Category | Meaning | Action |
|----------|---------|--------|
| **Critical** | Breaks functionality, violates contracts, security risk, missing required behavior | Must fix before PR |
| **Important** | Suboptimal implementation, missing edge cases, test gaps | Should fix, can note if non-trivial |
| **Minor** | Style, naming nits, minor improvements | Note in PR only |

### 4. Auto-fix triage

Apply fixes automatically when confidence is high. Escalate when uncertain.

| Severity | Confidence | Action |
|----------|------------|--------|
| Critical | High | Auto-fix, commit, note in PR |
| Critical | Low | **Stop and ask the user** |
| Important | High | Auto-fix, commit |
| Important | Low | Note in PR, flag for reviewer |
| Minor | Any | Note in PR only — never auto-fix |

After each auto-fix, re-run the test suite to verify no regressions.

### 5. Report findings

Present a structured summary:
- Findings table: file path, line reference, category, description, resolution
- Auto-fixes applied (with commit SHAs)
- Remaining items for PR description or reviewer attention