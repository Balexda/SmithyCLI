<!--
  Smithy eval fixture: planted parent artifact.

  Consuming scenario: render-from-rfc.

  Plant classification: representative (per the data-model realism enum:
  minimal / representative / flawed). This RFC exercises realistic content
  depth so render's Phase 1 milestone extraction and downstream features-map
  drafting have plausible substrate, without colliding with any real Smithy
  concept.

  DO NOT delete or "clean up" this file. Removing it silently breaks the
  render-from-rfc eval scenario, which asserts against the features-map
  rendered from this exact RFC. The fixture README's Planted Parent
  Artifacts section documents the convention this file belongs to.
-->

# RFC: Log-Tail CLI for Local Fixture Service

**Created**: 2026-05-03  |  **Status**: Draft

## Summary

Add a small, single-binary log-tail CLI to the local fixture service so
developers debugging the fixture API can follow request and error logs
without attaching an editor or running an extra container. The CLI ships as
one milestone covering both the reader loop and the colorized terminal
output.

## Motivation / Problem Statement

Today, developers iterating on the fixture service tail logs by piping the
service's stdout through ad-hoc shell one-liners (`tail -F | grep`). The
flow is error-prone: filters drift between developers, ANSI colors are lost
when piping, and log rotation breaks the pipe mid-session. A purpose-built
CLI gives the team one consistent way to watch service output, scoped to
the fixture so it cannot accidentally tail production traffic.

## Goals

- Provide a single `logtail` command that follows the fixture service's log
  file with rotation-aware semantics.
- Render structured JSON log lines with level-based color and timestamp
  alignment.
- Support a simple include/exclude filter expression scoped to top-level
  JSON fields.

## Out of Scope

- Centralized log shipping or remote tailing.
- Querying historical logs older than the currently open log file.
- Any modification to the fixture service's existing log-format contract.

## Personas

- **Fixture Developer** — works inside the fixture repo, needs fast,
  reliable local feedback while iterating on routes.
- **Eval Runner Operator** — runs the fixture under eval harnesses and
  occasionally needs to inspect a single failing run's logs without
  re-plumbing log capture.

## Proposal

Ship a small Node-based CLI, distributed as a single bundled script, that
opens the fixture service's log file, follows it across rotation events,
parses each line as JSON, and emits a colorized aligned view to the
terminal. Filters are expressed as `field=value` pairs on the command line
and combine with logical AND. The CLI prints a one-line header on start so
users can confirm which file is being followed.

## Design Considerations

The reader loop must handle log rotation without losing events: detecting
when the watched inode changes and re-opening the new file is the central
correctness concern. Output formatting should degrade gracefully when
stdout is not a TTY (no color, no alignment), so the CLI composes cleanly
with downstream pipelines. Filter parsing stays intentionally narrow —
top-level field equality only — to avoid pulling in a query-language
dependency at this stage.

## Decisions

- **Single binary, no daemon** — the CLI runs in the foreground only.
  Background tailing is out of scope for this milestone; users who want
  long-running capture compose with `tmux` or `nohup`.
- **JSON-line input format** — the fixture service already emits one JSON
  object per log line; the CLI assumes this and skips malformed lines with
  a one-time warning rather than aborting.

## Open Questions

- Should the CLI support reading from stdin as an alternative to a watched
  file path, for use inside containers where the log file is not directly
  accessible? Deferred to a follow-up if demand emerges.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Behavior on filesystems without inode stability (e.g., some network mounts) is undefined; the rotation-detection heuristic may miss events. | Edge Cases | Medium | Medium | open | — |

## Milestones

### Milestone 1: Log-Tail CLI

**Description**: Deliver the `logtail` CLI as a single bundled Node script
that follows the fixture service's JSON-line log file across rotation,
parses each line, applies the user's `field=value` filter expression, and
renders the matching events with level-based color and aligned timestamps
when stdout is a TTY. Includes a help screen, a startup header that names
the file being followed, and graceful degradation to plain text when not
attached to a terminal.

**Success Criteria**:
- `logtail <path>` follows the named log file and emits new JSON lines as
  formatted output within 200ms of write.
- Rotating the log file (rename + recreate) causes the CLI to re-open the
  new file within one second and continue without dropping subsequent
  lines.
- Passing `--filter level=error` shows only lines whose top-level `level`
  field equals `error`; combining two `--filter` flags applies both as a
  logical AND.
- Running the CLI with stdout redirected to a file produces plain-text
  output with no ANSI escape sequences.

## Dependency Order

Recommended implementation sequence:

| ID | Title | Depends On | Artifact |
|----|-------|-----------|----------|
| M1 | Log-Tail CLI | — | — |
