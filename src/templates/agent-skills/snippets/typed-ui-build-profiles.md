When the slice's `.tasks.md` file carries a `**Node Kind**:` metadata line from
a typed UI ledger, apply the matching build profile. A profile changes only how
the implementation itself is carried out — branch handling, review,
documentation, validation, and PR creation stay the same as ordinary work.

- **`SC<N>` / `screen-build` tasks** select the screen-build profile. Every rule
  below is scoped to that profile:
  - Read the referenced `design/screens/<ScreenId>.design.md` before editing any
    implementation files, and treat it as mark-owned durable screen intent.
  - Read the task plan's `**Design Mode**` and `**Design Metadata**` lines
    before choosing the build path. `Design Mode` must be one of `none`,
    `import`, or `brief`; do not infer it from the screen title.
  - Preload the committed design skill named by the screen artifact's
    `design_system` metadata as implementation dialect context. If the screen
    artifact is missing or does not name a design skill, stop instead of
    inventing downstream design truth.
  - Resolve the gating feature `flag` before writing code. Read the task plan's
    `**Design Metadata**` line first; if it does not name a flag, follow the
    spec's `**Source Feature Map**` pointer and read the `flag:` field of the
    owning feature in that `.features.md`. The screen artifact schema carries no
    `flag`, so an absent metadata pointer is not evidence that the feature is
    ungated. If no flag resolves from either source, stop and report it — never
    ship an ungated screen.
  - Build the screen component at the artifact's `component-path`, or the
    project-equivalent path named by the task plan, using the target project's
    existing UI framework and component conventions. Gate the generated screen
    work behind the resolved feature `flag`.
  - Use mock data for screen-build work. Backend story implementation is not
    required for a screen-build slice, even when later flow-wire work will
    connect real data.
  - Represent every brief state named by the screen intent. Use design-system
    tokens and reusable project components for styling; do not introduce
    hardcoded colors or one-off style constants when a project token or
    component convention exists.
  - Route by design mode without creating a visual-gate stall:
    - `Design: none` builds from the committed design skill and the
      `.design.md` intent; no bundle or prototype ceremony is required.
    - `Design: import` carries any supplied bundle context into the build. When
      the metadata or screen artifact names a bundle, read and honor it as the
      visual source context.
    - Bundle-less `Design: brief` builds from the committed design skill and
      the `.design.md` intent. Record in the task/terminal notes that no
      prototype bundle was attached; this is informational context, not an
      implementation failure.
  - Honor any attached `bundle` for layout and visual intent regardless of
    whether it entered through `import` mode or was attached after `mark` for
    `brief` mode. Apply the conflict rule consistently: bundle wins
    layout/visual intent, while the design skill remains authoritative for
    implementation dialect and project conventions. When no bundle is attached,
    fall back to the design skill and `.design.md` intent instead of stopping
    the slice.
  - Request forge's `ui-structural` implementation review profile after the
    slice is built. Review remains read-only and structural: token-only
    styling, reusable project components, project conventions, accessible
    structure including touch-target roles and contrast-token usage, gated
    behavior, mock-data coverage, and every named brief state. Do not ask
    reviewers to judge visual fidelity, run visual diffs, or propose
    pixel-matching work.
  - Refuse to author a new `.design.md` from scratch, and do not modify
    `.design.md` or `.flow.md` files as part of screen-build work. Those durable
    artifacts originate at `mark`; `forge` consumes them.

- **`FL<N>` / `flow-wire` tasks** select the flow-wire profile. Every rule
  below is scoped to that profile:
  - Read the referenced `design/flows/<FlowId>.flow.md` before editing any
    implementation files, and treat it as mark-owned durable flow intent.
  - Read the paired executable test body named by the task plan's
    `**Test Body**` line, or by the flow artifact's `test-body` front-matter
    when the task plan omits it. Create behavior in that existing paired body
    when it is still a stub; if the body is missing despite the `.flow.md`
    contract naming it, stop instead of inventing a different path.
  - Use the task plan's `**Ledger Dependencies**` and `**Flow Data Path**`
    context to decide what must already be real. A mock-satisfiable flow depends
    only on its screen node(s) and can wire against the flagged screen/mock
    state; a real-data-dependent flow also depends on backend `US` nodes and
    must connect to the behavior those backend artifacts provide rather than
    bypassing the dependency.
  - Read the dependent screen context named by the flow's `screens:` metadata
    and any populated upstream task artifacts cited by the ledger dependency
    notes. For backend dependencies, consume the existing spec, data model,
    contracts, and completed backend artifact context exactly as ordinary forge
    work would.
  - Resolve the feature `flag` from the task plan's design metadata, source
    feature map, or upstream screen-build context before writing code. Honor an
    already-enabled flag when the task plan requires it, or flip/remove the gate
    only when the flow-wire task explicitly makes that part of definition of
    done. Do not leave the wired flow unreachable behind the wrong flag state.
  - Put executable user actions and assertions in the paired test body only.
    Represent every guard and traversal assertion named by the `.flow.md` using
    the project's existing UI driver and stable test IDs, accessibility IDs, or
    semantic tags; never rely on visible text, layout position, or prose copied
    into the `.flow.md`.
  - Request forge's `ui-structural` implementation review profile after the
    slice is built. Review remains read-only and structural: stable selector
    usage, guard/traversal coverage in the paired test body, accessible
    structure where applicable, feature-flag correctness, and real-data versus
    mock-data boundaries. Do not ask reviewers to judge visual fidelity, run
    visual diffs, or propose pixel-matching work.
  - Run the paired flow test body as a validation gate when the repository has a
    supported command for that driver. If no targeted flow-test command exists,
    run the closest project test gate and report the validation limitation.
  - Refuse to author a new `.flow.md` from scratch, and do not add executable
    steps, actions, assertions, or driver syntax to `.flow.md`. That durable
    artifact originates at `mark`; `forge` consumes it.

- **`US<N>` / `backend-story` tasks inside a typed UI ledger** select the
  existing backend-story forge path. UI ledger context may explain ordering and
  prerequisite artifacts, but it must not change backend implementation
  mechanics, skip the ordinary spec/data-model/contracts intake, or introduce
  screen-build or flow-wire requirements. Backend-story work must not author
  `.design.md` or `.flow.md` files.
