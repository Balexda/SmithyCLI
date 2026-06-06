## Voice & Audience Tag Lint (cross-cutting)

This lint runs **in addition to** the extension-specific checklist above, on
**every** artifact type that carries per-section voice tags (`.rfc.md`,
`.features.md`, `.spec.md`, `.data-model.md`, `.contracts.md`, `.tasks.md`,
`.strike.md`). It validates the
`<!-- audience: ... -->` HTML comments that sit directly under `##` section
headings — the tagging convention defined by the `smithy.helper-voice` skill
(§8, "Audience tag grammar"). The tags declare each section's intended voice;
this lint surfaces drift between the declared intent and the section's actual
content.

If the artifact contains **no** voice-tag comments at all, skip this lint
entirely and report nothing for it — untagged artifacts are out of scope, not
a finding.

### Tag grammar

A voice tag is a single HTML comment on the first non-blank line beneath a
`##` heading:

```
## <Section title>
<!-- audience: <role>[+ai-input]; mode: <mode>; length: <budget>; diagram: <required|recommended|optional>; examples: <required|recommended|discouraged|optional|forbidden>[; applicability: <free-text>] -->
```

Parse the comment body into `key: value` pairs split on `;`. Keys and values
are case-sensitive and lowercase. Recognized keys and their value domains:

| Key | Value domain | Notes |
|-----|--------------|-------|
| `audience` | `stakeholder`, `reviewer`, `builder` — optionally with a `+ai-input` suffix (e.g. `builder+ai-input`) | Fixed enum (base role). |
| `mode` | `explanation`, `reference`, `how-to`, `tutorial` | Fixed enum. |
| `length` | free-text budget (`2-3 sentences`, `3-6 paragraphs`, `tables only`, `5-15 steps`) | Not enum-checked; parsed for the length budget rule below. |
| `diagram` | `required`, `recommended`, `optional` | Fixed enum. |
| `examples` | `required`, `recommended`, `discouraged`, `optional`, `forbidden` | Fixed enum. `optional` imposes no example constraint. |
| `applicability` | free-text condition (e.g. `code-shaped features only`) | Optional. Not enum-checked. Its presence licenses an `N/A` body (see below). |

### Lint rules

For each tagged `##` section, apply these rules against the section **body**
(everything between this heading and the next `##`/`#` heading or end of file).
Map severities onto the audit's standard labels: **Error → Critical**,
**Warn → Warning**.

| Rule | Trigger | Severity |
|------|---------|----------|
| **Unknown key** | The tag contains a key not in the recognized set above (e.g. a typo like `audiance:`, or an invented key like `tone:`). Report the offending key verbatim. | **Critical** |
| **Unknown value** | A fixed-enum key (`audience`, `mode`, `diagram`, `examples`) carries a value outside its domain (e.g. `mode: reference-guide`, `diagram: mandatory`, `audience: stakeholders`). For `audience`, strip an optional `+ai-input` suffix before checking the base role. Report the offending `key: value` verbatim. | **Critical** |
| **Length budget violated** | The section's actual length materially exceeds (or falls short of) the declared `length:` budget. Count sentences for a `<N>-<M> sentences` budget; count paragraphs for `<N>-<M> paragraphs`; count ordered-list items for `<N>-<M> steps`. **Tolerate ±1 sentence / ±1 paragraph / ±1 step** before flagging — only flag *material* violations (e.g. declared `2-3 sentences`, actual 8). For a `tables only` / `tables / signatures` budget, flag a body that is multi-paragraph narrative prose with no table, signature, schema, or `N/A` line. | **Warning** |
| **Missing required diagram** | `diagram: required` but the section body contains no fenced `mermaid` code block. | **Warning** |
| **Missing required examples** | `examples: required` but the section body contains no fenced code block of any language. | **Warning** |
| **Forbidden examples present** | `examples: forbidden` but the section body **does** contain a fenced code block. | **Warning** |

### The `N/A` exception

A section whose tag declares an `applicability:` condition may legitimately
resolve to a single-line `N/A` body of the form `N/A — <reason>` (em-dash or
`--`/`-`). When the body is such an `N/A` line, the section is **accepted**:
suppress the length-budget, missing-required-diagram, and
missing/forbidden-examples warnings for it — an `N/A` section is intentionally
empty of tables, diagrams, and examples. Unknown-key and unknown-value errors
still apply to the tag itself even when the body is `N/A`.

A body that is `N/A` **without** an `applicability:` directive in the tag is a
**Note** (the author skipped a section the template expected to be filled) —
not a Critical.

### Output

Fold every finding into the standard Audit Report (Critical / Warning / Note),
citing the section heading and quoting the offending tag fragment or the
length count. If every tagged section passes, record a single Note that the
voice-tag lint passed clean. Like the rest of the audit, this lint is
**read-only** — never edit the tags or the artifact to make them pass.
