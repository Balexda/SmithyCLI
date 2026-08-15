### Levels and scan roots

Engraved durable knowledge — decisions, invariants, and principles — is
partitioned into three levels. The level answers *how widely does this
commitment hold*, and it is the only thing that separates two rules that
govern the same code paths.

| Level | Holds | Store root |
|-------|-------|------------|
| `user` | True in every repo and every project you work in | `~/.smithy/` |
| `repo` | True for this repo and every workstream inside it | {{#ifExternalArtifacts}}`{{artifactsRoot}}`{{else}}the repo root{{/ifExternalArtifacts}} |
| `project` | True for one named workstream inside a repo | `~/.smithy/projects/<project>/` |

The `project` level exists because `scope` cannot always separate two
workstreams: sibling projects in one repo routinely share code paths while
committing to incompatible rules about them. A partition can express that;
a glob cannot.

For `system` work, the roots are:

| Level | Decisions | Invariants | Principles |
|-------|-----------|------------|------------|
| `user` | `~/.smithy/decisions/` | `~/.smithy/invariants/` | `~/.smithy/constitution/` |
| `repo` | `{{artifactsRoot}}docs/decisions/` | `{{artifactsRoot}}docs/invariants/` | `{{artifactsRoot}}docs/constitution/` |
| `project` | `~/.smithy/projects/<project>/decisions/` | `~/.smithy/projects/<project>/invariants/` | `~/.smithy/projects/<project>/constitution/` |

For `design` work, insert a `design/` segment before the leaf directory at
every level — `~/.smithy/design/decisions/`,
`{{artifactsRoot}}docs/design/decisions/`,
`~/.smithy/projects/<project>/design/decisions/`, and so on for
`invariants/` and `constitution/`.

Only the repo level carries a `docs/` segment. That is where in-repo records
already live, and moving them would break every citation that names one.

Missing roots are normal at every level. A level with no store on disk is
scanned-and-empty, never an error.

{{>engraved-project-resolution}}

With no project resolved, scan `user` + `repo` only.
