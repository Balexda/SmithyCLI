<!--
  Planted fixture for the `cut-from-spec` eval scenario.

  Realism: representative (NOT scout-flawed).

  This file is one of the three parent artifacts cut's Phase 1 reads from
  this directory. Phase 1 short-circuits if any of the three is missing
  or unparseable, so this file MUST exist and present the canonical
  Smithy contracts section headings even when the feature itself
  introduces no external interfaces.

  DO NOT "fix" anything in this file during routine cleanup. The eval
  treats the file's mere presence and structural validity as a load-bearing
  invariant. See the matching `cut-eval.spec.md` for context.
-->

# Contracts: Add `--dry-run` flag to `smithy init`

## Overview

This feature touches one boundary: the `smithy init` CLI surface. It adds an opt-in boolean flag to the existing command and an additional stdout output mode when that flag is set. No new programmatic interfaces, no new external integrations, no new event surfaces are introduced.

## Interfaces

n/a — internal CLI flag, no external contract. The change is confined to the CLI argument parser and the deployer's compute-vs-write split inside the `init` command implementation. The shape of files Smithy deploys, the shape of the manifest, and every per-agent deployer's signature remain unchanged.

## Events / Hooks

No events are published or subscribed by this feature. `--dry-run` is a synchronous CLI mode; it does not emit, consume, or buffer events.

## Integration Boundaries

The single integration boundary affected is the user-facing CLI surface of `smithy init`. The boundary contract gains one optional flag (`--dry-run`) and one new stdout output mode (the printed deployment plan); no other Smithy command, no third-party tool, and no filesystem layout outside the existing `.claude/`, `.gemini/`, and `.smithy/` deployment targets is involved.
