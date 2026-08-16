# `context: fork` for the Planning Commands — 2026-08-16

Evaluation for [#556](https://github.com/Balexda/SmithyCLI/issues/556)
(audit priority 5 under [#551](https://github.com/Balexda/SmithyCLI/issues/551)),
unblocked by [#552](https://github.com/Balexda/SmithyCLI/issues/552), which
made the Claude deployer translate command frontmatter instead of stripping
it. The outcome recorded here is what
[#574](https://github.com/Balexda/SmithyCLI/issues/574) engraves.

**Verdict: adopt for `mark`, `cut`, and `render`; hold `ignite` and `spark`;
do not fork `strike`.** Adoption is gated on one prerequisite that does not
exist yet — a terminal bail-out shape for the intake gates — because a forked
command has no user to ask and the current templates tell it to ask anyway.
This issue lands the evaluation and the one enabling deploy fix it uncovered;
it deliberately does not flip the frontmatter.

## Method

Two sources, weighted toward the second.

1. Current Claude Code docs (`code.claude.com/docs/en/skills`,
   `/docs/en/sub-agents`) for the documented contract.
2. **Four executed probes** against Claude Code **2.1.233**, run headless in
   throwaway repos. The audit's capability list was written from docs alone;
   several load-bearing claims here contradict what a first read of those docs
   suggests, so behavior was checked rather than inferred.

Probe results are reported below as findings. Where a probe and a plausible
reading of the docs disagree, the probe wins and the disagreement is called
out — one of them (F3) is a trap worth remembering.

## Findings

### F1 — `context: fork` works on `.claude/commands/*.md`, not just skill directories

Smithy deploys commands to `.claude/commands/`, and the fork documentation is
written entirely in terms of `SKILL.md`. Commands and skills are unified, and
a probe command at `.claude/commands/smithy.probe.md` carrying
`context: fork` forked correctly. `$ARGUMENTS` is substituted into the fork's
prompt before the fork starts, and `disable-model-invocation: true` composes
with `context: fork` without interfering — the command stays user-invocable
and stays out of the model registry.

No deployer change is needed for the fork itself. `context` and `agent` are
already in `CLAUDE_COMMAND_FRONTMATTER_KEYS`.

### F2 — Sub-agent dispatch works from inside a fork, with one layer of headroom

This was the audit's main open risk, and it is not a risk. A forked command
holds the `Agent` tool and dispatched a nested `Explore` subagent that
returned its result normally.

The depth arithmetic has room. Claude Code allows three layers below the main
conversation. A forked command is layer 1 and the smithy sub-agents it
dispatches are layer 2, and no smithy sub-agent can spawn anything of its own
— checked all fourteen agent templates, none lists `Agent` in `tools`. Even
`strike`'s agent mode, which fans out several `smithy-plan` runs and follows
with `smithy-reconcile`, stays at layer 2. One layer spare.

### F3 — A subagent's self-report about its own tools is unreliable

Worth recording because it nearly produced the opposite conclusion to F2. A
probe that *asked* the fork whether it had the `Agent` tool answered "no." An
identical probe that *ordered* it to call the tool called it successfully. The
first fork was wrong about its own environment.

Any future capability check on this surface has to be behavioral. Do not
accept a model's description of its own tool pool as evidence — including in
eval scenarios.

### F4 — `AskUserQuestion` is absent from every subagent, forks included

Confirmed by probe and by docs: `AskUserQuestion` is removed by the filter
that applies to *all* subagents, not the narrower background-only filter, so
`background: false` does not restore it. This is unconditional.

`resolve` is the only Smithy command that calls `AskUserQuestion`
(`smithy.resolve.prompt`, one site). #556 already excluded it. That exclusion
is correct and permanent, not a v1 conservatism — resolve cannot be forked at
any point without abandoning its structured-alternatives design.

### F5 — The fork cannot see the conversation, and this is the real cost

Confirmed directly: a session was told a secret word, then invoked a forked
command; the fork could not see it, and the main conversation could.

This is the finding that decides the per-command split, and it is easy to
under-weight because it costs nothing on a well-formed invocation. A command
invoked as `/smithy.mark specs/2026-003-billing/` loses nothing — the path
argument reaches the fork and the artifact carries the context. A command
invoked after a paragraph of discussion loses that paragraph entirely.

### F6 — Backgrounding is the default, and it is the wrong default here

Since 2.1.218 a forked command runs detached unless the frontmatter sets
`background: false`. Detached is wrong for every command in scope, for three
independent reasons, any one of which is sufficient:

- Every one of these commands branches, commits, and pushes. Detached, it does
  that while the user keeps working in the same worktree. Git index contention
  is not a hypothetical for a command whose last phase is `git commit`.
- A detached fork's edits land outside the session's checkpoints, so `/rewind`
  cannot undo them.
- A detached fork also drops to the narrower background tool set. That set
  happens to retain everything Smithy needs — `Read`, `Write`, `Edit`, `Bash`,
  `Grep`, `Glob`, `Skill`, every MCP tool, and `Agent`, which follows the
  depth rule rather than the background filter — so this reason is the weakest
  of the three today. It is also the one most likely to change under Smithy,
  as commands reach for more tools over time.

The blocking mode also preserves today's semantics: invoke, wait, read the
summary.

### F7 — `background` was being silently dropped on the Claude path

`CLAUDE_COMMAND_FRONTMATTER_KEYS` carried `context` and `agent` but not
`background`, so a template declaring `background: false` would have deployed
without it and forked **detached** — precisely the mode F6 rules out. The
failure is silent: unknown keys are dropped, not rejected.

Fixed in this issue, along with a template-lint test that fails any command
declaring `context: fork` without `background: false`. Both land regardless of
whether any command is ever forked, because the trap is in the deployer.

### F8 — The intake gates have no user to talk to, and this is the blocker

Every command in scope stops and asks the user when its input is
under-specified. These are not approval gates — the one-shot contract already
forbids those — they are input disambiguation:

| Command | Gate |
|---------|------|
| `mark` | empty input → ask what to specify; insufficient information → "Stop and wait for the user to provide expanded information" |
| `cut` | empty input → ask which spec and story; several candidate stories → list rows and ask which; insufficient information → stop and wait |
| `render` | empty input → ask for a path; several milestones → list them with their `.features.md` paths and ask which |
| `ignite` | idea too broad → "stop intake and ask the user"; crash recovery → ask the user to confirm the resume |
| `strike` | no clear feature description → ask what to build |
| `spark` | no clear input → ask what idea to workshop |

A probe with a bare ask-the-user gate did the benign thing: the fork ended,
returned the question, and the main conversation relayed it. Costly only in
turns — the user re-invokes with a fuller argument, and the fork's body never
entered main context, so even a wasted spin-up is cheap.

The benign outcome is not the one to plan around. That probe's body contained
*nothing but* the gate. The real bodies are 15–20k tokens of "now do all of
this," and a model with no way to ask, no user, and a long task ahead of it
has every incentive to pick a milestone and proceed. The failure mode is not a
stalled turn — it is an unsupervised full run against the wrong target that
ends in a pushed PR. That is strictly worse than today's behavior, and it is
worse in a way the user does not see until the PR exists.

So forking cannot be a frontmatter-only change. Each forked command needs its
intake gates rewritten from "ask the user" into an explicit terminal bail-out:
a `## Cannot Proceed` output naming what was ambiguous and the exact
re-invocation that resolves it. `strike` already has the shape of this in its
`bail_out` / `bail_out_summary` handling; generalizing it into a snippet the
one-shot contract knows about is the prerequisite.

### F9 — The one-shot output contract survives forking

The fork's final message returns to the main conversation verbatim — probe
output came back byte-identical, including markdown structure. The one-shot
block is exactly the right shape for a fork's return value: it is already
written to be the terminal deliverable, and it is already the only thing the
user reads.

Two shapes need coverage when the prerequisite lands. The PR-failure fallback
is fine as-is: it is text, and text returns. The bail-out shape is the one
being extended by F8, so the terminal-output contract should grow the
`## Cannot Proceed` case alongside it rather than after it.

One caveat carried forward unverified: since 2.1.210 a subagent's report is
scanned for instruction-shaped patterns, which can insert backslashes into
imitated syntax and prepend a marker line. The one-shot block is fenced
markdown with headers and backticks. Nothing in the probe returns tripped it,
but the probe returns were short and the real blocks are long. Worth one eval
scenario before rollout, not worth blocking on.

## Measured context cost

Deployed Claude command bodies, current `main` (`a3d48f7`), measured from a
real `smithy init` into a scratch repo. Token figures are a ~4-chars/token
estimate, not a tokenizer count.

| Command | Deployed | Est. tokens |
|---------|---------:|------------:|
| `cut` | 80.0 KB | ~20.5k |
| `ignite` | 77.2 KB | ~19.8k |
| `mark` | 76.1 KB | ~19.5k |
| `render` | 59.9 KB | ~15.3k |
| `strike` | 34.6 KB | ~8.9k |
| `spark` | 22.5 KB | ~5.8k |
| **in scope (6)** | **350.3 KB** | **~89.7k** |

The audit's figures (mark ~17.3k, ignite ~16k, cut ~16k, render ~10.7k) are
all *lower* than what the tree measures today, despite the context diet in
[#555](https://github.com/Balexda/SmithyCLI/issues/555). The diet targeted
snippet duplication and skill descriptions; command bodies have grown past its
savings since the audit was written. The problem is bigger than #551 recorded,
which strengthens the case rather than weakening it.

### The `mark` → `cut` → `forge` session

Command bodies stay in context across turns once loaded, so a three-command
session holds all three simultaneously:

| | Today | `mark`/`cut` forked |
|---|---:|---:|
| `mark` body | ~19.5k | 0 |
| `cut` body | ~20.5k | 0 |
| `forge` body (out of scope) | ~9.1k | ~9.1k |
| Fork return values (2 × one-shot block) | — | ~1k |
| **Command-body subtotal** | **~49.1k** | **~10.1k** |

~39k tokens of main context recovered from bodies alone, before counting what
else leaves with them: each parent command's own file reads, artifact drafts,
sub-agent return summaries, and git/`gh` output all stay in the fork.

That second bucket deserves its own note, because it is where the intuition
about forking usually goes wrong. Sub-agent dispatch *already* isolates the
exploration — clarify, plan, and plan-review return summaries, not
transcripts. What forking adds on top is the body plus the parent's *own*
tool traffic, and for `mark` and `cut` the parent does a great deal of direct
reading and writing itself. For `strike`, which delegates most of its work to
sub-agents and carries the smallest body of the four large commands, that
second bucket is thin — most of strike's isolation is already bought.

## Recommendation

| Command | Fork? | Why |
|---------|-------|-----|
| `mark` | **Yes** | ~19.5k body, path-shaped input, artifact carries the context F5 removes. Best ratio in the set. |
| `cut` | **Yes** | ~20.5k body, same input shape. |
| `render` | **Yes** | ~15.3k body, path-shaped input. Its several-milestones gate is the most frequently hit in the set, so it needs the F8 bail-out most. |
| `ignite` | **Hold** | ~19.8k body is tempting, but input is idea-shaped and often follows discussion (F5), and its crash-recovery resume gate wants a human. Revisit after mark/cut/render prove out. |
| `spark` | **Hold** | Idea-shaped input, and at ~5.8k the smallest body in scope — least to gain, most exposed to F5. |
| `strike` | **No** | ~8.9k body, and "explore what we just discussed, then strike it" is its defining use. F5 removes exactly that. Forking it trades the cheapest body in the set for the feature that makes it the lightweight entry point. |
| `resolve` | **Never** | F4. Structural, not conservative. |
| `audit`, `status` | **No** | Output *is* the deliverable and is small; a fork adds a hop for nothing. |

`background: false` on every command that forks — F6, no per-command variance.
`spark` is the only plausible detached candidate (read- and web-heavy, one PRD,
little worktree contention), and it is on the hold list anyway; uniformity is
worth more than the one exception.

Leave `agent:` unset. The default `general-purpose` inherits the session model,
so a forked command runs on the same model it runs on today — no quality
regression — and it carries the full tool pool these commands need. Pointing
`agent:` at a narrower type would have to re-grant `Write`, `Bash`, and
`Agent`, buying nothing.

Nothing to do for Gemini or Codex. They keep the source block verbatim and
will receive `context`/`background` as inert keys, the same way they already
receive `disable-model-invocation` and `argument-hint`. This is the existing
accepted tradeoff of one source block serving three targets, not a new
portability problem under D-2/INV-2 — those govern deployable *prose*, and
these keys are metadata that reaches no agent as instruction.

## What this issue lands

- `background` added to `CLAUDE_COMMAND_FRONTMATTER_KEYS`, with a unit test —
  F7, a live trap independent of the rollout decision.
- A template-lint test failing any command that declares `context: fork`
  without `background: false`, so the F6 hazard cannot land by omission.
- This evaluation.

No command template's frontmatter changes. Shipping `context: fork` before the
F8 bail-out exists would trade a bounded context cost for an unbounded
correctness one.

## Follow-up

One issue, scoped to the prerequisite plus the first rollout:

1. Add a `cannot-proceed` snippet — terminal output naming the ambiguity and
   the exact re-invocation that resolves it — and extend the one-shot output
   contract to cover it alongside the existing PR-failure fallback.
2. Rewrite the intake gates in `mark`, `cut`, and `render` from "ask the user"
   to that bail-out.
3. Add `context: fork` + `background: false` to those three.
4. Add an eval scenario asserting the one-shot block returns intact through a
   fork (F9's unverified caveat), and one asserting an under-specified
   invocation bails out instead of guessing (F8's real failure mode).

`ignite` and `spark` follow only if step 4 comes back clean and F5 proves
tolerable in practice. `strike` is out permanently unless its role changes.

Per P-1, this decision spends implementation complexity — a new bail-out
contract and six rewritten intake gates — to buy back ~39k tokens of
always-resident main context per three-command session. P-1 bounds
*unrequested* context, and a 20k-token command body the user did not ask to
keep resident after the command finished is the clearest case of it.
