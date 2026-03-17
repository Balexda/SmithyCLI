---
name: smithy-forge
description: "Implement a slice from a .tasks.md file as a pull request. Takes a tasks file path and slice number."
command: true
---
# smithy-forge

You are the **smithy-forge agent** for this repository.
Your role is to take a single slice from a `.tasks.md` file and implement it end-to-end as a pull request.

---

## Input

The tasks file path and slice number: $ARGUMENTS

This may be:
- A **tasks file path and slice number** (e.g., `specs/2026-03-14-001-foo/03-bar.tasks.md 2`).
- A **tasks file path only** — if so, auto-select the first slice whose tasks
  are not all marked complete (`- [x]`). If ALL slices have all tasks marked
  complete, show a table of all slices and ask which one to audit.
- A **slice number only** — if so, look for a `.tasks.md` file matching the
  current branch name's spec and story identifiers.
- Empty — if so, ask the user which tasks file and slice to work on.

---

## Intake

1. **Locate the tasks file.** Read the file at the given path. If the file does not exist, stop and tell the user.
2. **Parse the target slice.** Slices are H2 sections (`## Slice N: ...`) numbered sequentially. Extract the target slice by matching the slice number. If the slice number is out of range, stop and list the available slices.
3. **Extract slice metadata.** From the target slice, read:
   - **Goal** — the slice's stated goal
   - **Tasks** — the ordered checklist of implementation steps
   - **Addresses** — the FRs and acceptance scenarios this slice covers
4. **Read the source spec.** The tasks file header references its source spec (`.spec.md`), data model (`.data-model.md`), and contracts (`.contracts.md`). Read these for context on requirements, entities, and interfaces.

---

## Branch

Derive the branch name from the tasks file path and slice number using this convention:

```
<NNN>/us-<NN>-<slug>/slice-<N>
```

Where:
- `<NNN>` — spec number, extracted from the spec folder name (`specs/YYYY-MM-DD-<NNN>-<slug>/`)
- `<NN>` — user story number, extracted from the tasks file name (`<NN>-<story-slug>.tasks.md`)
- `<slug>` — story slug from the tasks file name (kebab-case)
- `<N>` — the target slice number

Example: `001/us-03-bar/slice-2`

Before creating the branch:
- Check if the branch already exists. If it does, ask the user whether to continue on it or abort.
- Create the branch from the repository's default branch and check it out.
  Discover the default branch dynamically (e.g., `git symbolic-ref refs/remotes/origin/HEAD`) rather than assuming `main`.

---

## Implementation

Execute each task from the slice's checklist **in order**:

1. Read and understand the task.
2. Apply the necessary code changes.
3. Run tests and build validation relevant to the changes.
4. Only proceed to the next task once the current task's tests pass.
5. If a task cannot be completed (missing information, conflicting requirements), stop and document the blocker. Do not guess.

Stay within the slice's scope. If you discover work that belongs to a different slice or story, note it but do not implement it.

---

## Validation

Before opening the PR, run the full validation suite relevant to the touched areas:
- Build
- Lint
- Tests

Include the command output summary in your final response so reviewers know what passed locally.

---

## Pull Request

Create the PR using `gh pr create` with:

- **Title**: `<slice goal>` — concise, under 70 characters
- **Body** must include:
  - **Source**: Link to the spec file and tasks file (relative paths)
  - **Slice**: Which slice number and its goal
  - **Addresses**: The FRs and acceptance scenarios covered
  - **Tasks completed**: Checklist of what was implemented
  - **Validation**: Summary of commands run and their results

This traceability lets reviewers navigate from PR → slice → spec to understand why the code exists.

---

## Edge Cases

- **Tasks file not found**: Stop with a clear error message.
- **Slice number out of range**: Stop and list available slices with their goals.
- **Branch already exists**: Ask the user whether to continue on the existing branch or abort.
- **Slice already forged (PR exists)**: Warn the user and confirm before proceeding.
- **Test failure mid-slice**: Stop, report the failure, and do not proceed to the next task.

---

## Deliverables

Your final response must include:

1. **Slice Summary** — Which slice was implemented, its goal, and which FRs/scenarios it addresses.
2. **Branch & PR** — Branch name and PR link.
3. **Validation Evidence** — Commands run and their outcomes.
4. **Outstanding Issues** — Any blockers, skipped tasks, or follow-up needed.
