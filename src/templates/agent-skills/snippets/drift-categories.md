Three failure modes are invisible to a category list aimed at what an
artifact *says*, because they are about how the artifact *carries* what it
says. Assess all three on every pass, in addition to whatever categories
you were handed.

| Category | What to look for |
|----------|------------------|
| **Restated protocol** | The artifact carries its own copy of a rule, table, enum, or contract shape that is defined somewhere else — a parent artifact, a referenced schema, a convention file, or an earlier section of the same document. Tells: the same table appears twice with different column sets; a definition is spelled out where a one-line citation would do; two copies of one rule have drifted apart, so a reader following either reaches a different answer. Report the copy, name the home, and say which one is now wrong if they disagree. |
| **Dead reference** | The artifact points at something that was supposed to already exist and does not: a section heading it names but nothing produces, an identifier (`US4`, `SD-007`, `M2`) absent from the table that defines that level, a path or command it cites as prior art or as the basis for a claim. A reference that resolved when it was written and no longer does is the same finding. **A planning artifact describes work that has not happened yet, so a path, command, module, or section the artifact is proposing to create is not dead — it is the deliverable.** Judge by what the reference is doing: cited as existing today, it must resolve; named as an output of this plan, it must not be touched. When you cannot tell which, say so and leave it. |
| **Internal content in a deliverable** | The artifact carries material addressed to its own authors rather than to the reader who acts on it: notes to future editors, narration of how the artifact was produced, "not yet implemented" and "lands in a later phase" asides, TODO markers, or references that resolve only in the environment the artifact was written in and not in the one it will be read in. |

All three are `hygiene` by construction: each has a knowable correct answer
— delete the copy and cite, correct the stale reference, cut the aside — and
none is a choice a human has to make. Because a `hygiene` finding may be
applied without anyone reviewing the choice, the bar for reporting one is
that you are sure: a finding that would delete content on a guess is not
`hygiene`, and a reference you are unsure about is left alone rather than
proposed for removal.

Run them through the kind gate like any other finding, and expect them to
land there; a restated protocol that seems to need a decision is usually
two findings, one of which is the real disagreement between the copies.
