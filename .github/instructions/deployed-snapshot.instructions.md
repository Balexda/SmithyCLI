---
applyTo: ".claude/commands/**,.claude/prompts/**,.claude/agents/**,.claude/hooks/**,.claude/skills/smithy*/**,.agents/skills/**,.codex/agents/**,tools/codex/**,.smithy/smithy-manifest.json"
excludeAgent: "coding-agent"
---
# Reviewing the committed deployment snapshot

These files are the output of an earlier `smithy init` run against this
repository. They are generated from `src/templates/agent-skills/`, tracked in
`.smithy/smithy-manifest.json`, and intentionally allowed to drift from the
templates between releases.

- A pull request that edits source templates should **not** touch these
  files. If it does, ask why. Refreshes happen in dedicated chore pull
  requests.
- In a refresh pull request, do not review the rendered text for content. A
  finding about wording or behaviour belongs on the source template, once.
- Do not ask for these files to be regenerated to match a template change,
  and do not report them as stale.
- Hand edits are what to catch: a change here with no matching change under
  `src/templates/` and no `smithy init` or `smithy update` run named in the
  description.

`.claude/rules/`, `.claude/settings.json`, `.claude/skills/pr-creation/`, and
`.smithy/templates/` are maintained by hand and are not part of the snapshot.
