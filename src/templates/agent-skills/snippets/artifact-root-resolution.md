### Resolve the artifact root first

The planning-artifact paths in this prompt carry the root `smithy init`
rendered for this install. A run may belong to a **named project store**
instead — `~/.smithy/projects/<slug>/`, one git repository per workstream —
and which root this run uses is settled once, before any artifact is read or
written, by the CLI rather than by inference:

```bash
smithy root --format json [--project <slug>] [--from <artifact-path>] [--write]
```

- `--project <slug>` when the invoking arguments carry that token; strip the
  token from the rest of the input before interpreting it.
- `--from <path>` when the run starts from an existing artifact or spec
  folder — a PRD, RFC, feature map, spec, tasks file, or strike. Its
  `**Project**` header, or the store it physically lives in, names the
  project; an artifact outside every named store settles the run on the
  install root.
- `--write` when this run creates or edits artifacts. A write never picks the
  only named store by itself: the choice is explicit (`--project`, or the
  input artifact) or it falls back to the install root, with a `warning`
  naming the stores it did not choose. Reads may take a single named store.

The result carries `prefix` and `rendered_prefix`. When they differ, use
`prefix` in place of `rendered_prefix` at every **planning-artifact** path
this prompt names — `.prd.md`, `.rfc.md`, `.features.md`, `.spec.md`,
`.data-model.md`, `.contracts.md`, `.tasks.md`, `.strike.md`, `.persona.md` —
as a literal replacement of the leading prefix; when `rendered_prefix` is
empty, prepend `prefix`. Nothing else about the path changes. Never rewrite
an engraved-record path (every level's home is fixed; the engraved section
that follows names them), a source-code path, or a `smithy` command. Name the
resolved root in the run summary, with the `warning` when there is one. When
the two are equal, every path in this prompt is already correct as written.

Never infer a project from the working directory name; the three signals above
are the only ones. If `smithy root` exits `2`, stop and show its message: it
names a slug that is not valid or a store that does not exist, and writing
anywhere else would scatter the workstream. If `smithy` is not installed, or
the installed release does not know the `root` command, use the paths in this
prompt as written and say so in the run summary.
