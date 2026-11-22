# Tasks: Deploy the Baseline Reviewer Files

**Source**: `specs/2026-11-21-014-reviewer-baseline-deployment-and-setup-skill/reviewer-baseline-deployment-and-setup-skill.spec.md` — User Story 1
**Data Model**: `specs/2026-11-21-014-reviewer-baseline-deployment-and-setup-skill/reviewer-baseline-deployment-and-setup-skill.data-model.md`
**Contracts**: `specs/2026-11-21-014-reviewer-baseline-deployment-and-setup-skill/reviewer-baseline-deployment-and-setup-skill.contracts.md`
**Story Number**: 01

---

## Slice 1: Deploy and Manage Reviewer Baseline Files
<!-- audience: builder; mode: how-to; length: 5-15 steps; diagram: optional; examples: forbidden -->

**Goal**: Deliver the three whole-file reviewer rules through the CLI lifecycle.

**Justification**: A maintainer can install, refresh, and remove a working Copilot baseline in one increment. The same files provide the inputs for CodeRabbit registration.

**Addresses**: FR-001–FR-008, FR-018, FR-020, and FR-027 within the whole-file scope, plus AS 1.1–1.9.

### Tasks

- [ ] **Ship a portable reviewer baseline**

  Package the three Smithy-general files listed in data model §3 under `src/templates/`. Serve them through a baseline path shared by all agent selections, preserving the metadata in AS 1.9.

  _Acceptance criteria:_
  - The published package contains one deployment source per whole file.
  - Deployment copies the source bytes, including frontmatter, to the listed repository paths.
  - The review skill is exclusive to `.github/skills/` and has no same-name deployed agent skill.
  - CI applies the existing portability check to the baseline source and enforces byte parity with SmithyCLI's three reviewer files.
  - The repository's deployed-snapshot guidance records the whole-file parity exception.

- [ ] **Select and persist reviewer deployment on init**

  Wire the reviewer choice through `src/cli.ts`, the interactive prompts, and `src/commands/init.ts`. Record the choice and whole-file inventory through `src/manifest.ts` per C1 and C2.

  _Acceptance criteria:_
  - Repo-location init satisfies AS 1.1–1.3 with any supported agent selection, including Gemini alone.
  - User-location init satisfies AS 1.4. SD-001 tracks explicit opt-in at user location.
  - The manifest omits reviewer fields when off and uses the reserved `files.reviewers` key when on. Agent validation accepts this manifest.
  - Init reports the paths written and names each existing file whose bytes differ before replacement per FR-005 and C6.
  - Repeating init with identical inputs preserves the deployed bytes.

- [ ] **Replay reviewer settings and reconcile tracked files**

  Pass the saved reviewer choice from `src/commands/update.ts` through init and use manifest stale-file cleanup to reconcile the inventory. Share reconciliation with explicit disable on re-init.

  _Acceptance criteria:_
  - Update satisfies AS 1.5–1.6 and restores a tracked baseline file deleted between deployments.
  - Re-init with reviewers disabled satisfies AS 1.7 for whole files.
  - A manifest with a reviewer file inventory and an absent reviewer setting self-heals per C2.

- [ ] **Remove reviewer files and report dangling references**

  Extend the manifest-driven uninit path in `src/commands/uninit.ts` and `src/manifest.ts` for AS 1.8. Use the tracked reviewer paths to report dangling references in repository-layer review rules.

  _Acceptance criteria:_
  - Uninit removes tracked reviewer files and prunes empty directories per AS 1.8.
  - Repository-layer files keep their original bytes.
  - Uninit identifies the repository-layer files and removed reviewer paths for each dangling reference per FR-018 and C6.

**PR Outcome**: Repo init installs the whole-file baseline by default. Update refreshes installations that have it enabled, and disable or uninit removes tracked reviewer files.

---

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

| ID | Title | Source Category | Impact | Confidence | Origin |
|----|-------|-----------------|--------|------------|--------|
| SD-001 | explicit-reviewers-at-user-location | Interaction & UX | Medium | Medium | spec:SD-001 |

## Open Implementation Questions
<!-- audience: builder; mode: reference; length: one table row per question; diagram: optional; examples: discouraged -->

_None — no open implementation questions._

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: recommended; examples: discouraged -->

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Deploy and Manage Reviewer Baseline Files | — | — |

### Cross-Story Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| US2 | depended upon by | CodeRabbit registration consumes the baseline file inventory and frontmatter. US2 owns reconciliation and removal of its entries, including on disable. |
| US3 | depended upon by | The review block uses the baseline setting. US3 owns the block source, parity check, and marker lifecycle, including removal on disable. |
| US4 | depended upon by | Adoption builds on whole-file replacement and tracking and adds adoption-specific reporting. |
| US5 | depended upon by | Setup consumes the reviewer CLI and manifest contracts. |

### Cross-Repo Notes

None — single repo.
