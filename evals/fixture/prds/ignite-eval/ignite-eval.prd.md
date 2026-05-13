<!--
Eval fixture plant for the `ignite-from-prd` scenario.

scenario: ignite-from-prd
realism: representative

This PRD is a deliberate fixture used by the evals framework to exercise
`/smithy.ignite`'s Phase 1 PRD-read step and downstream clarify/prose
dispatches. It conforms to the canonical PRD template rendered by
`smithy.spark` (eight sections; the dependency-order section is
deliberately omitted because PRDs sit upstream of the
RFC-feature-spec-tasks lineage and have nothing to order). Do not delete
or "clean up" this file; removing it silently breaks the
`ignite-from-prd` eval.
-->

# PRD: dotfile-sync — One-shot dotfile bootstrap CLI

**Created**: 2026-05-12  |  **Status**: Draft

## Problem Statement

Developers who work across more than one machine — a personal laptop, a work
laptop, a temporary cloud dev box, and the occasional container — spend a
non-trivial amount of time at the start of each new environment hand-copying
dotfiles. The usual workflow is to clone a `dotfiles` repo, then manually
`ln -s` each file into place, then remember which machine had which extra
overrides, then re-create those overrides from memory. It is repetitive,
error-prone, and the divergence between machines quietly grows over time.

The pain is sharpest for engineers who provision short-lived environments
several times per week — students cycling through lab machines, contractors
moving between client laptops, infra engineers SSH'd into freshly-imaged
VMs. The cost is not catastrophic on any one provisioning, but it
compounds, and the recovery path when a machine drifts (an editor that
won't open because a colour-scheme symlink is dangling, a shell that hangs
on a missing prompt module) is disproportionately frustrating.

Existing options ask the user to either commit to a heavyweight
configuration-management framework or to roll their own shell script and
maintain it forever. Neither matches the "I just want my dotfiles on this
new box" use case that motivates the work.

## Proposed Solution

`dotfile-sync` is a single-binary CLI that, given a git URL pointing at a
user's dotfiles repository, bootstraps a new machine in one command:
clones the repo into `~/.dotfiles`, reads a declarative manifest at the
repo root, and creates the symlinks the manifest describes. A subsequent
invocation of the same command on the same machine is a no-op when nothing
has drifted, and reports clearly when something has.

Users observe one command (`dotfile-sync apply <repo-url>`), one place to
edit (`dotfiles.toml` at the root of their dotfiles repo), and one place
their dotfiles live on disk (`~/.dotfiles` plus the symlinks it creates).
No daemons, no background syncs, no opinions about which dotfiles to
include — the manifest is whatever the user writes.

## Target Users

- Polyglot developers who already keep a `dotfiles` git repo and re-clone
  it by hand on each new machine — they encounter the problem every time
  they touch a new environment.
- Engineers who provision short-lived cloud dev boxes (Codespaces,
  Gitpod, ad-hoc EC2) several times per week — they hit the problem at
  the highest frequency.
- Engineers onboarding new teammates onto a shared opinionated dev
  environment — they need a "run this one command" story to hand to a
  new hire on day one.

## Success Signals

- A first-time user can clone a sample dotfiles repo and run
  `dotfile-sync apply` on a fresh Linux or macOS machine and have their
  shell, editor, and git config in place inside 60 seconds, with no
  follow-up manual symlink steps.
- Re-running `dotfile-sync apply` on the same machine reports
  "everything in sync" and exits non-zero only when the user's actual
  on-disk state has drifted from the manifest.
- The README of an early-adopter dotfiles repo can replace its
  hand-written setup script with a single `dotfile-sync apply` line and
  not lose any functionality.

## Alternatives / Build-vs-Buy

### Alternatives Considered

| Name | URL | Category | Fit | Why not |
|------|-----|----------|-----|---------|
| GNU Stow | <https://www.gnu.org/software/stow/> | OSS CLI tool | Close | Requires a strict directory-layout convention in the dotfiles repo; gives no first-run "clone this URL then apply" UX. |
| chezmoi | <https://www.chezmoi.io/> | OSS CLI tool | Partial | Powerful but template-heavy; the templating language is a learning curve the target persona does not want to pay. |
| yadm | <https://yadm.io/> | OSS CLI tool | Partial | Wraps git directly with a bare repo; powerful for advanced users but the conceptual model (working tree IS your home directory) confuses first-time users. |
| Custom shell scripts | — | DIY | Poor | The exact thing the project is trying to retire — each user maintains their own variant forever. |

### Build-vs-Buy Rationale

The closest off-the-shelf candidate is `chezmoi`, which solves a superset
of the problem but charges the user a meaningful templating-language tax
on day one. The target persona — a developer who wants their dotfiles on
a new box and nothing more — drops off before reaching the value. GNU
Stow is conceptually simpler but assumes the user has already cloned the
repo and laid it out correctly. The opportunity is to ship the smallest
possible interface (`apply <url>`) that handles the "I'm on a new machine
right now" path well and leaves heavier configuration management to the
tools that already do it. Building (rather than buying or adopting) is
warranted because the differentiator is UX-shape, not capability.

## Assumptions

- [Critical Assumption] The target persona is willing to keep their
  dotfiles in a git repo. Users who store dotfiles in cloud drives or
  encrypted vaults are out of scope.
- The single-binary CLI is acceptable to install via the platform's
  native package manager (Homebrew on macOS, the user's package manager
  of choice on Linux) — no need for a custom installer.
- Symlinks (not file copies) are the correct on-disk representation —
  users want edits made on one machine, committed, and pulled to flow
  through transparently.

## Specification Debt

| ID | Description | Source Category | Impact | Confidence | Status | Resolution |
|----|-------------|-----------------|--------|------------|--------|------------|
| SD-001 | Windows support is unclear — symlink semantics differ enough that a first cut should likely target macOS + Linux only and explicitly defer Windows. | Functional Scope | High | High | open | — |
| SD-002 | The manifest schema (`dotfiles.toml`) is sketched but not specified — exact key names, conflict-resolution semantics, and whether per-host overrides are first-class fields all need definition. | Domain & Data Model | High | Medium | open | — |
| SD-003 | Behavior when a target symlink already exists and points elsewhere is undefined — overwrite-with-backup vs. refuse-and-warn vs. interactive-prompt all have advocates. | Edge Cases | Medium | Medium | open | — |

## Open Questions

- Should `dotfile-sync` ship a `bootstrap` mode that also installs the
  user's declared package list (Homebrew bundles, `apt` packages) or
  stay strictly in the symlink-only lane?
- How should the tool behave when the dotfiles repo itself is private
  and requires SSH auth that the new machine has not yet configured —
  is there a useful first-run experience or is that user out of scope?
- Is a "dry-run" mode that prints the planned symlink operations and
  exits without touching the filesystem worth shipping in the first
  release, or can it wait?
