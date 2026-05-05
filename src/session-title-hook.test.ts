import { describe, it, expect } from 'vitest';
// @ts-expect-error - .mjs import has no type declarations
import { deriveTitle } from './templates/hooks/smithy-session-title.mjs';

describe('deriveTitle', () => {
  describe('cut', () => {
    it('emits <spec-slug>-cut-<storyN> from a spec folder + trailing story number', () => {
      expect(deriveTitle('/smithy.cut specs/2026-03-14-001-evals 3')).toBe('evals-cut-3');
    });

    it('does not zero-pad single-digit story numbers', () => {
      expect(deriveTitle('/smithy.cut specs/2026-03-14-001-evals 1')).toBe('evals-cut-1');
    });

    it('emits <spec-slug>-cut without a number when none is given', () => {
      expect(deriveTitle('/smithy.cut specs/2026-03-14-001-evals')).toBe('evals-cut');
    });

    it('keeps multi-word spec slugs whole', () => {
      expect(
        deriveTitle('/smithy.cut specs/2026-03-14-001-evals-framework 7'),
      ).toBe('evals-framework-cut-7');
    });

    it('returns null when given a bare description (no spec path)', () => {
      expect(deriveTitle('/smithy.cut foo 7')).toBeNull();
    });

    it('returns null with no arguments', () => {
      expect(deriveTitle('/smithy.cut')).toBeNull();
    });
  });

  describe('forge', () => {
    it('emits <spec-slug>-forge-<storyN>-<sliceN> from a tasks file + trailing slice number', () => {
      expect(
        deriveTitle('/smithy.forge specs/2026-03-14-001-evals/03-runner.tasks.md 2'),
      ).toBe('evals-forge-3-2');
    });

    it('uses the spec-folder slug, not the tasks-file slug', () => {
      expect(
        deriveTitle('/smithy.forge specs/2026-03-14-001-evals-framework/12-runner.tasks.md 4'),
      ).toBe('evals-framework-forge-12-4');
    });

    it('emits <spec-slug>-forge-<storyN> without a slice number', () => {
      expect(
        deriveTitle('/smithy.forge specs/2026-03-14-001-evals/03-runner.tasks.md'),
      ).toBe('evals-forge-3');
    });

    it('emits <strike-slug>-forge from a .strike.md file', () => {
      expect(deriveTitle('/smithy.forge feature.strike.md')).toBe('feature-forge');
    });

    it('returns null with no arguments', () => {
      expect(deriveTitle('/smithy.forge')).toBeNull();
    });

    it('returns null for a bare slice number with no path', () => {
      expect(deriveTitle('/smithy.forge 2')).toBeNull();
    });
  });

  describe('strike', () => {
    it('emits <strike-slug>-strike from a .strike.md file (Phase-0 review)', () => {
      expect(deriveTitle('/smithy.strike feature.strike.md')).toBe('feature-strike');
    });

    it('returns null for a description argument', () => {
      expect(deriveTitle('/smithy.strike "add verbose flag"')).toBeNull();
    });

    it('returns null with no arguments', () => {
      expect(deriveTitle('/smithy.strike')).toBeNull();
    });
  });

  describe('ignite', () => {
    it('emits <prd-slug>-ignite from a docs/prds/ path', () => {
      expect(deriveTitle('/smithy.ignite docs/prds/2026-001-foo.prd.md')).toBe('foo-ignite');
    });

    it('emits <rfc-slug>-ignite from a docs/rfcs/ path', () => {
      expect(
        deriveTitle('/smithy.ignite docs/rfcs/2026-001-foo/foo.rfc.md'),
      ).toBe('foo-ignite');
    });

    it('keeps multi-word RFC slugs whole', () => {
      expect(
        deriveTitle('/smithy.ignite docs/rfcs/2026-001-webhook-support/webhook-support.rfc.md'),
      ).toBe('webhook-support-ignite');
    });

    it('returns null for a description argument', () => {
      expect(deriveTitle('/smithy.ignite "build a plugin system"')).toBeNull();
    });
  });

  describe('spark', () => {
    it('emits <prd-slug>-spark when re-running on an existing PRD', () => {
      expect(deriveTitle('/smithy.spark docs/prds/2026-001-foo.prd.md')).toBe('foo-spark');
    });

    it('returns null for a description argument', () => {
      expect(deriveTitle('/smithy.spark "an idea worth a paragraph"')).toBeNull();
    });
  });

  describe('mark', () => {
    it('emits <feature-map-slug>-mark-<N> for a features.md path + feature number', () => {
      expect(
        deriveTitle('/smithy.mark docs/rfcs/2026-001-foo/01-core.features.md 3'),
      ).toBe('core-mark-3');
    });

    it('emits <feature-map-slug>-mark with no trailing number', () => {
      expect(
        deriveTitle('/smithy.mark docs/rfcs/2026-001-foo/01-core.features.md'),
      ).toBe('core-mark');
    });

    it('emits <rfc-slug>-mark from a bare RFC path', () => {
      expect(
        deriveTitle('/smithy.mark docs/rfcs/2026-001-foo/foo.rfc.md'),
      ).toBe('foo-mark');
    });

    it('returns null for a description argument', () => {
      expect(deriveTitle('/smithy.mark "add webhook support"')).toBeNull();
    });
  });

  describe('render', () => {
    it('emits <rfc-slug>-render-<N> for an RFC + milestone number', () => {
      expect(
        deriveTitle('/smithy.render docs/rfcs/2026-002-bar/bar.rfc.md 2'),
      ).toBe('bar-render-2');
    });

    it('emits <rfc-slug>-render without a milestone number', () => {
      expect(
        deriveTitle('/smithy.render docs/rfcs/2026-002-bar/bar.rfc.md'),
      ).toBe('bar-render');
    });

    it('emits <feature-map-slug>-render from a features.md path (Phase-0 review)', () => {
      expect(
        deriveTitle('/smithy.render docs/rfcs/2026-001-foo/01-core.features.md'),
      ).toBe('core-render');
    });

    it('returns null with no arguments', () => {
      expect(deriveTitle('/smithy.render')).toBeNull();
    });
  });

  describe('non-rename commands', () => {
    it('returns null for /smithy.fix', () => {
      expect(deriveTitle('/smithy.fix some bug')).toBeNull();
    });

    it('returns null for /smithy.audit', () => {
      expect(deriveTitle('/smithy.audit')).toBeNull();
    });

    it('returns null for /smithy.orders', () => {
      expect(deriveTitle('/smithy.orders')).toBeNull();
    });

    it('returns null for an unknown smithy command', () => {
      expect(deriveTitle('/smithy.banjo whatever')).toBeNull();
    });
  });

  describe('non-smithy and bad input', () => {
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

    it('is case-insensitive on the smithy prefix', () => {
      expect(deriveTitle('/SMITHY.cut specs/2026-03-14-001-evals 3')).toBe('evals-cut-3');
    });
  });
});
