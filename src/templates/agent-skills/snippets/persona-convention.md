## Persona Artifact Convention

Persona files are durable, cross-RFC reference artifacts. Store them flat at
`{{artifactsRoot}}docs/personas/<slug>.persona.md`, where `<slug>` is a
kebab-case slug derived from the persona name or role. Do not add a date or
sequence prefix. The filename slug is the stable identity for discovery and
matching; `.persona.md` files do not carry a separate machine-readable identity
key such as `slug:` or `**Role**:`, and there is no persona registry or index.

The canonical file shape is:

```markdown
# Persona: <Name/Role>

**Created**: YYYY-MM-DD

<Narrative prose describing the persona's role and context.>

<Narrative prose describing the friction they experience today.>

<Narrative prose describing how their work changes when relevant capabilities ship.>
```

Each persona file contains exactly one persona. The body is narrative prose,
not a bullet inventory, and stays reusable across RFCs rather than tied to one
solution. Persona files sit outside the `## Dependency Order` lineage: they
must not include M/F/US/S identifiers, a `## Dependency Order` section, or an
inline `## Specification Debt` table.
