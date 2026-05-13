<!--
  EVAL FIXTURE PLANT — DO NOT DELETE OR "COMPLETE"

  Consuming scenario: ignite-from-prd
  Plant realism:      representative   (per data-model `realism` enum)
  Owner:              evals/cases/ignite-from-prd.yaml  (scenario authored in Slice 2)
  Purpose:            Provide a structurally-faithful, substantively-non-trivial
                      PRD that `/smithy.ignite` can workshop into an RFC during
                      eval runs.

  This file is a deliberate eval fixture, not a real product PRD. The "Draft"
  status and open Specification Debt rows are intentional — ignite reads them
  during Phase 1 (clarify dispatch, prose dispatches, plan dispatches) and
  needs unresolved material to work with. Do not "fix" the open questions,
  do not close the debt rows, and do not promote the status away from Draft.

  Structure conforms to the canonical PRD template rendered by
  `src/templates/agent-skills/commands/smithy.spark.prompt` (Phase 3 PRD
  Template Reference). PRDs deliberately omit `## Dependency Order` (PRDs sit
  upstream of the RFC -> spec -> tasks lineage); do not retrofit one here.
-->

# PRD: Validate POST /api/users Request Bodies Before Creating Users

**Created**: 2026-05-12  |  **Status**: Draft

## Problem Statement

The fixture API's `POST /api/users` handler currently accepts whatever JSON the
client posts and writes it straight into the in-memory users array. A planted
`TODO` above the handler in `src/routes/users.ts` admits the gap explicitly:
"add request validation before creating user (reject empty name/email, enforce
email format)". In practice, this means a client can create users with an empty
string for `name`, with no `email` field at all, or with a syntactically broken
email address like `not-an-email`. The handler still returns `201 Created` and
the malformed record persists for the lifetime of the process.

Downstream consumers of the API — the `GET /api/users` list endpoint, the
`GET /api/users/:id` lookup, and anything else that reads the users array —
treat every row as a well-formed `User`. There is no defensive parsing layer,
so a single bad POST contaminates every subsequent read until the process
restarts. Operators have no way to tell a "user that was never properly
populated" apart from a "user whose name happens to be a single space".

Today the only feedback loop is manual inspection of the in-memory store. The
team wants the API to reject obviously-invalid `CreateUserRequest` payloads at
the boundary with a structured 400 response, so bad data never enters the
store and clients see a precise error instead of a silent corruption.

## Proposed Solution

Add input validation to the `POST /api/users` handler that rejects requests
missing required fields (`name`, `email`), rejects empty-string values for
those fields after trimming whitespace, and rejects email addresses that fail
a conservative syntactic check. Rejected requests return HTTP 400 with a JSON
body shaped like `{ "error": "<human-readable summary>", "field": "<which
field failed>" }`. Valid requests behave exactly as they do today — they
return HTTP 201 with the created user.

The change is observable to API consumers as: malformed POSTs are refused
with a specific, machine-readable error; well-formed POSTs are unaffected;
the `users` array no longer contains records that violate the `User`
contract.

## Target Users

- **API consumers writing client integrations against `POST /api/users`** —
  today they discover the validation gap only when their downstream code
  trips over `undefined` name fields. They want the server to be the
  authority on what a well-formed user looks like.
- **Fixture maintainers running Smithy evals** — they need the fixture's
  surface area to remain stable and honest. A validation feature is a
  natural, plausible addition that doesn't fight the fixture's existing
  structure (one router, one in-memory store, one `CreateUserRequest` type).

## Success Signals

- A `POST /api/users` with body `{ "name": "", "email": "a@b.c" }` returns
  HTTP 400, and the users array is unchanged.
- A `POST /api/users` with body `{ "name": "Ada", "email": "not-an-email" }`
  returns HTTP 400 citing the email field, and the users array is unchanged.
- A `POST /api/users` with body `{ "name": "Ada", "email": "ada@example.com" }`
  still returns HTTP 201 with the created user, exactly as it does today.
- `GET /api/users` over time contains zero records with empty or missing
  `name`/`email`.

## Alternatives / Build-vs-Buy

### Alternatives Considered

| Name | URL | Category | Fit | Why not |
|------|-----|----------|-----|---------|
| zod | https://zod.dev | OSS library | Close | Idiomatic and well-typed, but adds a runtime dependency to a fixture that intentionally has only Express as a runtime dep; pulling it in shifts the fixture's dependency footprint in a way that complicates other evals that read `package.json`. |
| express-validator | https://express-validator.github.io | OSS library | Partial | Mature, but its middleware-chain style introduces a second validation idiom alongside the existing inline route handlers and obscures the single-file, read-top-to-bottom shape that makes this fixture useful as eval input. |
| Hand-rolled inline checks in the handler | — | Build | Close | Three or four lines of guard clauses cover the entire `CreateUserRequest` surface; the fixture has exactly one POST endpoint and one request type, so the maintenance cost of a library would exceed the cost of the validation itself. |

### Build-vs-Buy Rationale

The closest off-the-shelf candidate is `zod`, which would let the handler
declare a schema once and reuse it for type narrowing and runtime checks.
But the fixture's whole point is to be a small, read-top-to-bottom Express
project that eval agents can reason about without chasing imports — and the
validation surface here is exactly two required fields plus one format
check. A hand-rolled guard clause inside the existing POST handler is
proportional to the problem, keeps the fixture's runtime-dependency
footprint at exactly one package (`express`), and stays consistent with the
inline style of the other handlers. We will build, not buy.

## Assumptions

- [Critical Assumption] The fixture's `CreateUserRequest` interface
  (`src/types.ts`) will not gain additional required fields during this
  effort — if it does, the validation surface grows and the build-vs-buy
  calculus may need to be revisited.
- The email format check can be a single conservative regex
  (presence of `@`, presence of `.` after the `@`, no whitespace);
  full RFC 5322 compliance is explicitly out of scope.
- Whitespace-only strings (e.g., `"   "`) count as empty after trimming.
- The 400 response shape (`{ "error": "...", "field": "..." }`) is a new
  contract for this endpoint; no existing client depends on a different
  error shape, because the endpoint has no error shape today.
- Validation runs synchronously in-handler; no async or database lookups
  are needed.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Whether duplicate email addresses should also be rejected at validation time is unresolved — the in-memory store would allow `findIndex`-style checks cheaply, but doing so blurs the line between "shape validation" and "business-rule validation" and may belong in a follow-up. | Functional Scope | Medium | Medium | open | — |
| SD-002 | The exact JSON error shape (`{ "error", "field" }` vs. an array of `{ "errors": [...] }` for multi-field failures) is not yet pinned down. Single-field is simpler today; multi-field is more useful for forms with multiple invalid inputs. | Domain & Data Model | Low | High | open | — |
| SD-003 | Whether to expose the validation rules as a separate exported helper (testable in isolation) or keep them inline in the route handler is a structural decision deferred to implementation review. | Testing Strategy | Low | Medium | open | — |

## Open Questions

- Should the validation layer log rejected requests (and at what level), or
  is "silently return 400" sufficient for a fixture-style API?
- Do we want to add a corresponding `PATCH /api/users/:id` validation pass
  as part of this effort, or scope it strictly to `POST` and follow up on
  PATCH separately once that handler exists?
- Is the email regex conservative enough to pass real-world addresses with
  `+` aliases (`ada+test@example.com`) and subdomains
  (`ada@mail.example.com`), or do we need explicit test coverage for those
  shapes before locking the regex in?
