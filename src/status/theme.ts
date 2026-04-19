/**
 * Terminal theme for the status renderer: color / encoding detection and a
 * bundled {@link Theme} carrying the glyphs, icons, and paint helpers the
 * renderer and summary header consume.
 *
 * The detection helpers ({@link resolveColor} and {@link resolveGlyphs}) read
 * `process.env`, `process.stdout.isTTY`, and `process.platform`. They are
 * exported so tests can exercise each branch independently without relying on
 * the ambient environment. {@link buildTheme} is the one-stop factory that
 * `statusAction` calls once and threads into the renderer. Tests that want a
 * deterministic theme pass hand-rolled bundles through {@link createTheme}
 * instead of touching the detectors.
 */

import pc from 'picocolors';

/**
 * Tree-drawing glyphs plus the hint arrow and bullet. UTF-8 bundle uses the
 * classic box-drawing characters; the ASCII bundle uses characters that
 * survive non-UTF-8 terminals and grep-based log scrapes.
 */
export interface ThemeGlyphs {
  /** Connector prefix for a non-last sibling (`├─ ` / `+- `). */
  branch: string;
  /** Connector prefix for the last sibling of each parent (`└─ ` / `\`- `). */
  lastBranch: string;
  /** Spacer inherited by descendants of a non-last sibling (`│  ` / `|  `). */
  vertical: string;
  /** Blank spacer inherited by descendants of the last sibling (`   `). */
  blank: string;
  /** Next-action hint arrow (`→ ` / `-> `). */
  arrow: string;
  /** Middle-dot separator reserved for summary lines (`·` / `-`). */
  middot: string;
}

/**
 * Status-marker icons rendered alongside each record line.
 */
export interface ThemeIcons {
  done: string;
  inProgress: string;
  notStarted: string;
  unknown: string;
  error: string;
}

/**
 * Paint helpers: each is a string → string transformer. When color is
 * disabled every helper is the identity function so output remains ANSI-free
 * on terminals that would mangle escape sequences.
 */
export interface ThemePaint {
  done: (s: string) => string;
  inProgress: (s: string) => string;
  notStarted: (s: string) => string;
  unknown: (s: string) => string;
  error: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
  white: (s: string) => string;
}

/**
 * Bundled theme threaded through the renderer and the summary header.
 */
export interface Theme {
  /** Whether paint helpers emit ANSI escapes. */
  color: boolean;
  /** Whether glyphs are UTF-8 or ASCII. */
  encoding: 'utf8' | 'ascii';
  glyphs: ThemeGlyphs;
  icons: ThemeIcons;
  paint: ThemePaint;
}

const UTF8_GLYPHS: ThemeGlyphs = {
  branch: '├─ ',
  lastBranch: '└─ ',
  vertical: '│  ',
  blank: '   ',
  arrow: '→ ',
  middot: '·',
};

const ASCII_GLYPHS: ThemeGlyphs = {
  branch: '+- ',
  lastBranch: '`- ',
  vertical: '|  ',
  blank: '   ',
  arrow: '-> ',
  middot: '-',
};

const UTF8_ICONS: ThemeIcons = {
  done: '\u2713',
  inProgress: '\u25D0',
  notStarted: '\u25CB',
  unknown: '\u26A0',
  error: '\u2717',
};

const ASCII_ICONS: ThemeIcons = {
  done: '[x]',
  inProgress: '[~]',
  notStarted: '[ ]',
  unknown: '[?]',
  error: '[!]',
};

const IDENTITY = (s: string): string => s;

const IDENTITY_PAINT: ThemePaint = {
  done: IDENTITY,
  inProgress: IDENTITY,
  notStarted: IDENTITY,
  unknown: IDENTITY,
  error: IDENTITY,
  dim: IDENTITY,
  bold: IDENTITY,
  white: IDENTITY,
};

const COLOR_PAINT: ThemePaint = (() => {
  // picocolors auto-detects TTY / NO_COLOR and returns identity
  // functions when color is off. We've already decided to emit color
  // at this point, so force-enable via `createColors(true)` so the
  // helpers actually emit ANSI escapes regardless of the ambient
  // environment.
  const c = pc.createColors(true);
  return {
    done: c.green,
    inProgress: c.yellow,
    notStarted: c.dim,
    unknown: c.yellow,
    error: c.red,
    dim: c.dim,
    bold: c.bold,
    white: c.white,
  };
})();

/**
 * Resolve whether ANSI color output is appropriate for the current process.
 * Respects the widely-honored `NO_COLOR` (any value disables color) and
 * `FORCE_COLOR` (any truthy value forces color on) env vars, Commander's
 * `--no-color` opt-out, and falls back to detecting an attached TTY.
 */
export function resolveColor(opts: { noColor?: boolean } = {}): boolean {
  if (opts.noColor === true) return false;
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }
  const force = process.env.FORCE_COLOR;
  if (force !== undefined && force !== '' && force !== '0' && force !== 'false') {
    return true;
  }
  return process.stdout.isTTY === true;
}

/**
 * Resolve which glyph bundle to use. Explicit `--ascii` wins; otherwise we
 * fall back to ASCII whenever the locale doesn't advertise UTF-8 or the
 * platform is Windows without an obvious UTF-8 marker — cmd.exe and legacy
 * PowerShell routinely emit mojibake for box-drawing characters.
 */
export function resolveGlyphs(opts: { ascii?: boolean } = {}): 'utf8' | 'ascii' {
  if (opts.ascii === true) return 'ascii';
  const localeSignal = `${process.env.LC_ALL ?? ''};${process.env.LC_CTYPE ?? ''};${process.env.LANG ?? ''}`;
  const hasUtf8 = /utf-?8/i.test(localeSignal);
  if (hasUtf8) return 'utf8';
  if (process.platform === 'win32') return 'ascii';
  return localeSignal.length > 2 ? 'ascii' : 'utf8';
}

/**
 * Factory that takes an already-resolved bundle and stitches it into a
 * {@link Theme}. Useful from tests where deterministic values are preferred
 * over environment-dependent detection.
 */
export function createTheme(params: {
  color: boolean;
  encoding: 'utf8' | 'ascii';
}): Theme {
  const glyphs = params.encoding === 'utf8' ? UTF8_GLYPHS : ASCII_GLYPHS;
  const icons = params.encoding === 'utf8' ? UTF8_ICONS : ASCII_ICONS;
  const paint = params.color ? COLOR_PAINT : IDENTITY_PAINT;
  return {
    color: params.color,
    encoding: params.encoding,
    glyphs,
    icons,
    paint,
  };
}

/**
 * One-stop factory: detects color + encoding from the environment and
 * returns the fully-assembled {@link Theme}. Call once at the top of
 * `statusAction` and thread the result through `renderTree` and the
 * summary header.
 */
export function buildTheme(
  opts: { noColor?: boolean; ascii?: boolean } = {},
): Theme {
  const colorOpts: { noColor?: boolean } = {};
  if (opts.noColor !== undefined) colorOpts.noColor = opts.noColor;
  const glyphOpts: { ascii?: boolean } = {};
  if (opts.ascii !== undefined) glyphOpts.ascii = opts.ascii;
  const color = resolveColor(colorOpts);
  const encoding = resolveGlyphs(glyphOpts);
  return createTheme({ color, encoding });
}
