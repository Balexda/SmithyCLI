## TDD Protocol

For each task, follow the **red-green-refactor** cycle:

### 1. Red — Write a failing test

Write a test that captures the behavior this task adds or changes. Run the test
suite and verify the new test **fails**. If it passes already, your test is not
testing the right thing — rewrite it.

> **Structural tasks** (adding config files, scaffolding directories, updating
> docs, wiring imports): skip the Red phase and proceed directly to
> implementation + validation. Not every task produces testable behavior.

### 2. Green — Write the minimal implementation

Write the **minimum code** needed to make the failing test pass. Do not
over-engineer or add behavior beyond what the test requires. Run the test suite
and verify the new test **passes** and no existing tests have broken.

### 3. Refactor — Clean up

If the implementation introduced duplication, unclear naming, or structural
issues, clean it up now. Run the full test suite again to confirm nothing broke.

### 4. Commit

Stage the test and implementation together and commit with a concise, descriptive
message that summarizes *what* was accomplished (not "add test" — describe the
behavior).

### 5. Mark the task complete

Update the task checkbox from `- [ ]` to `- [x]` in the tasks or strike file.
Include this edit in the implementation commit.

---

**Important constraints:**
- Do **not** mark a task complete until tests pass.
- If tests fail, fix the issue before proceeding to the next task.
- If a task cannot be completed (missing information, conflicting requirements),
  stop and document the blocker. Do not guess.