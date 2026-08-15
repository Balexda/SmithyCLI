When the slice's `.tasks.md` file carries a `**Node Kind**:` metadata line from
a typed UI ledger, apply the matching build profile. A profile changes only how
the implementation itself is carried out — branch handling, review,
documentation, validation, and PR creation stay the same as ordinary work.

- **`SC<N>` / `screen-build` tasks** select the screen-build profile. Every rule
  below is scoped to that profile:
  - Read the referenced `design/screens/<ScreenId>.design.md` before editing any
    implementation files, and treat it as mark-owned durable screen intent.
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
  - Honor an attached `bundle` for layout and visual intent under the conflict
    rule: bundle wins layout/visual intent, while the design skill remains
    authoritative for implementation dialect and project conventions. `brief`
    mode without a bundle and `none` mode are non-blocking; build from the
    design skill and the `.design.md` intent without waiting for a prototype.
  - Refuse to author a new `.design.md` from scratch, and do not modify
    `.design.md` or `.flow.md` files as part of screen-build work. Those durable
    artifacts originate at `mark`; `forge` consumes them.

For non-screen node kinds, follow the selected task plan and the existing
implementation mechanics; do not apply screen-build rules to `FL<N>` or `US<N>`
work.
