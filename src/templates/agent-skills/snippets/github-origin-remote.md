Resolve the repository **once**, from the origin remote. This needs no `gh`
and no MCP call:

```bash
git config --get remote.origin.url
```

Parse the output into `owner` and `repo`:

- `git@github.com:OWNER/REPO.git` → owner `OWNER`, repo `REPO`
- `https://github.com/OWNER/REPO.git` → owner `OWNER`, repo `REPO`
- `https://github.com/OWNER/REPO` (no `.git`) → owner `OWNER`, repo `REPO`

Strip a trailing `.git` if present. `ownerRepo` is `<owner>/<repo>` and must
match `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`. If the command prints nothing or
the value does not match, there is no usable GitHub remote: stop and say so.
Pass this one value to every later operation, on either path. Never derive the
repository a second way, such as `gh repo view` or another remote read.
