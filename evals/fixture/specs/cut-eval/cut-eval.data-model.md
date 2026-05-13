<!--
  Planted fixture for the `cut-from-spec` eval scenario.

  Realism: representative (NOT scout-flawed).

  This file is one of the three parent artifacts cut's Phase 1 reads from
  this directory. Phase 1 short-circuits if any of the three is missing
  or unparseable, so this file MUST exist and present the canonical
  Smithy data-model section headings even when the feature itself
  introduces no new entities.

  DO NOT "fix" anything in this file during routine cleanup. The eval
  treats the file's mere presence and structural validity as a load-bearing
  invariant. See the matching `cut-eval.spec.md` for context.
-->

# Data Model: Add `--dry-run` flag to `smithy init`

## Overview

This feature adds a CLI flag to `smithy init` and changes its execution flow from "compute-and-write" to "compute, then optionally write". It introduces no persistent entities, no new types, and no new storage; the existing in-memory deployment-plan structure suffices.

## Entities

n/a — flag-only feature. No new persistent entities, no new TypeScript types, no new storage. The existing in-memory list of `(agent, sourceTemplate, destinationPath, mode)` tuples computed by the deployer is reused as-is to produce the dry-run plan output.

## Relationships

No new relationships. The existing relationship between an agent deployer and its destination paths is unchanged; `--dry-run` only suppresses the write step.

## State Transitions

The `init` command's per-invocation lifecycle gains one branch:

1. `parsing` → `planning` → `writing` → `manifest-update` → `done` (current default behavior, unchanged when `--dry-run` is absent or `false`).
2. `parsing` → `planning` → `printing-plan` → `done` (new branch when `--dry-run` is `true`).

No persistent state machine is introduced.

## Identity & Uniqueness

No identity or uniqueness rules apply — this feature stores nothing.
