A voice tag is one HTML comment on the first non-blank line beneath a `##`
heading:

```
## <Section title>
<!-- audience: <role>[+ai-input]; mode: <mode>; length: <budget>; diagram: <required|recommended|optional>; examples: <required|recommended|discouraged|optional|forbidden>[; applicability: <free-text>] -->
```

Keys and values are lowercase and case-sensitive; pairs are split on `;`.

| Key | Values | Notes |
|-----|--------|-------|
| `audience` | `stakeholder`, `reviewer`, `builder` — optionally with a `+ai-input` suffix (e.g. `builder+ai-input`) when a sub-agent is the primary consumer | Fixed enum (base role). |
| `mode` | `explanation`, `reference`, `how-to`, `tutorial` | Fixed enum. |
| `length` | free-text budget (`2-3 sentences`, `3-6 paragraphs`, `tables only`, `5-15 steps`) | Not enum-checked. |
| `diagram` | `required`, `recommended`, `optional` | Fixed enum. |
| `examples` | `required`, `recommended`, `discouraged`, `optional`, `forbidden` | Fixed enum. `optional` imposes no example constraint. |
| `applicability` | free-text condition (e.g. `code-shaped features only`) | Optional key. Not enum-checked. Licenses an `N/A — <reason>` body. |
