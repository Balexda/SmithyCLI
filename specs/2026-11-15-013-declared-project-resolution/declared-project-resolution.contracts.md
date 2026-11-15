# Contracts: Declared Project Resolution

## Interfaces

### Shared project helpers

**Consumers**: Planning status, engraved status and the workspace-location query.
**Provider**: One shared CLI project policy; compatibility exports delegate.

```typescript
validateProjectSlug(value: string): Valid | InvalidReason
listNamedProjects(): string[]
readArtifactProject(inputArtifact: string): Declaration | Absent | ArtifactRefusal
resolveDeclaredProject(input: {
  optionProject?: string;
  inputArtifact?: string;
  mode: 'repo' | 'external';
  repositoryKey?: string;
}): ProjectOutcome
```

Names above specify the boundary, not required implementation identifiers. Outcome tags and payloads are defined in the paired data model; F2 owns the public query serialization.

#### Inputs

| Input | Contract |
|-------|----------|
| optionProject | Preserve presence, including empty values; never treat empty as absent |
| inputArtifact | Read only that artifact; no parent-directory or lineage search for declarations |
| mode | Effective install mode; no new mode inference policy |
| repositoryKey | Existing worktree-stable store key; no working-directory fallback as project signal |

#### Outputs

| Operation | Result |
|-----------|--------|
| Validation | Valid or a reason distinguishing syntax and reserved name |
| Enumeration | Sorted valid non-reserved directory names; empty if root absent |
| Header read | One normalized declaration, absent, or artifact refusal |
| Resolution | Exactly one ProjectOutcome; never prompts, creates directories or selects candidates |

#### Error Conditions

| Condition | Response |
|-----------|----------|
| Empty, unsafe or reserved value | invalid-project naming source, value and reason |
| Declarations disagree | project-conflict naming both values; inheritance is not a declaration |
| Declared project directory missing or a regular file | project-missing; no fallback |
| Unreadable artifact or duplicate/malformed header | invalid-artifact naming artifact and reason |
| Undeclared, several stores | candidates, not a guessed selection |

#### Examples

| Context | Outcome |
|---------|---------|
| Option `fleet-sync`, header `fleet-sync`, named directory exists | selected/agreement |
| Option `fleet-sync`, header `billing` | project-conflict with both values |
| Header absent, repo mode, one named directory | none |
| Header absent, repo mode, directories `zeta`, `alpha`, `default` | candidates: `alpha`, `zeta` |
| No declarations, external mode, repository key `service` | selected/repository: `service` |
| Legacy `project: billing` only, repo mode, no named directories | none |

## Events / Hooks

| Surface | Contract |
|---------|----------|
| Events and mutations | None; all operations are read-only |

## Integration Boundaries

| Boundary | Direction | Contract | Failure mode |
|----------|-----------|----------|--------------|
| Artifact metadata | Read | Only document-level `**Project**: value`, outside fenced blocks; optional enclosing backticks | Named artifact refusal |
| Named-project root | Read | Directory existence is authority; no registry or git requirement | Missing root is empty; missing declared directory is project-missing |
| Existing install/repository identity | Input | Reuse the existing store key, identical across main checkout and worktrees | No repository identity means no inheritance |
| Planning and engraved helpers | Output | Import shared policy; no independent precedence or validator | Integration checks reject duplicate policy |
| Workspace query | Output | Consume identity and provenance without reselecting | Location mapping outside F1 |
