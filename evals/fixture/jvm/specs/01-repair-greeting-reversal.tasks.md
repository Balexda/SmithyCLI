# Tasks for greeting reversal

## Slice 1: Repair greeting reversal

**Goal**: Make `GreetingService.reverse` return the input string in reverse order.

### Tasks

- [ ] **Repair `GreetingService.reverse`**

  Run `gradle check` to observe the failing `GreetingServiceTest`. Repair
  `src/main/java/dev/smithy/fixture/GreetingService.java` and rerun `gradle check`.

  _Acceptance criteria:_
  - The existing test passes with its original assertion.
  - `gradle check` succeeds.

## Dependency Order

| ID | Title | Depends On | Artifact |
|----|-------|------------|----------|
| S1 | Repair greeting reversal | — | — |
