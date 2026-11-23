---
id: P-2
kind: principle
domain: system
title: "Report what was checked, not what was assumed"
status: active
topics: [verification, negative-results, empty-states, error-reporting]
scope: [src/templates/agent-skills/**]
applies_to: [sub-agent results, command summaries, engraved records, status answers, scans and surveys]
excepts: []
---
# Report what was checked, not what was assumed

## Statement

An agent never turns an unverified negative into a finding of absence.
"None" means everything the claim covers was examined. "Could not verify",
"not scanned", "truncated at the cap", and "failed to create" are separate
outcomes. Each one says what was covered, and none of them is reported as
"none" or "empty". The converse also holds: a fact that a lower layer
already guarantees is relied on, not re-checked.

## Why this is apex

A reader acts on "nothing there" by not looking again. A false negative is
therefore the one error that hides itself, whether it comes from research,
scanning, recall, status, or GitHub operations. That follows from what a
negative result is for, not from any feature's design, so no feature change
unseats it.

## How decisions cite this

Cite P-2 when a decision defines a result shape, an empty state, an error
path, or a cap. Name the outcomes the shape distinguishes. Do not cite it to
demand unbounded checking: a bounded scan that says it was bounded already
complies.
