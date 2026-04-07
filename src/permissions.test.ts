import { describe, it, expect } from 'vitest';
import { flattenPermissions, denyPermissions } from './permissions.js';

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

  it('includes Python permissions', () => {
    const result = flattenPermissions();
    expect(result).toContain('pip install *');
    expect(result).toContain('pip freeze');
    expect(result).toContain('pytest *');
    expect(result).toContain('python -m pytest *');
  });

  it('includes npx and nodenv permissions', () => {
    const result = flattenPermissions();
    expect(result).toContain('npx tsc *');
    expect(result).toContain('npx vitest run *');
    expect(result).toContain('npx eslint *');
    expect(result).toContain('npx prettier --write *');
    expect(result).toContain('nodenv version');
    expect(result).toContain('nodenv versions');
    expect(result).toContain('nodenv local *');
    expect(result).toContain('nodenv install *');
    expect(result).toContain('nodenv rehash');
  });

  it('does not allow wildcard npx', () => {
    const result = flattenPermissions();
    // npx should only allow specific subcommands, not arbitrary execution
    expect(result).not.toContain('npx *');
  });

  it('filters npx and nodenv with the node toolchain', () => {
    const nodeOnly = flattenPermissions(['node']);
    expect(nodeOnly).toContain('npx tsc *');
    expect(nodeOnly).toContain('nodenv version');

    const rustOnly = flattenPermissions(['rust']);
    expect(rustOnly.some(e => e.startsWith('npx'))).toBe(false);
    expect(rustOnly.some(e => e.startsWith('nodenv'))).toBe(false);
  });

  it('denies npm publish', () => {
    expect(denyPermissions).toContain('npm publish');
    expect(denyPermissions).toContain('npm publish *');
  });

  it('filters to only node toolchain when languages=["node"]', () => {
    const result = flattenPermissions(['node']);
    expect(result).toContain('npm run build');
    expect(result).toContain('npm run test');
    // Universal permissions should still be present
    expect(result).toContain('git status');
    expect(result).toContain('ls *');
    // Other toolchains should be excluded
    expect(result.some(e => e.startsWith('cargo'))).toBe(false);
    expect(result.some(e => e.startsWith('gradle'))).toBe(false);
    expect(result.some(e => e.startsWith('./gradlew'))).toBe(false);
    expect(result.some(e => e.startsWith('pip'))).toBe(false);
    expect(result.some(e => e.startsWith('pytest'))).toBe(false);
    expect(result.some(e => e.startsWith('python'))).toBe(false);
  });

  it('filters to only rust toolchain when languages=["rust"]', () => {
    const result = flattenPermissions(['rust']);
    expect(result).toContain('cargo build *');
    expect(result).toContain('git status');
    expect(result.some(e => e.startsWith('npm'))).toBe(false);
    expect(result.some(e => e.startsWith('gradle'))).toBe(false);
    expect(result.some(e => e.startsWith('pip'))).toBe(false);
  });

  it('filters to multiple toolchains', () => {
    const result = flattenPermissions(['node', 'python']);
    expect(result).toContain('npm run build');
    expect(result).toContain('pip install *');
    expect(result).toContain('pytest *');
    expect(result).toContain('git status');
    expect(result.some(e => e.startsWith('cargo'))).toBe(false);
    expect(result.some(e => e.startsWith('gradle'))).toBe(false);
  });

  it('includes all permissions when languages is undefined', () => {
    const all = flattenPermissions();
    const withUndefined = flattenPermissions(undefined);
    expect(withUndefined).toEqual(all);
  });

  it('excludes all toolchain permissions when languages is empty array', () => {
    const result = flattenPermissions([]);
    expect(result).toContain('git status');
    expect(result).toContain('ls *');
    expect(result.some(e => e.startsWith('npm'))).toBe(false);
    expect(result.some(e => e.startsWith('cargo'))).toBe(false);
    expect(result.some(e => e.startsWith('gradle'))).toBe(false);
    expect(result.some(e => e.startsWith('pip'))).toBe(false);
    expect(result.some(e => e.startsWith('pytest'))).toBe(false);
    expect(result.some(e => e.startsWith('python'))).toBe(false);
  });
});
