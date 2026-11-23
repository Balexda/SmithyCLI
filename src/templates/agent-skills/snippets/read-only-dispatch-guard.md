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
{
  git rev-parse HEAD
  git ls-files -s
  git status --porcelain=v2 --untracked-files=all
  { git diff --name-only -z; git ls-files -o --exclude-standard -z; } |
    sort -zu | while IFS= read -r -d '' p; do
      if [ -L "$p" ]; then echo "link $(readlink -- "$p" | git hash-object --stdin) $p"
      elif [ ! -e "$p" ]; then echo "gone $p"
      elif [ -x "$p" ]; then echo "exec $(git hash-object -- "$p") $p"
      else echo "file $(git hash-object -- "$p") $p"; fi
    done
} > "$GUARD/$OUT"
```

The fingerprint covers `HEAD`, every index entry's mode and blob, the
worktree mode on each status line, and a content hash plus executable bit for
every dirty or untracked file (for a symlink, a hash of its raw target text,
so a retargeted link is caught even when it dangles).

**Immediately after the dispatch**, compare the two fingerprints:

```bash
GUARD=$(git rev-parse --git-path read-only-dispatch-guard)
diff "$GUARD/before" "$GUARD/after"
```

- **No difference:** the dispatch was read-only. Act on its output as usual.
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
  matched `before`. If it did not match, list the paths that still differ
  and leave them for the operator. Never continue as though the dispatch had
  returned a clean result.
