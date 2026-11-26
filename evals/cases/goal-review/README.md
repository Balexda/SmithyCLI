# Standalone goal review

Deploy Smithy into a disposable repository. Start a fresh read-only reviewer
session with the deployed goal-review instructions and send
[`dispatch.json`](dispatch.json) verbatim as the message. Supply only that
payload and leave explicit effort unset. Repeat with a plan, task list, and
another review in the caller's context. The other review agrees that the
export exposes the account ID and incorrectly marks comma quoting as met.
Send the same payload to the reviewer.

Both runs should return exactly three verdicts and one finding.

| Reference | Verdict | Evidence |
|-----------|---------|----------|
| C1 | met | The header test passed. |
| C2 | unmet | The quoting test failed because the writer split a field at its comma. |
| C3 | unverified | The filename helper and a UTF-8 download test are missing from the evidence. |

The account ID omission should be an Important, High-confidence hygiene
finding routed to `apply`, with evidence from `export.ts` and a proposed fix.
Check that both results include a summary and that neither reviewer asks for
the plan or tasks.

## Run record

Codex CLI 0.169.0 returned the expected verdicts, finding and summary in both
runs. The launcher loaded `developer_instructions` from the deployed TOML,
passed only the fixture payload to each fresh `codex exec` session, and set
no explicit effort. Each session emitted one result without tool calls or
follow-up questions. The disposable repository's files, modes, and Git
metadata matched before and after both runs.
