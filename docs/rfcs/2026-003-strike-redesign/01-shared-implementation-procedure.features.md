# Feature Map: Shared Implementation Procedure

**Source RFC**: `docs/rfcs/2026-003-strike-redesign/strike-redesign.rfc.md`
**Milestone**: 1 — Shared Implementation Procedure
**Created**: 2026-11-22

## Features
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

### Feature 1: Shared Procedure With Forge Parity

```yaml
kind: backend
```

**Description**: Give forge and strike one canonical implementation, review, documentation-check and validation procedure. The procedure accepts the progress record and review targets as inputs so callers can supply either kind of plan.

**User-Facing Value**: Template authors can maintain the procedure in one place. Teams can continue forging existing task slices and strike plans with their established behavior.

**Scope Boundaries**:
- Includes extracting the shared procedure from forge, retaining forge's own slice completion check and story completion cascade against the tracked checklist, and verifying that the procedure has one canonical definition that callers compose in accordance with INV-1 and passes template lint.
- Includes automated before-and-after comparison of forge's deployed instructions on Claude, Gemini and Codex. Verify existing `.strike.md` plans still forge to pull requests with the same slices, commits and checklist flips, and existing `.tasks.md` slices still forge as before. Verify that an unchecked tracked task at branch HEAD blocks slice completion.
- Excludes the strike command rewrite and changes to forge behavior.

### Feature 2: Implementation From an Untracked Working Plan

```yaml
kind: backend
```

**Description**: Give `smithy-implement`, `smithy-implementation-review` and `smithy-maid` an explicitly selectable untracked-plan form. The working plan records task progress, and the code-and-test commit is the evidence for task success.

**User-Facing Value**: Strike can reuse the implementation agents while keeping its working plan out of the change that reviewers receive.

**Scope Boundaries**:
- Includes verifying that `smithy-implement` reports success when the code-and-test commit lands without a checkbox flip. Prevent and verify against staging or committing the plan in any sub-agent commit, including through a forced add.
- Includes making the request and working plan authoritative for `smithy-maid` and the working plan's task brief authoritative for `smithy-implementation-review`. Test that forge never selects the untracked-plan form on Claude, Gemini or Codex in any forge mode.
- Excludes strike's integration with the shared procedure, management of the working plan's lifecycle, and the context-limited result judges.

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

_None — no specification debt was recorded._

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| F1 | Shared Procedure With Forge Parity | — | — |
| F2 | Implementation From an Untracked Working Plan | — | — |

F1 can verify parity using forge's tracked-checklist form. F2 can validate the untracked-plan form at the agent boundary. Strike brings the two together in Milestone 3.

## Cross-Milestone Dependencies
<!-- audience: reviewer; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

| Dependency | Direction | Notes |
|------------|-----------|-------|
| Milestone 3: Interactive Strike From Idea to Pull Request | depended upon by | Strike composes the shared procedure and selects the untracked-plan form. |
