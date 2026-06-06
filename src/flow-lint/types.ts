/**
 * Shared types for `flow-lint` — the deterministic, Smithy-state-free check
 * that guarantees the UI flow/screen graph in an app repo resolves.
 *
 * The lint operates entirely on files committed to the app repo (EPIC #404
 * layout):
 *
 *   design/flows/<FlowId>.flow.md      — durable flow INTENT annotation
 *   design/screens/<ScreenId>.design.md — durable screen INTENT annotation
 *   maestro/flows/<FlowId>.yaml         — durable flow BEHAVIORAL body
 *
 * It performs no agent calls and reads no Smithy manifest — the repo is the
 * single source of truth. See `docs/flow-lint.md` and the
 * `smithy.helper-flow-definition` skill for the authoring contract these
 * checks enforce.
 */

/** Severity of a single lint finding. */
export type Severity = 'error' | 'warning';

/**
 * Stable machine-readable finding codes. Kept as a closed union so the JSON
 * output is a documented contract and tests can assert on codes rather than
 * brittle message text.
 */
export type FindingCode =
  // A `.flow.md` is missing one of the required front-matter keys.
  | 'flow-frontmatter-missing'
  // A `.flow.md` front-matter block failed to parse as YAML.
  | 'flow-frontmatter-invalid'
  // A flow's `id` does not match its `<FlowId>.flow.md` filename stem.
  | 'flow-id-mismatch'
  // The same `FlowId` is declared by more than one `.flow.md`.
  | 'flow-id-duplicate'
  // A flow's `screens:` entry has no resolving `design/screens/<ScreenId>.design.md`.
  | 'flow-screen-missing'
  // A flow's `maestro:` path does not resolve to an existing file.
  | 'flow-maestro-missing'
  // A flow's `maestro:` path resolves but is not the conventional
  // `maestro/flows/<FlowId>.yaml` location.
  | 'flow-maestro-nonconventional'
  // A `.design.md` is missing one of the required front-matter keys.
  | 'screen-frontmatter-missing'
  // A `.design.md` front-matter block failed to parse as YAML.
  | 'screen-frontmatter-invalid'
  // A screen's `id` does not match its `<ScreenId>.design.md` filename stem.
  | 'screen-id-mismatch'
  // The same `ScreenId` is declared by more than one `.design.md`.
  | 'screen-id-duplicate'
  // A screen's `composable:` path does not resolve to an existing file.
  | 'screen-composable-missing'
  // A `maestro/flows/*.yaml` is referenced by no `.flow.md` (an orphan test).
  | 'maestro-orphan';

/**
 * One lint finding. `path` names the source artifact the finding is about
 * (repo-relative, POSIX separators); `ref` names the *severed* path or id —
 * the specific thing that failed to resolve — so a failure points straight at
 * the broken reference rather than forcing a reader to reconstruct it.
 */
export interface Finding {
  severity: Severity;
  code: FindingCode;
  /** Repo-relative path of the artifact the finding concerns. */
  path: string;
  /** The severed reference (path or id) when the finding is a dangling ref. */
  ref?: string;
  /** Human-readable, single-line description that names the severed path. */
  message: string;
}

/** Result of a full lint run. */
export interface FlowLintResult {
  findings: Finding[];
  errorCount: number;
  warningCount: number;
  /**
   * `true` when the run should be treated as a CI pass: no errors, and (when
   * `strict` is set) no warnings either.
   */
  ok: boolean;
  /** Whether warnings were promoted to failures (`--strict`). */
  strict: boolean;
  flowsScanned: number;
  screensScanned: number;
  maestroScanned: number;
}

/** Options controlling a lint run. */
export interface FlowLintOptions {
  /** Repo root to lint. Defaults to `process.cwd()` at the command layer. */
  root: string;
  /** Directory (relative to root) holding `flows/` and `screens/`. Default `design`. */
  designDir?: string;
  /** Directory (relative to root) holding the Maestro yaml files. Default `maestro/flows`. */
  maestroDir?: string;
  /** Promote every warning to a failure (affects `ok`, not severity labels). */
  strict?: boolean;
}

/** Parsed `<FlowId>.flow.md` front-matter, with the source path attached. */
export interface FlowDoc {
  /** Repo-relative POSIX path to the `.flow.md`. */
  path: string;
  /** Filename stem (the declared-or-expected FlowId). */
  stem: string;
  id?: string;
  screens?: string[];
  maestro?: string;
  /** Set when the front-matter could not be parsed at all. */
  parseError?: string;
}

/** Parsed `<ScreenId>.design.md` front-matter, with the source path attached. */
export interface ScreenDoc {
  /** Repo-relative POSIX path to the `.design.md`. */
  path: string;
  /** Filename stem (the declared-or-expected ScreenId). */
  stem: string;
  id?: string;
  composable?: string;
  parseError?: string;
}
