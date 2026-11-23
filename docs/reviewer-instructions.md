# Reviewer instructions

Automated reviewers read instruction files from this repository as their
prompt. This page says which files exist, who reads them, how they are
layered, how a rule gets added, how CodeRabbit is pointed at the same files,
and how Copilot approvals are switched on.

The files here were placed by hand to get started. Deploying the general
layer through `smithy init`, and moving mechanical checks into a deterministic
command, is tracked in [#622](https://github.com/Balexda/SmithyCLI/issues/622).

## Who reads what

| Reviewer | Reads |
|----------|-------|
| Copilot code review | `.github/copilot-instructions.md`; every `.github/instructions/*.instructions.md` whose `applyTo` matches a changed file; `.github/skills/*/SKILL.md` on demand; `AGENTS.md` and `CLAUDE.md` |
| Codex code review | The `## Code Review Rules` section of `AGENTS.md` |
| CodeRabbit | `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, and `.github/copilot-instructions.md` on its own; the instruction files and skills through `.coderabbit.yaml` (see [CodeRabbit](#coderabbit)) |

Copilot reads these from the pull request's own branch. A change to an
instruction file is therefore reviewed under the changed version, which makes
a rule easy to try and means a pull request can alter its own reviewer.

## Layers

| Layer | Files | Says |
|-------|-------|------|
| Smithy-general | `.github/instructions/smithy.*.instructions.md`, `.github/skills/smithy-*/` | How Smithy artifacts and Smithy-pipeline pull requests work in any repository |
| Repository | Everything else under `.github/instructions/` and `.github/skills/`, the `AGENTS.md` section, and `.coderabbit.yaml` | SmithyCLI's own rules |

General-layer files name nothing that exists only in this repository, so they
can later be deployed elsewhere unchanged. `src/reviewer-instructions.test.ts`
enforces that, along with the shape each reviewer requires and a
4,000-character budget per instruction file.

| File | Applies to | Layer |
|------|------------|-------|
| `smithy.review-stance.instructions.md` | every change | general |
| `smithy.planning-artifacts.instructions.md` | planning artifacts, by suffix | general |
| `planning-artifacts.instructions.md` | `specs/`, `docs/rfcs/`, `docs/prds/` | repository |
| `templates.instructions.md` | `src/templates/` | repository |
| `deployed-snapshot.instructions.md` | the manifest-tracked snapshot | repository |
| `cli-source.instructions.md` | `src/**/*.ts` | repository |
| `evals.instructions.md` | `evals/` | repository |
| `coding-agent.instructions.md` | every change, Copilot coding agent only | repository |
| `smithy-review-planning` skill | on demand | general |
| `smithycli-review-templates` skill | on demand | repository |

## What goes where

- **Instruction files say how to read.** What the files are, the conventions
  that are not defects, the rules a change can break, and which skill to
  load. They are always loaded for the paths they match, so they stay short
  and scope `applyTo` as narrowly as the content allows.
- **Skills say how to review.** The procedure, the checks, and the judgement
  calls. They load on demand.
- **Nothing is stated in both.** A line that fits either belongs in the
  skill.
- **Cite, do not copy.** A rule with a canonical home is referenced, not
  restated:

  | Content | Canonical home |
  |---------|----------------|
  | Per-artifact checklists | `src/templates/agent-skills/snippets/audit-checklist-*.md`, also readable in the deployed `smithy.audit` command |
  | Template-authoring rules | `.claude/rules/template-authoring.md` |
  | Durable commitments | `docs/invariants/`, `docs/decisions/`, `docs/constitution/` |
  | Artifact schemas | `src/templates/agent-skills/README.md` |

## Adding or changing a rule

A rule earns its place when it traces to something observed: a reviewer
finding that was declined with a reason, a defect review missed, or a
maintainer comment restating a convention.

1. **Is it mechanical?** Write a test or lint instead. A reviewer should not
   be asked to check what CI can.
2. **Is it a durable commitment?** Engrave it with `smithy.engrave`, then
   reference the record's ID from the instruction file.
3. **Otherwise** add one bullet to the narrowest file that covers it. Say what
   to flag and name the exception.

A new instruction file or skill, or a changed `applyTo`, also needs its entry
in `.coderabbit.yaml`. The test fails until the two agree.

Phrase a "do not flag" rule as how to weigh a finding, and keep the case that
still deserves a comment. Later-slice work is out of scope for a slice, for
example, but a slice that leaves `master` broken until the next one merges is
still worth saying once.

## Where the rules came from

Each rule traces to pull requests or issues in this repository.

| Rule | Evidence |
|------|----------|
| Review against the slice; later slices and open debt are out of scope | #185, #240, #162, #317, #455 |
| Acceptance criteria are the authority | #268, #223 |
| Completed tasks files are historical | #258 |
| Verify formatting in the raw file | #182, #237, #247, #319 |
| `AS N.M` shorthand and the artifact lineage | #507, #462 |
| No support for paths or headings no template writes | #235, #287 |
| Read the current head and description | #431 |
| No speculative performance work | #266 |
| Post only what would hold the merge | #616, #617 |
| Never ask for the snapshot to be regenerated; one finding per source | #298, #258, #240 |
| Deployed templates stay generic | #258 |
| Portability and no narration of unbuilt work | #456, #428 |
| Compose, do not repeat; a snippet earns its file | #411, #459, #494 |
| A passage copied between templates needs one home (INV-1) | #646, #648, #649 |
| Sub-agent return fields are consumed (INV-4) | #648, #650, #651 |
| Later passes keep earlier work (INV-5) | #648, #650, #651 |
| Side effects survive a re-run; branch only from the default branch (INV-6, D-7) | #648, #649, #652 |
| Declared limits are checked by the orchestrator (INV-7) | #647, #648, #651 |
| Examples match their contract (INV-8) | #648, #649, #650, #651, #653 |
| Absence is reported only when checked (P-2) | #649, #651, #653 |
| Agent gating lives in the consumer | #459 |
| Context budget and load placement | #484, #441 |
| Instructions that change nothing | #464, #468 |
| Behaviour for older artifacts | #453 |
| Altitude of features and stories; stories backed by contracts | #351, #441 |
| Smithy plans only for what it owns | #440, #464 |
| A plan must not silently settle open debt | #449 |
| New debt rows meet the steering bar; code defects become requirements | #632, #633 |
| An empty debt section is not a missing table | #617, #618 |
| Dependencies declared in tasks appear in the spec's table | #495 |
| A planning pull request carries no source changes | #461 |
| `smithy status` surfaces agree | #499, #500, #286, #308 |
| Deployed files are manifest-tracked | #53 |
| The three deployers move together | #57, #55 |
| Deployed output parses and is honoured on the target (INV-3) | #645, #647 |
| One permission grammar | #16, #323 |
| Planted fixture flaws are intentional | #328, #336 |

## CodeRabbit

CodeRabbit is enabled on this repository. It reads the same rule files as
Copilot; `.coderabbit.yaml` holds pointers to them and no rule text.

### What the config adds

| Rule file | Without the config | Entry in `.coderabbit.yaml` |
|-----------|--------------------|-----------------------------|
| `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md` | Read, applied to the whole repository | none |
| `.claude/rules/*.md` | Read, scoped by its `paths` frontmatter | none |
| `.github/instructions/*.instructions.md` | Read, but a guideline file with no path mapping applies only inside its own directory | `files` plus the `applyTo` copied from the file's frontmatter |
| `.github/skills/*/SKILL.md` | Read as an Agent Skill, with no path scope stated | `files` plus the `applyTo` of the instruction file that sends a reviewer to the skill |
| `coding-agent.instructions.md` | Read as above | none: it is excluded from code review |

Each entry sits under `knowledge_base.code_guidelines.filePatterns`. Entries
there add to CodeRabbit's default patterns. They do not replace them.

Copilot loads a skill on demand. CodeRabbit applies it to every change the
entry's `applyTo` matches, so that glob bounds the cost.

`reviews.path_instructions` is not used. It takes rule text inline, up to
20,000 characters per entry, which would be a second copy of the rules.
`src/reviewer-instructions.test.ts` rejects any `instructions` key in the
config, an entry with no `applyTo`, a rule file with no entry, and an
`applyTo` that differs from the file's own.

### Requesting a review

A comment on the pull request, with nothing else on the line:

| Comment | Does |
|---------|------|
| `@coderabbitai review` | Reviews the commits not yet reviewed |
| `@coderabbitai full review` | Reviews the whole pull request again from scratch |
| `@coderabbitai pause` / `@coderabbitai resume` | Stops and restarts automatic review on this pull request; a manual request still works while paused |

Both review commands work whether or not automatic review is on.

### Automatic review

`.coderabbit.yaml` sets `inheritance: true` and leaves `reviews.auto_review`
out, so that choice stays in the CodeRabbit app's settings for this
repository. Without `inheritance: true`, a key the file leaves out falls back
to CodeRabbit's schema default, not to the app's settings. Manual requests
work in every row below.

| Wanted | Setting |
|--------|---------|
| Review every pull request and every push (schema default; drafts are skipped) | `reviews.auto_review.enabled: true` |
| Review on open, then only on request | `reviews.auto_review.auto_incremental_review: false` |
| Review only on request | `reviews.auto_review.enabled: false`, with `labels` and `description_keyword` left empty |
| Review only labelled pull requests | `enabled: false` and `reviews.auto_review.labels: ["<label>"]` |
| Skip pull requests from an author | `reviews.auto_review.ignore_usernames: ["<login>"]` |

A public repository with fewer than 10 stars gets reviews only on request,
whatever this setting says.

Reviews of public repositories are free and carry the knowledge-base features
the config relies on. They are rate-limited per repository, at 1 to 10 reviews
an hour depending on star count, and a requested review counts toward the
limit like an automatic one. If automatic reviews of every push use up the
allowance that requested reviews need, switch to one of the on-request rows.
`@coderabbitai rate limit` says whether a review is available now.

### Sources

Checked against CodeRabbit's documentation on 2026-11-16:

| Claim | Page |
|-------|------|
| Files read by default, including `.claude/rules/` and Agent Skills; a file with no mapping applies only in its own directory; `files` / `applyTo` entries; entries add to the defaults | <https://docs.coderabbit.ai/knowledge-base/code-guidelines> |
| `inheritance` is off unless the file sets it | <https://docs.coderabbit.ai/configuration/configuration-inheritance> |
| `path_instructions` shape and length limit | <https://docs.coderabbit.ai/reference/configuration> |
| Review commands | <https://docs.coderabbit.ai/reference/review-commands> |
| Automatic review settings | <https://docs.coderabbit.ai/configuration/auto-review> |
| Public-repository plan and rate limits | <https://docs.coderabbit.ai/management/plans> |

## Copilot approvals

Copilot code review can submit approving reviews. The feature is off by
default and is switched on in GitHub settings, not in this repository, so
these steps are manual. Labels follow GitHub's documentation as of November
2026 and may differ slightly.

1. **Organization.** Settings → Copilot → policies for code review approvals:
   choose "Let repositories decide" or enable it for this repository.
2. **Repository.** Settings → Copilot → Code review → Auto-approval: turn on
   "Allow Copilot to approve pull requests".
3. **Paths.** In the same place, list the paths Copilot may approve, one glob
   per line. An approval counts only when every changed file matches. Start
   with the output of `smithy.cut`:

   ```
   specs/**/*.tasks.md
   specs/**/*.spec.md
   ```

   The spec glob is there because `cut` sets one `Artifact` cell in the parent
   spec. A glob cannot tell that edit from a rewritten spec; the deterministic
   check in #622 is what will. A new spec from `smithy.mark` also adds
   `.data-model.md` and `.contracts.md`, so it does not match.
4. **Keep these out of the list:** `.github/`, `.claude/`, `AGENTS.md`,
   `CLAUDE.md`, and `src/templates/`. They are the reviewer's own prompt or the
   product's behaviour.

With no ruleset requiring an approval, a Copilot approval is advisory: it is
visible on the pull request and gates nothing. Making it count means adding a
ruleset that requires one approval and enabling "Allow Copilot approvals to
count toward merge requirements". That also changes how every other pull
request merges, because an author cannot approve their own, so decide it
separately.

An approval is dismissed when new commits are pushed. For it to return
without a manual request, enable automatic review with "Review new pushes".

## Checking what a review used

Each Copilot review runs as an Actions job named
`copilot-pull-request-reviewer`, in the workflow "Running Copilot Code
Review". Its log shows what the review was given and what it did with it:

| Log line | Says |
|----------|------|
| `[customInstructions] Built N custom instruction(s) … names=[…]` | The instruction files loaded for the changed paths |
| `[skills] … invoked: name="…"` | Each skill a reviewer loaded |
| `Comment stored (… file=…, start=…, end=…)` | Each comment a reviewer filed, before any is dropped |

As observed in November 2026, one review is three reviewers working
separately. A low- or medium-severity comment is posted only when two of them
file it, and Copilot approves only when no comment is left open, whatever its
severity. One low-severity comment therefore withholds an approval, which is
why the stance file sets a bar for what is worth posting.

## Known gaps

- Copilot catalogs skills from `.claude/skills/` and `.agents/skills/` as well
  as `.github/skills/`: its log counted 11 skills in two directories before
  `.github/skills/` existed here, and 13 in three after. Those counts match
  the skills under `.claude/skills/` plus the ones under `.agents/skills/`
  that neither repeat a name nor set `disable-model-invocation`. A skill
  there whose description fits a review can be loaded by one.
- Two CodeRabbit questions its documentation does not answer: whether it
  reads an instruction file's own `applyTo` frontmatter (if it does, the
  entries are redundant, not wrong), and whether a review command posted by a
  bot account is acted on. The first CodeRabbit review after this lands
  should be checked: its summary lists the guideline files it used under
  "Code guidelines".
- Reviewers have not historically reviewed pull requests opened by bots here.
  A change of pull request identity needs a test pull request first.
- Codex reads only `AGENTS.md`, so its copy of the rules is a short list and a
  pointer to the files above.
- The read/review split relies on a reviewer loading a skill when an
  instruction file tells it to. On the first four pull requests reviewed
  under these files (#615 to #618), all three reviewers loaded the planning
  skill on the three planning changes and the templates skill on the template
  change. If that stops holding, the most valuable checks move back into the
  always-loaded files.
- Pushes after a review are not reviewed again here unless a review is
  requested. A pull request therefore keeps reading "changes recommended"
  after its finding is fixed. Accepted for now, to be revisited.
- The audit checklists lag the templates in one place: they describe only the
  four-column table for a spec. The planning reading file states the valid
  forms until the checklists do.
