### Levels and scan roots

Engraved durable knowledge — decisions, invariants, and principles — is
partitioned into three levels. The level answers *how widely does this
commitment hold*, and it is the only thing that separates two rules that
govern the same code paths.

| Level | Holds | Store root |
|-------|-------|------------|
| `user` | True in every repo and every project you work in | `~/.smithy/engraved/` |
| `repo` | True for this repo and every workstream inside it | {{#ifExternalArtifacts}}`{{artifactsRoot}}`{{else}}the repo root{{/ifExternalArtifacts}} |
| `project` | True for one named workstream inside a repo | `~/.smithy/projects/<project>/` |

The `project` level exists because `scope` cannot always separate two
workstreams: sibling projects in one repo routinely share code paths while
committing to incompatible rules about them. A partition can express that;
a glob cannot.

For `system` work, the roots are:

| Level | Decisions | Invariants | Principles |
|-------|-----------|------------|------------|
| `user` | `~/.smithy/engraved/decisions/` | `~/.smithy/engraved/invariants/` | `~/.smithy/engraved/constitution/` |
| `repo` | `{{artifactsRoot}}docs/decisions/` | `{{artifactsRoot}}docs/invariants/` | `{{artifactsRoot}}docs/constitution/` |
| `project` | `~/.smithy/projects/<project>/docs/decisions/` | `~/.smithy/projects/<project>/docs/invariants/` | `~/.smithy/projects/<project>/docs/constitution/` |

For `design` work, insert a `design/` segment before the leaf directory at
every level — `~/.smithy/engraved/design/decisions/`,
`{{artifactsRoot}}docs/design/decisions/`,
`~/.smithy/projects/<project>/docs/design/decisions/`, and so on for
`invariants/` and `constitution/`.

Missing roots are normal at every level. A level with no store on disk is
scanned-and-empty, never an error.

**Resolving the project level.** The `project` level is only in play when a
project is named. Resolve it in this order and stop at the first hit:

1. An explicit `--project <slug>` token in the invoking arguments.
2. A `project:` field in the frontmatter or header block of the planning
   artifact being worked on.
3. Exactly one directory under `~/.smithy/projects/` other than `default`.

If none of those resolve, or more than one candidate remains at step 3, there
is **no** project level for this run: use `user` + `repo` only and say so
rather than guessing. Never infer a project from the working directory name.
