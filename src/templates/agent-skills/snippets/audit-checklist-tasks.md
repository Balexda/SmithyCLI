## Audit Checklist (.tasks.md)

| Category | What to check |
|----------|---------------|
| **Slice Scoping** | Is each slice PR-sized? Does each have a standalone goal that delivers a working increment — not disconnected scaffolding? |
| **Task Completeness** | Are tasks within each slice sufficient to achieve the slice goal? Are there missing steps (tests, docs, validation)? |
| **Testability** | Is it clear how each slice should be tested? Are integration test concerns addressed? |
| **Edge Case Coverage** | Are boundary conditions, error paths, and failure modes covered in the tasks? |
| **Task Scoping** | Do tasks follow the structured format (bold title + behavioral description + acceptance criteria bullets)? Are any tasks over 150 words? Do tasks reference acceptance scenarios by ID rather than restating their content? Are test mechanics absent (no stub configs, mock patterns, assertion structures, exact error strings)? Are there standalone test tasks (should be part of TDD), file-reading/research tasks (break fresh-context dispatch), verification tasks (handled by forge), or baked-in test expectations (pre-empt TDD)? |
| **FR Traceability** | Does every slice trace to at least one FR or acceptance scenario? Are any FRs unaddressed? |
| **Dependency Order** | Is the recommended implementation sequence logical? Would reordering reduce risk or unblock parallel work? |
