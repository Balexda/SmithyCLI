### Resolve the artifact root first

The artifact paths in this prompt carry the root `smithy init` rendered for
this install. A run may belong to a **named project store** instead —
`~/.smithy/projects/<slug>/`, one git repository per workstream, so two
workstreams never share a checkout or a branch and a project spanning several
repos has one home. Which root this run uses is settled once, before any
artifact is read or written, by the CLI rather than by inference:

```bash
smithy root --format json [--project <slug>] [--from <artifact-path>] [--write]
```

- Pass `--project <slug>` when the invoking arguments carry that token, and
  strip the token from the rest of the input before interpreting it.
- Pass `--from <path>` when the run starts from an existing artifact — a
  PRD, RFC, feature map, spec, tasks file, or strike. Its `**Project**` header,
  or the store it physically lives in, names the project.
- Pass `--write` when this run creates or edits artifacts. A write never picks
  the only named store by itself: the choice is explicit (`--project`, or the
  input artifact) or it falls back to the install root, with a `warning`
  naming the stores it did not choose. Reads may take a single named store.

The result carries `prefix` and `rendered_prefix`. When they differ, use
`prefix` in place of `rendered_prefix` at every artifact path this prompt
names — a literal replacement of the leading prefix; nothing else about the
path changes — and name the resolved root in the run summary, with the
`warning` when there is one. When they are equal, every path in this prompt is
already correct as written.

Never infer a project from the working directory name; the three signals above
are the only ones. If `smithy root` exits non-zero, stop and show its message:
it names a slug that is not valid or a store that does not exist, and writing
anywhere else would scatter the workstream.
