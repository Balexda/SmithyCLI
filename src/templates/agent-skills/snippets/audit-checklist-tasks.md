## Audit Checklist (.tasks.md)

| Category | What to check |
|----------|---------------|
| **Slice Scoping** | Is each slice PR-sized? Does each have a standalone goal that delivers a working increment — not disconnected scaffolding? |
| **Task Completeness** | Are tasks within each slice sufficient to achieve the slice goal? Are there missing steps (tests, docs, validation)? |
| **Testability** | Is it clear how each slice should be tested? Are integration test concerns addressed? |
| **Edge Case Coverage** | Are boundary conditions, error paths, and failure modes covered in the tasks? |
| **FR Traceability** | Does every slice trace to at least one FR or acceptance scenario? Are any FRs unaddressed? |
| **Dependency Order** | Is the recommended implementation sequence logical? Would reordering reduce risk or unblock parallel work? |
