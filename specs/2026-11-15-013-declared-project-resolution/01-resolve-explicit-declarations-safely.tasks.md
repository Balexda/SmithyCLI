# Tasks: Resolve explicit declarations safely

**Source**: `specs/2026-11-15-013-declared-project-resolution/declared-project-resolution.spec.md` — User Story 1
**Data Model**: `specs/2026-11-15-013-declared-project-resolution/declared-project-resolution.data-model.md`
**Contracts**: `specs/2026-11-15-013-declared-project-resolution/declared-project-resolution.contracts.md`
**Story Number**: 01

---

## Slice 1: Resolve explicit project declarations
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Give CLI consumers a shared, read-only resolver for explicit project declarations and their refusal outcomes.

**Justification**: The slice delivers the full path from invocation and artifact inputs to a named-store selection or refusal, independently of repository inheritance and candidate enumeration.

**Addresses**: FR-001–FR-004 and the read-only policy in FR-007. AS 1.1–1.7.

### Tasks

- [x] **Read the supplied artifact's project declaration**

  Add artifact metadata reading at the shared CLI project boundary described in the Contracts. Apply the Declaration normalization rules from the Data Model and cover AS 1.2, 1.6, and 1.7.

  _Acceptance criteria:_
  - The reader returns one normalized, case-preserved declaration or an absent result.
  - Only document-level metadata in the supplied artifact is eligible. The reader does not search parent artifacts or directories.
  - Read failures and malformed or duplicate headers identify the input artifact. A syntactically well-formed header containing an invalid slug reaches declaration validation.

- [x] **Resolve declarations against the named project store**

  Complete the explicit branch of the shared CLI project policy using the Project Outcome and State Transitions in the Data Model. Build on the existing safe-segment validation and project-root conventions in `src/engraved/roots.ts` and cover AS 1.1–1.7 at the resolver boundary.

  _Acceptance criteria:_
  - An artifact refusal takes precedence over declaration validation. Validate supplied declarations before comparing them or checking directory existence, preserving option presence even for an empty value.
  - Selection and refusal outcomes retain the provenance required by the Contracts, including both declarations for a case-sensitive conflict.
  - Store existence depends on the named path being a directory. Selection and refusal perform no writes and leave record scope untouched.
  - With neither declaration, the resolver returns the undeclared result for this increment. Repository inheritance and candidate enumeration are added by the dependent stories.

**PR Outcome**: Shared helper callers can select an explicitly declared project or receive a source-specific refusal for every US1 scenario.

---

## Specification Debt

_None — no specification debt was recorded._

---

## Open Implementation Questions

_None — no open implementation questions._

---

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Resolve explicit project declarations | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| User Story 2: Inherit the repository identity | depended upon by | Extends the resolver's undeclared branch with external repository inheritance. |
| User Story 3: Report undeclared candidates consistently | depended upon by | Extends the shared policy with enumeration and candidate outcomes and brings the CLI helper consumers onto it. |
