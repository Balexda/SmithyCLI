# JVM Gradle Fixture

This directory is a minimal Java Gradle project used by future Smithy eval scenarios that need a non-JavaScript fixture.

## Tooling

This fixture intentionally does not commit a Gradle wrapper. Use a local JDK and system Gradle from `PATH`.

Required tools:

- JDK 17 or newer
- Gradle 8 or newer

No external Java dependencies are declared, so the fixture build does not need network access beyond any local Gradle distribution setup.

## Commands

From `evals/fixture/jvm/`:

```bash
gradle compileJava
gradle check
```

`gradle compileJava` should compile the fixture. `gradle check` compiles source and test classes, then runs `fixtureTest`, which currently fails by design.

## Intentional Failure

`src/main/java/dev/smithy/fixture/GreetingService.java` returns the input string unchanged from `reverse(String)`.

`src/test/java/dev/smithy/fixture/GreetingServiceTest.java` expects that method to return the reversed string. This deterministic failure is the repair target for a future `smithy.forge` JVM slice. The failure is isolated to this fixture and does not require scenario YAML or eval baseline support.

## Maintenance Boundaries

Files under `evals/fixture/jvm/` are owned by the JVM fixture. The existing JavaScript fixture at `evals/fixture/` remains the default eval fixture and should not be moved or changed when maintaining this project.

Generated Gradle directories such as `build/`, `.gradle/`, and `out/` are ignored locally and must not be committed.
