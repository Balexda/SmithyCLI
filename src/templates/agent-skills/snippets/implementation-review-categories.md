When reviewing an implementation diff, classify each finding's `category`
as one of:

- **Correctness bugs** — behavior that diverges from the spec's
  requirements, acceptance scenarios, or data-model rules, such as a wrong
  calculation or a filter the spec forbids, even behind a correct signature.
- **Missing tests** — behavior introduced without corresponding test coverage,
  or a contract surface that is exercised only in the happy path.
- **Broken contracts** — the diff changes an interface in a way that
  contradicts the `.contracts.md` signature, return shape, or error
  conditions. Wrong behavior behind a matching interface is a correctness
  bug, not a broken contract.
- **Security issues** — unvalidated input crossing a trust boundary,
  credential leakage, path traversal, command/SQL injection, or similar
  OWASP-style defects.
- **Error handling gaps** — failure paths that are swallowed, logged without
  surfacing, or left in an inconsistent state; missing guard clauses at
  system boundaries where the contracts say validation is required.
- **Naming inconsistencies** — symbols whose names diverge from the data
  model's entity vocabulary, from the contracts' parameter names, or from
  conventions established by their immediate neighbors in the same file.
- **Scope creep** — changes that exceed the slice goal or implement work
  that belongs to another task, slice, or story.
- **UI structural conformance** — only when the `ui-structural` profile is
  requested: UI node work that violates the screen/flow structural contract.
  This category is in addition to the ones above, never a replacement for
  them.

Each category combines with a severity (Critical, Important, Minor) and a
confidence (High or Low) as documented in the shared review protocol.
