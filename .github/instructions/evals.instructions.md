---
applyTo: "evals/**"
excludeAgent: "coding-agent"
---
# Reviewing the evals framework and its fixture

`evals/fixture/` is a reference codebase that eval scenarios run against. It
is not a real application, and several of its flaws are planted on purpose.

- **Planted flaws are intentional.** `evals/fixture/README.md` lists each one:
  the missing health-check endpoint, the misleading comment and `TODO` in
  `src/routes/users.ts`, and fixture specs that deliberately break a Smithy
  rule (for example a spec with no `## Dependency Order`). Do not report them
  and do not ask for them to be fixed.
- **A new plant must be documented** in that README in the same pull request,
  with the behaviour it exists to exercise. An undocumented flaw in the
  fixture is a finding.
- **Fixture artifacts are inputs, not plans.** Do not review files under
  `evals/fixture/specs/`, `evals/fixture/rfcs/`, or `evals/fixture/prds/` as
  if they described work for this repository.
- **Do not harden the fixture app.** Validation, error handling, and security
  suggestions for `evals/fixture/src/` change what scenarios measure.
- **Structural checks, not text comparison.** Scenario expectations and
  baselines compare headings, tables, and dispatched sub-agents because model
  output varies between runs. Do not ask for body-text equality.
- Evals call a model and cost money, so they run on demand through
  `npm run eval`, not in default CI. Their unit tests run through
  `npm run test:evals`.
