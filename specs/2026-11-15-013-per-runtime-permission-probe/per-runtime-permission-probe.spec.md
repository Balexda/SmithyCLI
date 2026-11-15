# Feature Specification: Per-Runtime Permission Probe

**Spec Folder**: `2026-11-15-013-per-runtime-permission-probe`
**Branch**: `2026-11-15-013-per-runtime-permission-probe`
**Created**: 2026-11-15
**Status**: Draft
**Input**: `docs/rfcs/2026-002-planning-artifact-location/planning-artifact-location.rfc.md` — Milestone 2 permission experiment.
**Source Feature Map**: `docs/rfcs/2026-002-planning-artifact-location/02-cli-mediated-store-commit.features.md` — Feature 1: Per-Runtime Permission Probe

## Clarifications
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

### Session 2026-11-15

| Topic | Settled interpretation |
|-------|------------------------|
| Deliverable | A reproducible experiment and evidence report, independent of the production query and write implementations. |
| Pass definition | Both operations execute unattended under subcommand-scoped grants containing no store location, and the write actually commits in the selected external store. |
| Failure | A failed runtime receives a new steering debt item after the experiment; empirical unknowns are not debt before execution (RFC Design Decisions). |
| Query ownership | Feature-map SD-001 is resolved: the first milestone needing the query grant emits it; this feature supplies evidence only. |

## Artifact Hierarchy
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| Level | Lineage |
|-------|---------|
| RFC | Planning Artifact Location Model |
| Milestone | M2: CLI-Mediated Store Commit |
| Feature | F1: Per-Runtime Permission Probe |
| Children | US1–US3 below; tasks remain uncut. |

## User Scenarios & Testing
<!-- audience: builder+ai-input; mode: reference; length: structured scenarios; diagram: optional; examples: optional -->

### User Story 1: Establish a Reproducible Probe (Priority: P1)

As a maintainer, I want isolated stand-in operations and a fixed pass definition so that the experiment measures permissions without waiting for unfinished commands.

**Why this priority**: Both runtime experiments need reproducible operations and controls.

**Independent Test**: Reproduce the recorded stand-in invocations in a disposable code checkout and external store without either production command existing.

**Acceptance Scenarios**:

1. **Given** neither production command exists, **When** the probe is prepared, **Then** a stand-in callable as `smithy` exposes separate query and write subcommands; the query returns the selected store and the write creates a local commit containing a fixture change in that store.
2. **Given** an isolated runtime configuration, **When** a candidate runs, **Then** the evidence records runtime version, platform, executable identity, working directory, effective permission and sandbox settings, literal command text, resulting argument tokens, outputs, rule decisions, approval observations, and before/after commit IDs.
3. **Given** a candidate subcommand grant, **When** an unrelated stand-in subcommand is evaluated, **Then** that grant does not authorize it; any broader pre-existing permission that would mask this result is absent from the isolated configuration.
4. **Given** Claude as the control, **When** both operations run with narrow path-free grants, **Then** their observed results are recorded with the same evidence, including any failure.

### User Story 2: Verify Gemini and Codex Execution (Priority: P1)

As a maintainer, I want live runtime evidence so that the write command's argument shape fits the permissions each runtime can use.

**Why this priority**: A matching rule does not establish that a sandbox permits an external-store write.

**Independent Test**: Re-run the candidate matrix from a code checkout and inspect the selected store's history and the code checkout's unchanged HEAD and index.

**Acceptance Scenarios**:

1. **Given** Gemini CLI and no store-path grant, **When** candidates run, **Then** the matrix covers positional and flag-based store arguments, tilde and absolute spellings, and the write's message and whole-store/selected-path flag variants; every claimed supported invocation executes without approval.
2. **Given** Codex token-prefix rules and no store-path grant, **When** the same candidate shapes run, **Then** each row records the exact argument tokens and matching decision, distinguishing a literal tilde passed to the stand-in from shell expansion.
3. **Given** Codex inside its recorded sandbox in a code checkout and a disposable store under the real home directory's `~/.smithy/` outside the checkout, **When** the write runs, **Then** a pass requires a real commit containing the expected fixture changes in that store without approval, sandbox bypass, or a store-specific writable-path setting; the code checkout's HEAD and index remain unchanged.
4. **Given** an allowed prefix whose execution prompts for approval or fails filesystem access, **When** the result is classified, **Then** it fails, and matching and execution outcomes are recorded separately.
5. **Given** a winning candidate, **When** the selected store changes to a second disposable Smithy store, **Then** the identical path-free rule permits both operations without configuration changes naming either store.

### User Story 3: Publish the Decision Evidence (Priority: P1)

As a maintainer, I want results for every runtime so that downstream work starts from demonstrated capabilities and explicit unresolved choices.

**Why this priority**: The feature map gates Feature 2 on these results.

**Independent Test**: From the report alone, identify each runtime's outcome, supporting execution, usable invocation shapes and grants, and unresolved choices.

**Acceptance Scenarios**:

1. **Given** a completed matrix, **When** results are published, **Then** Claude, Gemini CLI, and Codex each have a dated pass or fail result, including successful evidence, and every passing runtime names the exact supported invocation shapes and narrow path-free rules for query and write.
2. **Given** no candidate passes for a runtime, **When** its failure is recorded, **Then** one new Specification Debt item for that runtime names the unresolved choice between retaining its existing path-based grants and changing its execution or permission approach, with consequences and linked failure evidence.
3. **Given** unavailable runtime access or incomplete execution, **When** the report is reviewed, **Then** it labels the evidence incomplete, claims no pass, and does not declare the experiment complete or unblock Feature 2.
4. **Given** completed results, **When** downstream work starts, **Then** Feature 2 has evidenced command-shape input, Feature 3 has write-grant evidence, and the first query-grant consumer has query evidence, all recorded before Feature 2 begins.

### Edge Cases

- An approved query and denied write fail the runtime; preserve both operation outcomes.
- Broad ambient grants, elevated execution, or an unsandboxed Codex run invalidate a positive result.
- Literal and expanded tilde forms are separate observations, including home paths with spaces.
- Missing git identity or unrelated hook failures require fixture correction and rerun rather than a permission conclusion.
- Disposable fixtures must not modify existing user records, production permission files, or code-repository history.

## Dependency Order
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| US1 | Establish a Reproducible Probe | — | — |
| US2 | Verify Gemini and Codex Execution | US1 | — |
| US3 | Publish the Decision Evidence | US1, US2 | — |

## Requirements
<!-- audience: builder+ai-input; mode: reference; length: tables only; diagram: optional; examples: recommended -->

### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-001 | The experiment MUST use isolated stand-in query and write subcommands callable as `smithy`, without depending on Milestone 1 or Feature 2. |
| FR-002 | A pass MUST require both operations to run unattended under narrow path-free grants and a verified external-store commit containing the expected fixture changes. |
| FR-003 | Gemini and Codex MUST test positional/flag store arguments, tilde/absolute spellings, and message and whole-store/selected-path write flag variants; every candidate gets a recorded outcome. |
| FR-004 | Codex MUST demonstrate the external-home-store commit from inside its sandbox, distinguishing token-prefix authorization from filesystem access. |
| FR-005 | Grants MUST authorize only the tested subcommands, contain no store location, and work unchanged when the selected store changes. |
| FR-006 | The report MUST retain reproduction details, configuration, commands, logs, negative controls, commit evidence, and per-runtime results, including Claude as control and all passes. |
| FR-007 | Each failed runtime MUST receive its own new steering debt item after execution; unavailable or incomplete evidence MUST keep the experiment incomplete. |
| FR-008 | The result report MUST be recorded before Feature 2 starts and identify supported command shapes and grants for the downstream write and query consumers. |
| FR-009 | The experiment MUST leave production commands, deployed permission rules, and existing stores unchanged. |

## Assumptions
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| Assumption | Consequence |
|------------|-------------|
| Runtime access is required during execution. | Documentation or matcher tests cannot substitute for live evidence. |
| Results depend on runtime versions and configuration. | Record both; conclusions apply to the tested environment. |
| Repo-level D-3 and INV-3 govern downstream grants. | Record each runtime's native grammar and failures; exception-ledger changes belong to Feature 3. |
| No project level is named or available; no user-level records were found. | This specification uses repo-level engraved knowledge only. INV-1, INV-2 and P-1 require no template changes for this experiment. |

## Specification Debt
<!-- audience: reviewer; mode: reference; length: index table + 1-3 sentences per item; diagram: optional; examples: discouraged -->

_None — no specification debt was recorded._

## Out of Scope
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

| Exclusion | Owner |
|-----------|-------|
| Production query and write implementations | Milestone 1 and Feature 2 respectively |
| Emitting or retiring permission rules and INV-3 exception rows | Features 3 and 4 |
| Query-grant emission | First milestone needing it, per feature-map SD-001 |
| Forge store-identity experiment | Milestone 5 |
| Store migration, remote push, or existing user-data changes | Outside this experiment |

## Success Criteria
<!-- audience: reviewer; mode: reference; length: tables only; diagram: optional; examples: discouraged -->

### Measurable Outcomes

| ID | Outcome |
|----|---------|
| SC-001 | One reproducible report records dated query and write results for all three runtimes, including every pass and failure. |
| SC-002 | Every Gemini/Codex candidate combination has a recorded outcome; every passing runtime identifies exact supported shapes and path-free grants for both operations. |
| SC-003 | Every Codex pass includes a verified commit under the real `~/.smithy/` inside the sandbox, with no approval, bypass, store-specific access setting, or code-checkout HEAD/index change. |
| SC-004 | Every failed runtime has one linked steering debt item; incomplete evidence leaves the Feature 2 gate closed. |
| SC-005 | The report precedes Feature 2 work and changes zero production commands, deployed grants, or existing user stores. |
