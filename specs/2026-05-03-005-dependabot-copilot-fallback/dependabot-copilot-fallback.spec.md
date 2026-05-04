# Feature Specification: Dependabot + Copilot Fallback Pipeline

**Spec Folder**: `2026-05-03-005-dependabot-copilot-fallback`
**Branch**: `feature/npm-audit`
**Created**: 2026-05-03
**Status**: Draft (pilot in this repo first; broader rollout TBD)
**Input**: Today `npm audit` flags 1 moderate (`postcss`) + 1 high (`vite`), both dev-only deps. Maintainer wants a hands-off, scheduled pipeline that surfaces vulnerability and version-bump fixes as PRs reviewable at leisure, with Copilot Coding Agent as a graceful fallback when straightforward bumps break the build.

## Goals

- Zero maintainer touch in the steady state between disclosure and a PR being ready to review.
- Lean on existing well-supported infrastructure (Dependabot, Copilot Coding Agent) over bespoke scripting.
- Document the behavior so the same pattern can be replicated in other repos after the pilot.

## Non-goals

- Auto-merging PRs. Human review remains required.
- Replacing CI as the green/red source of truth. The existing `Smithy CLI CI` workflow is unchanged.
- Updating runtime ecosystems beyond npm.

## Architecture

Three pieces, each doing one thing.

### 1. Dependabot security updates (one-time repo setting)

Settings → Code security → "Dependabot security updates" = ON. Out-of-band channel: the moment a new GHSA advisory is published against a dep, Dependabot opens a PR — no waiting for any cron.

This is a manual one-time toggle. It cannot be code-managed. The docs page records it as the first setup step.

### 2. `.github/dependabot.yml` — version-update PRs

- `package-ecosystem: npm` at repo root
- `schedule.interval: monthly`
- Group minor/patch bumps into one consolidated PR; majors get their own PRs (where breakage actually lives, so they deserve isolation)
- Labels: `dependencies`, `automated`
- `open-pull-requests-limit: 5`

### 3. `.github/workflows/dependabot-copilot-fallback.yml` — failure handler

- Trigger: `workflow_run` of `Smithy CLI CI`, `types: [completed]`
- Conditions: `conclusion == 'failure'` AND PR head from `dependabot[bot]`
- Action: Post a PR comment that pings `@copilot` with a brief context line and a link to the failed run logs. Copilot Coding Agent picks up the mention, pushes a fix commit to the same branch, CI re-runs.

Permissions: `pull-requests: write` (comment), `actions: read` (read the failed run details), `contents: read`.

### 4. Documentation

- New: `docs/automated-dependency-updates.md` — describes the steady-state flow, the one-time security-updates toggle, what to do when something looks off, and how to roll the pattern out to other repos.
- One-line reference added to `CLAUDE.md` (under a new short "Automated maintenance" line near the Development section).
- One-line reference added to `CONTRIBUTING.md`.

## Data flow

```
Advisory disclosed / monthly tick
  ↓
Dependabot opens PR
  ↓
Smithy CLI CI runs
  ├─ pass → maintainer reviews + merges at leisure
  └─ fail → fallback workflow comments "@copilot please fix..."
            → Copilot Coding Agent commits to same branch
            → CI re-runs → maintainer reviews + merges
```

## Tradeoffs accepted

- **Copilot Coding Agent is non-deterministic.** Sometimes it'll resolve cleanly, sometimes do nothing, sometimes make a confused change. Acceptable because the maintainer reviews before merge — the failure mode is "wasted run," not "ships broken."
- **Two PR streams** (security via toggle, version-updates via cron). Necessary because security needs immediate response while version bumps don't.
- **Manual one-time toggle** for Dependabot security updates. Unavoidable; documented as the first setup step.
- **Pilot scope is one repo.** Reusable cross-repo workflow (`workflow_call`) is deferred until the pattern proves itself here.

## Files added/modified

| Path | New? | Purpose |
|------|------|---------|
| `.github/dependabot.yml` | new | Monthly version-update bumps |
| `.github/workflows/dependabot-copilot-fallback.yml` | new | Pings @copilot when CI fails on a Dependabot PR |
| `docs/automated-dependency-updates.md` | new | User-facing description of the system |
| `CLAUDE.md` | edit | One-line reference to the doc |
| `CONTRIBUTING.md` | edit | One-line reference to the doc |

## Open items / future work

- Verify the exact mention/assignment pattern that triggers Copilot Coding Agent on PR comments — this is evolving GitHub functionality. The docs page is the source of truth and gets updated if the trigger pattern changes.
- After ~2-3 months of piloting in this repo, evaluate rollout to other repos — likely as a reusable `workflow_call` workflow plus a shared `dependabot.yml` template.
- If Copilot Coding Agent proves unreliable for npm bumps specifically, consider a simpler fallback: a workflow step that runs `npm audit fix --force` and pushes the result.
