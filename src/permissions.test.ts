import { describe, it, expect } from 'vitest';
import { flattenPermissions, askPermissions, denyPermissions, extraPermissions } from './permissions.js';

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

  it('includes safe tmux read-only flags', () => {
    const result = flattenPermissions();
    expect(result).toContain('tmux -V');
    expect(result).toContain('tmux -h');
    // No wildcard — other tmux verbs must still require approval.
    expect(result).not.toContain('tmux *');
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

  it('denies force-push without lease', () => {
    expect(denyPermissions).toContain('git push --force');
    expect(denyPermissions).toContain('git push --force *');
    expect(denyPermissions).toContain('git push -f');
    expect(denyPermissions).toContain('git push -f *');
  });

  it('asks (does not deny) force-push with lease so rebase pushes can proceed', () => {
    expect(askPermissions).toContain('git push --force-with-lease');
    expect(askPermissions).toContain('git push --force-with-lease *');
    expect(denyPermissions).not.toContain('git push --force-with-lease');
    expect(denyPermissions).not.toContain('git push --force-with-lease *');
  });

  it('appends extraPermissions (smithy.pr-review script paths) to the flattened allow list', () => {
    const result = flattenPermissions();
    // extraPermissions contents must round-trip through flattenPermissions
    for (const entry of extraPermissions) {
      expect(result).toContain(entry);
    }
    // Specific entries the user expects
    expect(result).toContain('.claude/skills/smithy.pr-review/scripts/find-pr.sh');
    expect(result).toContain('.claude/skills/smithy.pr-review/scripts/get-comments.sh:*');
    expect(result).toContain('*/smithy.pr-review/scripts/find-pr.sh');
    expect(result).toContain('*/smithy.pr-review/scripts/reply-comment.sh:*');
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

describe('flattenPermissions — platform filtering', () => {
  it('includes brew, apt, apt-cache, dpkg by default (no filter)', () => {
    const all = flattenPermissions();
    expect(all).toContain('brew list');
    expect(all).toContain('apt list --installed');
    expect(all).toContain('apt-cache search *');
    expect(all).toContain('dpkg -l');
  });

  it('filter ["mac"] includes brew, excludes apt/apt-cache/dpkg', () => {
    const result = flattenPermissions([], ['mac']);
    expect(result).toContain('brew list');
    expect(result).toContain('brew --version');
    expect(result).toContain('brew info *');
    expect(result.some(e => e.startsWith('apt ') || e === 'apt' || e.startsWith('apt-cache') || e.startsWith('dpkg'))).toBe(false);
    expect(result).toContain('git status'); // universal still present
  });

  it('filter ["linux"] includes apt/apt-cache/dpkg, excludes brew', () => {
    const result = flattenPermissions([], ['linux']);
    expect(result).toContain('apt list');
    expect(result).toContain('apt-cache search *');
    expect(result).toContain('dpkg -l');
    expect(result.some(e => e.startsWith('brew'))).toBe(false);
  });

  it('filter [] (empty platforms) excludes all platform-scoped managers', () => {
    const result = flattenPermissions([], []);
    expect(result.some(e => e.startsWith('brew'))).toBe(false);
    expect(result.some(e => e.startsWith('apt ') || e === 'apt' || e.startsWith('apt-cache'))).toBe(false);
    expect(result.some(e => e.startsWith('dpkg'))).toBe(false);
    expect(result).toContain('git status');
  });

  it('platform filter is independent of language filter', () => {
    const result = flattenPermissions(['python'], ['mac']);
    expect(result).toContain('brew list');
    expect(result).toContain('uv --version');
    expect(result.some(e => e.startsWith('apt-cache'))).toBe(false);
    expect(result.some(e => e.startsWith('cargo'))).toBe(false);
  });
});

describe('flattenPermissions — mutating package-manager commands are NOT auto-allowed', () => {
  const all = flattenPermissions();

  it('does not auto-allow brew install/uninstall/upgrade/reinstall/update/cleanup/tap with arg', () => {
    expect(all).not.toContain('brew install *');
    expect(all).not.toContain('brew uninstall *');
    expect(all).not.toContain('brew upgrade *');
    expect(all).not.toContain('brew reinstall *');
    expect(all).not.toContain('brew update');
    expect(all).not.toContain('brew cleanup *');
    expect(all).not.toContain('brew tap *');
    expect(all.some(e => /^brew (install|uninstall|upgrade|reinstall|cleanup|update|tap) /.test(e))).toBe(false);
  });

  it('does not auto-allow apt install/remove/upgrade/update/purge/autoremove', () => {
    expect(all).not.toContain('apt install *');
    expect(all).not.toContain('apt remove *');
    expect(all).not.toContain('apt upgrade *');
    expect(all).not.toContain('apt update');
    expect(all).not.toContain('apt purge *');
    expect(all).not.toContain('apt autoremove');
    expect(all.some(e => /^apt (install|remove|upgrade|update|purge|autoremove)/.test(e))).toBe(false);
  });

  it('does not auto-allow dpkg -i / -r / -P (install/remove/purge)', () => {
    expect(all).not.toContain('dpkg -i *');
    expect(all).not.toContain('dpkg --install *');
    expect(all).not.toContain('dpkg -r *');
    expect(all).not.toContain('dpkg -P *');
    expect(all).not.toContain('dpkg --remove *');
    expect(all).not.toContain('dpkg --purge *');
  });

  it('does not auto-allow uv global installs, uv remove, uv run, uv self update, uv publish', () => {
    expect(all).not.toContain('uv tool install *');
    expect(all).not.toContain('uv tool uninstall *');
    expect(all).not.toContain('uv tool upgrade *');
    expect(all).not.toContain('uv python install *');
    expect(all).not.toContain('uv python uninstall *');
    expect(all).not.toContain('uv remove *');
    expect(all).not.toContain('uv self update');
    expect(all).not.toContain('uv publish *');
    expect(all.some(e => e.startsWith('uv run'))).toBe(false);
  });

  it('does not auto-allow cargo install/uninstall/publish/login/logout/owner/yank/remove', () => {
    expect(all).not.toContain('cargo install *');
    expect(all).not.toContain('cargo uninstall *');
    expect(all).not.toContain('cargo publish *');
    expect(all).not.toContain('cargo publish');
    expect(all).not.toContain('cargo login');
    expect(all).not.toContain('cargo logout');
    expect(all).not.toContain('cargo owner *');
    expect(all).not.toContain('cargo yank *');
    expect(all).not.toContain('cargo remove *');
  });
});

describe('flattenPermissions — cargo dependency management additions', () => {
  it('includes cargo add/update/fetch/generate-lockfile/package/vendor under rust toolchain', () => {
    const result = flattenPermissions(['rust']);
    expect(result).toContain('cargo add *');
    expect(result).toContain('cargo update');
    expect(result).toContain('cargo update *');
    expect(result).toContain('cargo fetch');
    expect(result).toContain('cargo fetch *');
    expect(result).toContain('cargo generate-lockfile');
    expect(result).toContain('cargo package');
    expect(result).toContain('cargo vendor');
  });

  it('includes cargo query commands under rust toolchain', () => {
    const result = flattenPermissions(['rust']);
    expect(result).toContain('cargo --version');
    expect(result).toContain('cargo search *');
    expect(result).toContain('cargo info *');
    expect(result).toContain('cargo pkgid');
    expect(result).toContain('cargo locate-project');
    expect(result).toContain('cargo verify-project');
  });

  it('preserves pre-existing cargo entries under rust toolchain', () => {
    const result = flattenPermissions(['rust']);
    expect(result).toContain('cargo build *');
    expect(result).toContain('cargo test *');
    expect(result).toContain('cargo fmt *');
    expect(result).toContain('cargo clippy *');
  });
});

describe('flattenPermissions — uv permissions', () => {
  it('includes uv project-dep commands when python toolchain is selected', () => {
    const result = flattenPermissions(['python']);
    expect(result).toContain('uv --version');
    expect(result).toContain('uv add *');
    expect(result).toContain('uv sync');
    expect(result).toContain('uv sync *');
    expect(result).toContain('uv lock');
    expect(result).toContain('uv pip install *');
    expect(result).toContain('uv pip install -r *');
    expect(result).toContain('uv pip freeze');
    expect(result).toContain('uv pip list');
    expect(result).toContain('uv venv');
  });

  it('excludes uv entries when python toolchain is not selected', () => {
    const nodeOnly = flattenPermissions(['node']);
    expect(nodeOnly.some(e => e.startsWith('uv '))).toBe(false);
  });
});

describe('flattenPermissions — regression guard for existing install auto-allows', () => {
  it('keeps existing project-dep install auto-allows intact', () => {
    const all = flattenPermissions();
    expect(all).toContain('npm install');
    expect(all).toContain('npm ci');
    expect(all).toContain('pip install *');
    expect(all).toContain('pip install -r *');
    expect(all).toContain('python -m pip install *');
    expect(all).toContain('python -m pip install -r *');
    expect(all).toContain('nodenv install *');
  });
});
