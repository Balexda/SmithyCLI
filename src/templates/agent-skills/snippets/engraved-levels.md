## Engraved Knowledge Levels

{{>engraved-scan-roots}}

### Record identity across levels

Every record carries an `id` whose prefix encodes both kind and level:

| Kind | `user` | `repo` | `project` |
|------|--------|--------|-----------|
| decision | `U-D-<N>` | `D-<N>` | `PJ-D-<N>` |
| invariant | `U-INV-<N>` | `INV-<N>` | `PJ-INV-<N>` |
| principle | `U-P-<N>` | `P-<N>` | `PJ-P-<N>` |

Counters run independently per level and per kind: the first user-level
decision is `U-D-1` even when `D-7` already exists in the repo.

There is no `level` frontmatter field. A record's level is the store it lives
in, and the `id` prefix must agree with that store. Disagreement is a defect,
not an override — repair the `id`, never move the file to match it.

**Uniqueness guarantee:** ids are unique within a *resolution scope* — the
user store, plus one repo, plus at most one project. Because the level tag is
part of the prefix, no two records in a resolution scope can collide, and a
citation written as a bare id always names exactly one record.

### Precedence

More specific wins: **project > repo > user**.

Precedence decides which rule governs the work in front of you. It does not
delete the broader record, and it does not travel: a project-level rule has no
authority over a sibling project, and none over the repo it lives in.

A narrower record may:

- **Add** a commitment the broader levels are silent about.
- **Tighten** a broader rule — every case the broader rule permits and the
  narrower one forbids is still consistent with the broader rule.

A narrower record may **not** silently contradict a broader one. To carve out
a genuine contradiction, the narrower record declares it:

- Add `excepts: [<broader-id>, ...]` to the narrower record's frontmatter.
- State in the body what the broader rule requires, what this level does
  instead, and why the narrower context makes that correct.

A declared exception resolves the conflict at planning time — the narrower
rule governs, and recall reports it as declared rather than as a candidate
conflict. An **undeclared** contradiction is reported as a cross-level
conflict for the planner to resolve; it is guidance, not a block.

This is the escape hatch that keeps a wrong global rule from stranding a
project, without letting a project quietly repeal knowledge that other repos
still depend on. The exception is written down, at the level that needs it, in
a form the audit and `smithy status --engraved` can both see.

### `scope` across levels

`scope` is **optional at every level**, and it is always relative to the
record's own level:

- `user` — omit `scope`. A user-level record that needs a code selector to
  state its rule is mis-leveled; move it to `repo`.
- `repo` — repo-relative globs, package names, modules, or layers.
- `project` — repo-relative globs naming where the workstream touches the
  code, if that is genuinely narrowing.

An absent `scope` means *the whole level*, and ranks no lower for it. At
project level the partition itself is the discriminator: two projects sharing
one set of files are separated by which store their records live in, never by
`scope`.

### Graph edges across levels

| Edge | Cross-level rule |
|------|------------------|
| `established_by` (invariant → decision) | May cite a decision at the **same or broader** level. A project invariant established by a user decision is expected and correct. |
| `establishes` (decision → invariant) | **Same level only.** A decision cannot create an invariant in a store it does not own; express that relationship from the invariant side with `established_by`. |
| `supersedes` / `superseded_by` (decision → decision) | **Same level only.** A narrower decision never supersedes a broader one — that would let one project retire knowledge every other repo still reads. Use `excepts` instead. |
| `excepts` (record → record) | **Narrower → broader only.** Never same-level, never broader → narrower. A same-level contradiction is a supersession, not an exception. |

### Citation paths

Inside `## Citations`, how a target is written depends on where it lives:

- **Another engraved record, any level** — cite the bare `id` (`U-D-3`,
  `INV-2`). Ids resolve through recall regardless of level, and a path would
  break the moment the store moved.
- **A document at the record's own level** — a path relative to that level's
  store root.
- **Anything outside the record's own level** — an absolute `https://` URL.
  User- and repo-level records routinely cite documents that live in another
  repo, and a relative path resolves to nothing from where those records are
  read.
