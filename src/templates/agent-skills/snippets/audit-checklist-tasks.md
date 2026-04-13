## Audit Checklist (.tasks.md)

| Category | What to check |
|----------|---------------|
| **Slice Scoping** | Is each slice PR-sized? Does each have a standalone goal that delivers a working increment — not disconnected scaffolding? |
| **Task Completeness** | Are tasks within each slice sufficient to achieve the slice goal? Are there missing steps (tests, docs, validation)? |
| **Testability** | Is it clear how each slice should be tested? Are integration test concerns addressed? |
| **Edge Case Coverage** | Are boundary conditions, error paths, and failure modes covered in the tasks? |
| **Task Scoping** | Do tasks follow the structured format (bold title + behavioral description + acceptance criteria bullets)? Are any tasks over 150 words? Do tasks reference acceptance scenarios by ID rather than restating their content? Are test mechanics absent (no stub configs, mock patterns, assertion structures, exact error strings, exact function signatures)? Are there standalone test tasks (should be part of TDD), file-reading/research tasks (break fresh-context dispatch), verification tasks (handled by forge), or baked-in test expectations (pre-empt TDD)? |
| **FR Traceability** | Does every slice trace to at least one FR or acceptance scenario? Are any FRs unaddressed? |
| **Specification Debt** | Does the tasks file contain a `## Specification Debt` section before `## Dependency Order`? Are inherited items properly attributed to the source spec? Are any open items resolvable given the current codebase state? |
| **Dependency Order** | If the tasks file contains a `## Dependency Order` section: is it a 4-column Markdown table with headers `ID | Title | Depends On | Artifact`? Does every row use an `S<N>` ID (no leading zeros) that is unique within the table? Does each `Depends On` cell list only IDs from the same table (or `—`)? Does every `S<N>` row's `Artifact` cell contain `—` (slices live inline in the tasks file, so they never link to a separate artifact — flag any path)? Is the recommended implementation sequence logical? Would reordering reduce risk or unblock parallel work? No `[ ]`/`[x]` checkbox syntax is valid here — flag any checkbox markup as a finding. |
