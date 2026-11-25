A read-only sub-agent's `tools:` list and its sandbox default do not bound
it, because the parent turn's sandbox overrides both. The parent
therefore proves the dispatch was read-only by comparing the repository
before and after it. Comparing `git status` alone is not enough: it misses
an edit to a file that was already dirty and a change that only flips a
file's mode.

**Immediately before the dispatch**, record the snapshot. The files go in
the git directory, so writing them does not change the state being checked.
Each block below sets `GUARD` itself, so it works when run as a separate
shell command:

```bash
GUARD=$(git rev-parse --git-path read-only-dispatch-guard)
rm -rf "$GUARD" && mkdir -p "$GUARD"
git rev-parse HEAD > "$GUARD/head"
git stash create > "$GUARD/stash"
git ls-files -o --exclude-standard -z > "$GUARD/untracked"
git ls-files -o --exclude-standard > "$GUARD/untracked.txt"
[ -s "$GUARD/untracked" ] && tar --null -T "$GUARD/untracked" -cf "$GUARD/untracked.tar"
```

`git stash create` writes the dirty tracked state as a dangling commit and
leaves the shared stash list alone. It prints nothing when the tree is clean.
The tarball keeps the content and mode of every untracked file.

Then take the fingerprint. Run the same block twice, with `OUT=before`
immediately before the dispatch and `OUT=after` immediately after it:

```bash
: "${OUT:?set OUT to before, after, or restored}"
GUARD=$(git rev-parse --git-path read-only-dispatch-guard)
perm() { ls -ld -- "$1" | cut -c1-10; }
entry() {
  if [ -L "$1" ]; then echo "link $(readlink -- "$1" | git hash-object --stdin) $1"
  elif [ -d "$1" ]; then
    (cd "$1" && repo) | while IFS= read -r l; do printf '%s: %s\n' "$1" "$l"; done
  elif [ -e "$1" ]; then
    if h=$(git hash-object --no-filters -- "$1"); then echo "$(perm "$1") $h $1"
    else echo "unreadable $1"; fi
  else echo "gone $1"; fi
}
repo() {
  git rev-parse HEAD
  git ls-files -s
  git status --porcelain=v2 --untracked-files=all --ignore-submodules=none
  { git diff --name-only -z --ignore-submodules=none
    git ls-files -o --exclude-standard -z; } |
    sort -zu | while IFS= read -r -d '' p; do entry "$p"; done
}
repo > "$GUARD/$OUT"
```

The fingerprint covers `HEAD`, every index entry's mode and blob, the
worktree mode on each status line, and the full permission bits plus a content
hash for every dirty or untracked file. Hashes are taken with `--no-filters`,
so they cover the bytes on disk, line endings included, and submodules are
listed with `--ignore-submodules=none`, so a `submodule.<name>.ignore` setting
cannot hide one. A symlink is recorded as a hash of its
raw target text, so a retargeted link is caught even when it dangles. A dirty
submodule, which git lists as one directory, gets the same fingerprint of its
own, prefixed with its path, so an edit, a staged change, or a mode change
inside it is caught even when the submodule was already dirty. A file whose
content cannot be hashed is recorded as `unreadable`.

**Immediately after the dispatch**, compare the two fingerprints:

```bash
GUARD=$(git rev-parse --git-path read-only-dispatch-guard)
diff "$GUARD/before" "$GUARD/after"
```

- **No difference, and no `unreadable` line in either fingerprint:** the
  dispatch was read-only. Act on its output as usual. An `unreadable` line
  means the guard could not check that file, so treat it as a difference.
- **Any difference:** the read-only contract was violated. Apply none of the
  sub-agent's output, then restore the snapshot:

  ```bash
  GUARD=$(git rev-parse --git-path read-only-dispatch-guard)
  git reset --hard "$(cat "$GUARD/head")"
  [ -s "$GUARD/stash" ] && git stash apply --index "$(cat "$GUARD/stash")"
  [ -f "$GUARD/untracked.tar" ] && tar -xpf "$GUARD/untracked.tar"
  git ls-files -o --exclude-standard | while IFS= read -r p; do
    grep -Fxq -- "$p" "$GUARD/untracked.txt" || rm -f -- "$p"
  done
  ```

  Re-take the fingerprint with `OUT=restored` and diff it against `before`.
  Report the violation as a stop: say which parts differed (`HEAD`, index,
  file content, or mode), name the paths from the diff, say that no output
  from the sub-agent was applied, and say whether the restored fingerprint
  matched `before`. The block does not undo changes inside a submodule, or a
  permission change git does not track on a tracked file, so those show up in
  the restored diff. If it did not match, list the paths that still differ
  and leave them for the operator. Never continue as though the dispatch had
  returned a clean result.
