- **Project**: the `recall_project` slug `smithy root` returned in the
  artifact-root resolution step (a read may take the single named store even
  when this run's writes do not), or state that no project level is in play.
  This is the one input recall cannot work out for itself — it resolves the
  `user`, `repo`, and `project` store roots from its own canonical table, but
  only you ran the resolution.
