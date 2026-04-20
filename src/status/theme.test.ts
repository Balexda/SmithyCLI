import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildTheme,
  createTheme,
  resolveColor,
  resolveGlyphs,
} from './theme.js';

/**
 * The detection helpers read `process.env` and `process.stdout.isTTY`
 * directly. Snapshot the relevant values before each test and restore
 * them after so one branch can't leak into another.
 */
const ENV_KEYS = ['NO_COLOR', 'FORCE_COLOR', 'LANG', 'LC_ALL', 'LC_CTYPE'];

function snapshotEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    snap[k] = process.env[k];
  }
  return snap;
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS) {
    const v = snap[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

function clearEnv(): void {
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
}

describe('resolveColor', () => {
  let snap: Record<string, string | undefined>;
  let origIsTTY: boolean | undefined;

  beforeEach(() => {
    snap = snapshotEnv();
    clearEnv();
    origIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    restoreEnv(snap);
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: origIsTTY,
    });
  });

  it('returns false when --no-color is set', () => {
    process.env.FORCE_COLOR = '1';
    expect(resolveColor({ noColor: true })).toBe(false);
  });

  it('returns false whenever NO_COLOR is set — including the empty-string case, per no-color.org', () => {
    process.env.NO_COLOR = '1';
    expect(resolveColor()).toBe(false);
    process.env.NO_COLOR = 'yes';
    expect(resolveColor()).toBe(false);
    // no-color.org: "presence of the variable, regardless of value"
    process.env.NO_COLOR = '';
    expect(resolveColor()).toBe(false);
  });

  it('returns true when FORCE_COLOR is truthy, even without a TTY', () => {
    process.env.FORCE_COLOR = '1';
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: false,
    });
    expect(resolveColor()).toBe(true);
  });

  it('returns false when FORCE_COLOR is "0" or "false"', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: false,
    });
    process.env.FORCE_COLOR = '0';
    expect(resolveColor()).toBe(false);
    process.env.FORCE_COLOR = 'false';
    expect(resolveColor()).toBe(false);
  });

  it('falls back to isTTY when no env overrides are set', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: true,
    });
    expect(resolveColor()).toBe(true);
    Object.defineProperty(process.stdout, 'isTTY', {
      configurable: true,
      value: false,
    });
    expect(resolveColor()).toBe(false);
  });

  it('NO_COLOR takes priority over FORCE_COLOR', () => {
    process.env.NO_COLOR = '1';
    process.env.FORCE_COLOR = '1';
    expect(resolveColor()).toBe(false);
  });
});

describe('resolveGlyphs', () => {
  let snap: Record<string, string | undefined>;

  beforeEach(() => {
    snap = snapshotEnv();
    clearEnv();
  });

  afterEach(() => {
    restoreEnv(snap);
  });

  it('returns "ascii" when explicitly requested', () => {
    process.env.LANG = 'en_US.UTF-8';
    expect(resolveGlyphs({ ascii: true })).toBe('ascii');
  });

  it('returns "utf8" when LANG advertises UTF-8', () => {
    process.env.LANG = 'en_US.UTF-8';
    expect(resolveGlyphs()).toBe('utf8');
  });

  it('recognizes both "UTF-8" and "utf8" forms case-insensitively', () => {
    process.env.LANG = 'en_US.utf8';
    expect(resolveGlyphs()).toBe('utf8');
    process.env.LC_ALL = 'C.UTF-8';
    expect(resolveGlyphs()).toBe('utf8');
  });

  it('returns "ascii" when LANG is a non-UTF-8 locale like C', () => {
    process.env.LANG = 'C';
    // On non-Windows platforms this triggers the "locale set but no
    // UTF-8 marker" branch, which returns ASCII.
    const glyphs = resolveGlyphs();
    expect(glyphs).toBe(process.platform === 'win32' ? 'ascii' : 'ascii');
  });

  it('LC_ALL wins over LANG when present', () => {
    process.env.LANG = 'C';
    process.env.LC_ALL = 'en_US.UTF-8';
    expect(resolveGlyphs()).toBe('utf8');
  });

  it('returns "utf8" when no locale env vars are set on non-Windows platforms', () => {
    // Empty signal on POSIX → assume UTF-8. Windows always falls back to
    // ASCII because cmd.exe / legacy PowerShell mangle box-drawing.
    const glyphs = resolveGlyphs();
    expect(glyphs).toBe(process.platform === 'win32' ? 'ascii' : 'utf8');
  });
});

describe('createTheme', () => {
  it('pairs utf8 encoding with UTF-8 glyphs and icons', () => {
    const theme = createTheme({ color: false, encoding: 'utf8' });
    expect(theme.encoding).toBe('utf8');
    expect(theme.glyphs.branch).toBe('\u251C\u2500 ');
    expect(theme.glyphs.lastBranch).toBe('\u2514\u2500 ');
    expect(theme.glyphs.vertical).toBe('\u2502  ');
    expect(theme.glyphs.arrow).toBe('\u2192 ');
    expect(theme.icons.done).toBe('\u2713');
    expect(theme.icons.inProgress).toBe('\u25D0');
    expect(theme.icons.notStarted).toBe('\u25CB');
    expect(theme.icons.unknown).toBe('\u26A0');
    expect(theme.icons.error).toBe('\u2717');
  });

  it('pairs ascii encoding with ASCII glyphs and bracketed icons', () => {
    const theme = createTheme({ color: false, encoding: 'ascii' });
    expect(theme.encoding).toBe('ascii');
    expect(theme.glyphs.branch).toBe('+- ');
    expect(theme.glyphs.lastBranch).toBe('`- ');
    expect(theme.glyphs.vertical).toBe('|  ');
    expect(theme.glyphs.arrow).toBe('-> ');
    expect(theme.icons.done).toBe('[x]');
    expect(theme.icons.inProgress).toBe('[~]');
    expect(theme.icons.notStarted).toBe('[ ]');
    expect(theme.icons.unknown).toBe('[?]');
    expect(theme.icons.error).toBe('[!]');
  });

  it('paint helpers are identity functions when color is disabled', () => {
    const theme = createTheme({ color: false, encoding: 'utf8' });
    expect(theme.color).toBe(false);
    expect(theme.paint.done('hello')).toBe('hello');
    expect(theme.paint.inProgress('hello')).toBe('hello');
    expect(theme.paint.notStarted('hello')).toBe('hello');
    expect(theme.paint.unknown('hello')).toBe('hello');
    expect(theme.paint.error('hello')).toBe('hello');
    expect(theme.paint.dim('hello')).toBe('hello');
    expect(theme.paint.bold('hello')).toBe('hello');
    expect(theme.paint.white('hello')).toBe('hello');
  });

  it('paint helpers wrap strings in ANSI escapes when color is enabled', () => {
    const theme = createTheme({ color: true, encoding: 'utf8' });
    expect(theme.color).toBe(true);
    const painted = theme.paint.done('hello');
    // picocolors emits ANSI escape sequences: `\u001B[<code>mhello\u001B[<reset>m`.
    expect(painted).not.toBe('hello');
    expect(painted).toContain('hello');
    expect(painted).toMatch(/\u001B\[/);
  });
});

describe('buildTheme', () => {
  let snap: Record<string, string | undefined>;

  beforeEach(() => {
    snap = snapshotEnv();
    clearEnv();
  });

  afterEach(() => {
    restoreEnv(snap);
  });

  it('honors --no-color by returning a color-off theme', () => {
    process.env.FORCE_COLOR = '1';
    const theme = buildTheme({ noColor: true });
    expect(theme.color).toBe(false);
  });

  it('honors --ascii by returning an ascii-encoded theme', () => {
    process.env.LANG = 'en_US.UTF-8';
    const theme = buildTheme({ ascii: true });
    expect(theme.encoding).toBe('ascii');
    expect(theme.glyphs.branch).toBe('+- ');
  });

  it('picks up env-driven defaults when no opts are passed', () => {
    process.env.NO_COLOR = '1';
    process.env.LANG = 'en_US.UTF-8';
    const theme = buildTheme();
    expect(theme.color).toBe(false);
    expect(theme.encoding).toBe('utf8');
  });
});
