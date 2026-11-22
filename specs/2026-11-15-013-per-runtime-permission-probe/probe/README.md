# Permission probe

Run from this directory with Bash, Git, Node.js, and an unmanaged Claude Code
installation. The recorded control used Claude Code 2.1.330. Setup creates a
fresh temporary directory with two independent Git repositories, a private
home directory, and a copy of the stand-in on its own `bin/` path. Neither
production Smithy command is needed.

## Run the Claude control

1. Resolve the Claude executable before switching to the fixture. Use an
   unmanaged environment without system or organization-managed Claude
   settings. Managed settings can still apply when other sources are disabled.
2. Create a fresh fixture and run the three independent Claude sessions.

   ```bash
   claude_bin=$(command -v claude)
   probe_dir=$(./setup)
   node claude-control.mjs "$probe_dir" "$claude_bin" > "$probe_dir/control.json"
   ```

3. Inspect `control.json`. The committed [Claude evidence](claude-control.json)
   records a pass. The query returned the sibling store's path, the write
   committed only `probe.txt` there, and Claude denied the unrelated command
   before it reached the stand-in. Checkout HEAD and the index hash stayed
   identical across all three operations. The same grants also passed on a
   fresh fixture with a different store path.
4. Keep the evidence you need and remove the temporary directory when finished.
   Use a new fixture for each rerun so the write starts from the baseline.

The control uses a loopback Messages API endpoint that supplies one fixed Bash
request per session. The installed Claude Code binary evaluates permissions and
runs approved commands. No live model, account, or API credential is needed.
The runner starts with a clean environment and private config directory, loads
no user, project, or local settings, registers only Bash, and supplies exactly
two allow rules, `Bash(smithy probe-query)` and `Bash(smithy probe-write)`.
It runs noninteractively in `dontAsk` mode with the Claude filesystem sandbox
disabled. The negative control uses those same rules and mode. See the
[Claude settings reference](https://code.claude.com/docs/en/settings).

## Reuse the fixture and record evidence

For a direct smoke test, run these commands in a fresh fixture from its
`checkout/` directory. The first prints the selected store, the second commits
the new fixture contents in that store, and the third prints a sentinel to
show the negative-control command is callable.

```bash
export PATH="$probe_dir/bin:$PATH"
smithy probe-query
smithy probe-write
smithy probe-unrelated
```

For each runtime and candidate, start from a fresh fixture and configure the
runtime in isolation. Add only the path-free grants being tested. Record the
runtime version, platform, resolved executable paths and hashes, working
directory, effective permission settings, and effective sandbox settings.
Use the runtime's Bash or shell tool to submit each literal command separately
with no approval input. Delete the fixture's `argv` file before each operation.
The stand-in writes the argument tokens as NUL-delimited bytes when it runs.
Record a missing file as no received tokens.

Capture the literal command, received tokens, tool output and error, runtime
rule decision, and any approval request or denial for each operation. Record
both repositories' HEADs and the checkout's index hash immediately before and
after each operation. For the write, use Git to verify that the new store HEAD
is a child of the old HEAD, changes only `probe.txt`, and contains the line
`probe write completed`. Preserve both operation results even if one fails.

A pass requires the expected query output and verified store commit without
approval, an unchanged checkout HEAD and index, and a denied, unexecuted
negative control. Report authorization and execution separately. A matched
grant with a tool error or approval requirement fails. Missing tool execution
evidence for either positive operation leaves the result incomplete.
