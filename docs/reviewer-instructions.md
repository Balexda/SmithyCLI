# Reviewer instructions

Automated reviewers read instruction files from this repository as their
prompt. This page says which files exist, who reads them, how they are
layered, how a rule gets added, and how Copilot approvals are switched on.

The files here were placed by hand to get started. Deploying the general
layer through `smithy init`, and moving mechanical checks into a deterministic
command, is tracked in [#622](https://github.com/Balexda/SmithyCLI/issues/622).

## Who reads what

| Reviewer | Reads |
|----------|-------|
| Copilot code review | `.github/copilot-instructions.md`; every `.github/instructions/*.instructions.md` whose `applyTo` matches a changed file; `.github/skills/*/SKILL.md` on demand; `AGENTS.md` and `CLAUDE.md` |
| Codex code review | The `## Code Review Rules` section of `AGENTS.md` |
| CodeRabbit (not enabled here) | `AGENTS.md`, `CLAUDE.md`, and `.claude/rules/` by default |

Copilot reads these from the pull request's own branch. A change to an
instruction file is therefore reviewed under the changed version, which makes
a rule easy to try and means a pull request can alter its own reviewer.

## Layers

| Layer | Files | Says |
|-------|-------|------|
| Smithy-general | `.github/instructions/smithy.*.instructions.md`, `.github/skills/smithy-*/` | How Smithy artifacts and Smithy-pipeline pull requests work in any repository |
| Repository | Everything else under `.github/instructions/` and `.github/skills/`, and the `AGENTS.md` section | SmithyCLI's own rules |

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
| Agent gating lives in the consumer | #459 |
| Context budget and load placement | #484, #441 |
| Instructions that change nothing | #464, #468 |
| Behaviour for older artifacts | #453 |
| Altitude of features and stories; stories backed by contracts | #351, #441 |
| Smithy plans only for what it owns | #440, #464 |
| A plan must not silently settle open debt | #449 |
| An empty debt section is not a missing table | #617, #618 |
| Dependencies declared in tasks appear in the spec's table | #495 |
| A planning pull request carries no source changes | #461 |
| `smithy status` surfaces agree | #499, #500, #286, #308 |
| Deployed files are manifest-tracked | #53 |
| The three deployers move together | #57, #55 |
| One permission grammar | #16, #323 |
| Planted fixture flaws are intentional | #328, #336 |

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
- The audit checklists lag the templates in two places: they describe only the
  four-column table for a spec, and they ask for a debt index table without
  mentioning its two empty forms. The planning reading file states the valid
  forms for both until the checklists do.
