- `--no-gpg-sign` keeps the commit from blocking on a signing passphrase
  prompt on machines that set `commit.gpgsign`.
- If the commit reports nothing to commit, that is fine — carry on rather
  than treating it as a failure.
- **If the store is not a git repository, skip this step entirely and carry
  on.** A historyless store is a supported state, not a reason to fail the
  run. Do not run `git init` yourself to work around it.
- **Do not `git push`** the store. Any remote on it belongs to the user, who
  decides when it syncs.
- This is **separate from, and never a substitute for**, the code commits
  made in the implementation repo on the working branch. Committing the store
  does not put anything in the user's pull request.
