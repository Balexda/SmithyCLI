---
id: D-4
kind: decision
domain: system
title: "Planning commands fork only when their input is self-contained"
status: proposed
decided_at: 2026-08-16
topics: [context-economy, context-fork, planning-commands, one-shot-contract, intake-gates]
scope: [src/templates/agent-skills/commands/**]
applies_to: [deployed commands, Claude command frontmatter, main-conversation context]
supersedes: []
superseded_by: []
establishes: []
---
# Planning commands fork only when their input is self-contained

## Context

A planning command's body lands in the main conversation on invocation and
stays there for the rest of the session. Measured from a real `smithy init`
into a scratch repo, the six one-shot commands come to ~350 KB of deployed
body — `cut` ~20.5k tokens, `ignite` ~19.8k, `mark` ~19.5k, `render` ~15.3k,
`strike` ~8.9k, `spark` ~5.8k. Every figure is *higher* than the audit
recorded, because command bodies grew past the context diet's savings while
the diet was landing. A `mark` → `cut` → `forge` session holds ~49k tokens of
command body at once, none of which the user asked to keep after the command
finished.

Claude Code's `context: fork` runs an invocation in its own context window and
returns only its final message. The one-shot commands look shaped for it, and
D-3 already made `context`, `agent`, and `background` deployable. The
evaluation ([#556](https://github.com/Balexda/SmithyCLI/issues/556)) tested
the mechanism rather than reading it off the docs — four probes against Claude
Code 2.1.233, written up in
`docs/research/2026-08-16-context-fork-evaluation.md`. The mechanism holds:
fork works on `.claude/commands/*.md` and not only on skill directories,
sub-agent dispatch survives it with a layer of depth to spare, and the
one-shot output block returns byte-identical.

Two other findings decided the shape of the rule. A fork cannot see the
conversation that preceded it. And `AskUserQuestion` is removed from every
sub-agent unconditionally — `background: false` does not restore it — so a fork
has no way to ask the user anything at all.

The options were to fork every one-shot command on the strength of the token
arithmetic, to fork none and keep trimming bodies, or to draw the line at what
each command's input actually needs.

## Decision

A planning command runs forked only when its input is self-contained. Three
conditions, all required: the invocation's arguments carry everything the run
needs, with the named artifact supplying the context the conversation would
have; the command never needs to ask the user anything mid-run; and every
intake gate ends in a terminal bail-out naming what was ambiguous and the
exact re-invocation that resolves it, instead of stopping to ask.

On that test, `mark`, `cut`, and `render` fork — large bodies, path-shaped
input, artifacts that carry their own context. `ignite` and `spark` are held:
their input is idea-shaped and usually follows discussion, which is exactly
what a fork cannot see. `strike` does not fork at all — "explore what we just
discussed, then strike it" is its defining use, and forking trades the
smallest body of the four large commands for the property that makes it the
lightweight entry point. `resolve` never forks: it is built on
`AskUserQuestion`, and that exclusion is structural rather than v1 caution.
`audit` and `status` stay in-context because their output *is* the deliverable
and is small; a fork adds a hop for nothing.

Every command that forks declares `background: false`. Detached is wrong
uniformly rather than per command, for three independent reasons: five of the
six branch, commit, and push, which contends for the git index with whatever
the session does next; a detached fork's edits land outside the session's
checkpoints, so `/rewind` cannot undo them; and a detached fork drops to the
narrower background tool set. `agent:` stays unset — the default inherits the
session model and the full tool pool, so a forked command runs on the model it
runs on today.

The bail-out is a prerequisite, not a follow-up. A 15–20k-token body that says
*now do all of this*, handed to a model with no user to ask and a long task
ahead of it, does not stall politely: it picks a target and runs unsupervised
to a pushed PR. Shipping the frontmatter before the bail-out exists trades a
bounded context cost for an unbounded correctness one.

## Consequences

Good: ~39k tokens of main context come back per `mark` → `cut` → `forge`
session from bodies alone, and more leaves with them — each parent command's
own file reads, artifact drafts, sub-agent return summaries, and git output
all stay inside the fork. Per P-1, the decision spends implementation
complexity to buy back context nobody requested, which is the clearest case
the principle covers.

Bad: the split is a standing per-command judgment rather than a rule the
deployer can enforce, and it is not stable against the templates — a held
command whose input shape settles, or a forked command that grows a question,
moves across the line. Each forked command needs its intake gates rewritten
into a bail-out contract that does not exist yet, so the saving is deferred
behind real work. And the fork's blindness to the conversation is invisible at
the call site: nothing warns the user who discussed a feature for a paragraph
and then invoked a forked command that the paragraph did not travel with it.

## Establishes

None.

## Citations

P-1 (always-loaded context is a budget — a 20k-token command body still
resident three turns after the command finished is unrequested context by the
principle's own definition). D-3 (`context`, `agent`, and `background` reach a
Claude deploy only because command frontmatter is translated rather than
stripped). Probes, measurements, and the per-command reasoning:
`docs/research/2026-08-16-context-fork-evaluation.md`. Scope and evidence:
audit [#551](https://github.com/Balexda/SmithyCLI/issues/551), sub-issue
[#556](https://github.com/Balexda/SmithyCLI/issues/556).
