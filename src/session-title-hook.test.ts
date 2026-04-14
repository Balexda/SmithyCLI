import { describe, it, expect } from 'vitest';
// @ts-expect-error - .mjs import has no type declarations
import { deriveTitle } from './templates/hooks/smithy-session-title.mjs';

describe('deriveTitle', () => {
  it('derives "Evals cut 03" from a smithy.cut spec-folder + story number', () => {
    expect(deriveTitle('/smithy.cut specs/2026-03-14-001-evals 3')).toBe('Evals cut 03');
  });

  it('derives "Runner forge 03 02" from a smithy.forge tasks-file path + slice number', () => {
    expect(
      deriveTitle('/smithy.forge specs/2026-03-14-001-evals/03-runner.tasks.md 2'),
    ).toBe('Runner forge 03 02');
  });

  it('derives "Add strike" from a smithy.strike with a quoted feature description', () => {
    expect(deriveTitle('/smithy.strike "add verbose flag"')).toBe('Add strike');
  });

  it('falls back to "Smithy <cmd>" when there are no arguments', () => {
    expect(deriveTitle('/smithy.orders')).toBe('Smithy orders');
  });

  it('returns null for non-smithy prompts', () => {
    expect(deriveTitle('not a smithy command')).toBeNull();
    expect(deriveTitle('/some-other-command run')).toBeNull();
    expect(deriveTitle('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(deriveTitle(undefined)).toBeNull();
    expect(deriveTitle(null)).toBeNull();
    expect(deriveTitle(42)).toBeNull();
  });

  it('handles a strike file path', () => {
    expect(deriveTitle('/smithy.forge feature.strike.md')).toBe('Feature forge');
  });

  it('handles a bare slug + cut story number', () => {
    expect(deriveTitle('/smithy.cut foo 7')).toBe('Foo cut 07');
  });

  it('handles a bare slice number for forge with no path', () => {
    // No slug recoverable, falls back to Smithy; sliceNum is the trailing 2.
    expect(deriveTitle('/smithy.forge 2')).toBe('Smithy forge 02');
  });

  it('uses branch fallback when no slug is in the prompt', () => {
    expect(deriveTitle('/smithy.audit', { branch: 'feature/evals-runner' })).toBe(
      'Runner audit',
    );
  });

  it('zero-pads single-digit story numbers', () => {
    expect(deriveTitle('/smithy.cut specs/2026-03-14-001-evals 1')).toBe('Evals cut 01');
  });

  it('handles two-digit story and slice numbers', () => {
    expect(
      deriveTitle('/smithy.forge specs/2026-03-14-001-evals/12-runner.tasks.md 11'),
    ).toBe('Runner forge 12 11');
  });

  it('is case-insensitive on the smithy prefix', () => {
    expect(deriveTitle('/SMITHY.cut specs/2026-03-14-001-evals 3')).toBe('Evals cut 03');
  });

  it('only takes the first dash-segment of the slug for the display', () => {
    expect(
      deriveTitle('/smithy.cut specs/2026-03-14-001-evals-framework 3'),
    ).toBe('Evals cut 03');
  });

  it('does not extract a sliceNum for non-forge commands', () => {
    // smithy.strike with a trailing number — the number should NOT become a
    // story or slice ID (only cut consumes trailing ints, only forge keeps
    // them as slice IDs). The slug fallback treats "build" as the first word.
    expect(deriveTitle('/smithy.strike build 5')).toBe('Build strike');
  });
});
