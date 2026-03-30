import { describe, it, expect } from 'vitest';
import { flattenPermissions } from './permissions.js';

describe('flattenPermissions', () => {
  it('returns an array of strings', () => {
    const result = flattenPermissions();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      expect(typeof entry).toBe('string');
    }
  });

  it('flattens simple array entries (e.g. ls ["*"])', () => {
    const result = flattenPermissions();
    expect(result).toContain('ls *');
  });

  it('produces bare command for empty args array (e.g. pwd [])', () => {
    const result = flattenPermissions();
    expect(result).toContain('pwd');
  });

  it('flattens nested object entries (e.g. npm."run build" [])', () => {
    const result = flattenPermissions();
    expect(result).toContain('npm run build');
    expect(result).toContain('npm run test');
  });

  it('handles nested object entries with wildcard args (e.g. cargo.build ["*"])', () => {
    const result = flattenPermissions();
    expect(result).toContain('cargo build *');
  });

  it('handles ["", "*"] pattern producing both bare and wildcard entries', () => {
    const result = flattenPermissions();
    // gh pr create has ["", "*"]
    expect(result).toContain('gh pr create');
    expect(result).toContain('gh pr create *');
  });

  it('handles multiple flag variants for same command', () => {
    const result = flattenPermissions();
    // ls has multiple flag variants
    expect(result).toContain('ls -l *');
    expect(result).toContain('ls -la *');
    expect(result).toContain('ls -a *');
  });

  it('handles nested git subcommands with flag variants', () => {
    const result = flattenPermissions();
    expect(result).toContain('git status');
    expect(result).toContain('git status -s');
    expect(result).toContain('git checkout *');
    expect(result).toContain('git checkout -b *');
    expect(result).toContain('git push -u origin feature/*');
  });

  it('flattens gh --version as a bare command', () => {
    const result = flattenPermissions();
    expect(result).toContain('gh --version');
  });

  it('flattens gh repo view with bare and wildcard variants', () => {
    const result = flattenPermissions();
    expect(result).toContain('gh repo view');
    expect(result).toContain('gh repo view *');
  });

  it('does not produce empty strings or undefined entries', () => {
    const result = flattenPermissions();
    for (const entry of result) {
      expect(entry.trim().length).toBeGreaterThan(0);
    }
  });
});
