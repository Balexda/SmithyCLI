## Audit Checklist (engraved records: `.decision.md`, `.invariant.md`, principles)

Engraved records are graph roots — they carry no `## Dependency Order` row and
no `M<N>` / `F<N>` / `US<N>` / `S<N>` ID. Everything below is checkable against
the record and its stores; nothing here asks for a judgment about whether the
commitment is *right*.

Run `smithy status --engraved --format json` first (add `--project <slug>` when
auditing a project-level record). Its `records` array resolves every id in the
scope, and its `ledger` roll-up already derives alignment — use it rather than
re-deriving either by hand.

| Category | What to check |
|----------|---------------|
| **Level Placement** | Does the record's `id` prefix agree with the store it sits in — `U-` under `~/.smithy/`, no prefix under the repo store, `PJ-` under `~/.smithy/projects/<project>/`? The store is authoritative; a mismatch is an id to repair, never a file to move. The JSON reports it as `id_level_mismatch`. |
| **Level Fit** | Does the record pass the inclusion test for the level it sits in? A `user`-level record that names a repo, codebase, or product surface to state its rule belongs at `repo`. A `repo`-level record that would not hold for a sibling workstream belongs at `project`. A `project`-level record that would be just as true for a sibling project belongs at `repo`. |
| **Alignment Derivation** | For invariants: does the declared `status` match what the ledger derives — `drifting` with at least one `Temporary:` row, `aligned` otherwise? `Accepted:` rows alone never flip the status. The JSON reports disagreement as `ledger.status_drift`. |
| **Ledger Shape** | Is the Known-Exceptions table exactly `Where \| What diverges \| Disposition + Why \| Tracking Issue \| Severity`, in that order? Does every disposition start with the capitalized `Accepted:` or `Temporary:` token? Does an empty ledger carry the single em-dash placeholder row rather than being deleted? |
| **Tracking Issues** | Does every `Temporary:` row carry a `#NNN` tracking issue, or state why creation failed? Is every `Accepted:` row's Tracking Issue cell `—`? A `Temporary:` row with no issue and no explanation is drift nobody is accountable for closing. |
| **Severity Set Honestly** | Is each row's `Severity` proportionate to what the drift costs? `high` is not decoration: planning commands escalate a bearing `high` row into a mandatory specification-debt row and a run-summary callout, so an inflated severity taxes every future plan that touches the scope. |
| **Edge Resolution** | Does every id in `established_by`, `establishes`, `supersedes`, `superseded_by`, and `excepts` resolve to a record in the JSON payload? An id that resolves in no scanned level is a dangling edge — report which levels were scanned alongside it. |
| **Edge Direction** | Is `establishes` same-level only? Does `established_by` point at the same level or a broader one, never a narrower one? Is `supersedes` / `superseded_by` same-level only? Does `excepts` point strictly from narrower to broader? A narrower record superseding a broader one is the specific defect the exception edge exists to prevent. |
| **Supersession Symmetry** | For every decision with `supersedes: [X]`, does `X` carry this record's id in `superseded_by` and `status: superseded`? For every `superseded_by: [Y]`, does `Y` list this record in `supersedes`? One-sided supersession leaves a retired rule looking live. |
| **Declared Exceptions** | Does every `excepts` entry have a body passage saying what the broader rule requires, what this level does instead, and why the narrower context makes that correct? An `excepts` id with no rationale is an undeclared contradiction wearing a declaration. |
| **Section Order** | Are the body sections present and in order — decision: `## Context`, `## Decision`, `## Consequences`, `## Establishes`, `## Citations`; invariant: `## Rule`, `## Rationale`, `## Known Exceptions`, `## Citations`; principle: `## Statement`, `## Why this is apex`, `## How decisions cite this`? Ordering is load-bearing for the parser. |
| **Citation Form** | Are engraved records cited by bare id rather than by path? Are documents at the record's own level cited by a path relative to that level's store? Is anything outside the record's own level cited as an absolute `https://` URL — a relative path there resolves to nothing from where the record is read. |
| **Frontmatter Discipline** | Is `title` quoted? Is `scope` absent at `user` level, and level-relative elsewhere? Do the declared `kind` and `domain` agree with the directory the record sits in — the JSON reports disagreement as `frontmatter_mismatch`, and the store wins, so the frontmatter is what gets repaired? Are there any fields the schema does not list — in particular a `level:` field, which does not exist because the store already answers it? |
