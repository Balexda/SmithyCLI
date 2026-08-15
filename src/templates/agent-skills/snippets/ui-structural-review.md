The `ui-structural` review profile is **additive**. It does not replace,
narrow, or excuse any ordinary implementation-review category: correctness
bugs, security issues, contract/data-model conformance, missing test coverage,
error-handling gaps, naming inconsistencies, and scope creep all apply to UI
node work exactly as they apply to backend work. The profile only adds the
structural UI checks below and rules visual fidelity out of scope.

Screen-build (`SC<N>`) work is additionally checked for:

- Styling that uses design-system tokens or the project's existing token APIs
  rather than hardcoded colors or one-off style constants.
- Reuse of existing project components and the local conventions established
  by the diff's neighbors.
- Representation of every brief state named by the referenced `.design.md` or
  task plan.

Flow-wire (`FL<N>`) work is additionally checked for:

- Executable behavior keyed to stable test IDs, accessibility IDs, or semantic
  tags instead of visible text or layout position.
- Every guard and traversal assertion named by the `.flow.md` represented in
  the paired test body.

Both kinds are additionally checked for:

- Feature-flag boundaries and mock-data versus real-data boundaries.
- Accessible structure — touch-target roles, accessible roles and names, and
  contrast-token usage — verified structurally wherever the project's UI
  framework exposes them.

Out of scope, always: pixel matching, visual diffs, palette preference,
spacing taste, typography taste, and whether the result visually matches a
prototype. When a `bundle` is present, use it only to understand the
structural intent the slice had to honor; never turn it into a visual-fidelity
iteration request.
