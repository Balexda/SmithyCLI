## Consult Engraved Knowledge

During scan/context gathering, consult engraved durable knowledge before
drafting or decomposing the artifact. Treat recall findings as advisory inputs:
candidate invariant exceptions feed clarification or specification debt, and
superseded/deprecated citation hazards are surfaced before write-out. Clean or
empty results do not block the command.

Dispatch the `smithy-recall` sub-agent with the current planning context:

- Artifact type, user request, goals, known scope, and any in-progress draft or
  cited engraved records.
- Domain hint: `system`, `design`, or `both`; infer it when absent.
- Topic, scope, and applies-to hints from paths, modules, surfaces, commands,
  APIs, product areas, or workflows named by the context.
- Optional scan-root overrides if the parent command already identified them.

Use the returned `relevant`, `conflicts`, `superseded_citations`, `empty`, and
`empty_reason` fields as the engraved-knowledge recall result.
