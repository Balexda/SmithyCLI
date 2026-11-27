### Task record location

Where the tasks or strike file lives decides who commits its checkbox flip.
Decide it at run time, not from the install mode: compare the file's absolute
path with the implementation checkout's `git rev-parse --show-toplevel`.

- **In-repo** (the path is inside that checkout) → the flip is staged with the
  implementation in one commit, and the gate reads
  `git show HEAD:<tasks-file-path>`.
- **Store-resident** (the path is outside it, in an artifacts or project
  store) → the implementation commit carries code only. Never copy the tasks
  file into the implementation repo. The implementer reports which task it
  completed; after each successful task, `smithy.forge` flips that box in the
  store file and commits it there. The store root is what
  `git -C <tasks-file-dir> rev-parse --show-toplevel` prints; when that
  fails, the store has no git.

```bash
git -C <store-root> add -- <tasks-file-path>
git -C <store-root> commit --no-gpg-sign -m "forge: mark slice <N> task <M> complete"
```

{{>store-commit}}


For a store-resident record the gate reads the store's committed state,
`git -C <store-root> show HEAD:<path-from-store-root>`, or the file itself
when the store has no git. A store write or commit that fails is reported in
forge's **Outstanding Issues** with the task and the error. It is not a STOP.
