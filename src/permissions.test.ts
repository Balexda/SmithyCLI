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
    expect(result).toContain('git push -u origin *');
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

  it('auto-allows force-push with lease so AI-driven rebases do not block on confirmation', () => {
    const result = flattenPermissions();
    expect(result).toContain('git push --force-with-lease');
    expect(result).toContain('git push --force-with-lease origin *');
    // The lease check is the safety boundary; do not deny or ask the bare /
    // explicit-origin shapes.
    expect(denyPermissions).not.toContain('git push --force-with-lease');
    expect(denyPermissions).not.toContain('git push --force-with-lease origin *');
    expect(askPermissions).not.toContain('git push --force-with-lease');
    expect(askPermissions).not.toContain('git push --force-with-lease *');
  });

  it('does NOT auto-allow an unrestricted wildcard after `--force-with-lease`', () => {
    // Regression guard for PR #304 review: `Bash(git push --force-with-lease *)`
    // would match `git push --force-with-lease --force origin <branch>`, which
    // bypasses the lease check (Git's `--force` overrides `--force-with-lease`).
    const result = flattenPermissions();
    expect(result).not.toContain('git push --force-with-lease *');
  });

  it('denies smuggling `--force` / `-f` after `--force-with-lease`', () => {
    // Belt-and-suspenders against the same bypass: even if a future allow
    // change accidentally re-introduces the unrestricted wildcard, the
    // dangerous combinations stay blocked.
    expect(denyPermissions).toContain('git push --force-with-lease --force');
    expect(denyPermissions).toContain('git push --force-with-lease --force *');
    expect(denyPermissions).toContain('git push --force-with-lease -f');
    expect(denyPermissions).toContain('git push --force-with-lease -f *');
    expect(denyPermissions).toContain('git push --force-with-lease origin --force');
    expect(denyPermissions).toContain('git push --force-with-lease origin --force *');
    expect(denyPermissions).toContain('git push --force-with-lease origin -f');
    expect(denyPermissions).toContain('git push --force-with-lease origin -f *');
  });

  it('does NOT include extraPermissions (Claude-only entries that would leak into Gemini)', () => {
    // Regression guard for PR #290 review feedback: extraPermissions used to
    // be appended inside flattenPermissions(), which Gemini's allowlist also
    // consumes — leaking `.claude/...` paths and `:*` argument-suffix syntax
    // into Gemini. They now live in buildClaudeAllowList() instead.
    const result = flattenPermissions();
    for (const entry of extraPermissions) {
      expect(result).not.toContain(entry);
    }
    expect(result).not.toContain('.claude/skills/smithy.pr-review/scripts/find-pr.sh');
    expect(result).not.toContain('*/smithy.pr-review/scripts/get-comments.sh:*');
  });

  it('still exports extraPermissions with the smithy.pr-review entries (consumed by buildClaudeAllowList)', () => {
    // The smithy.pr-review skill keeps its `gh`-based shell scripts as a
    // fallback for hosts without the GitHub MCP server (issue #261). The
    // script-path entries must stay in extraPermissions so the deployed
    // Claude allow list lets the scripts run without prompting.
    expect(extraPermissions).toContain('.claude/skills/smithy.pr-review/scripts/find-pr.sh');
    expect(extraPermissions).toContain('.claude/skills/smithy.pr-review/scripts/get-comments.sh *');
    expect(extraPermissions).toContain('.claude/skills/smithy.pr-review/scripts/reply-comment.sh *');
    expect(extraPermissions).toContain('.claude/skills/smithy.pr-review/scripts/add-comment.sh *');
    expect(extraPermissions).toContain('*/smithy.pr-review/scripts/find-pr.sh');
    expect(extraPermissions).toContain('*/smithy.pr-review/scripts/get-comments.sh *');
    expect(extraPermissions).toContain('*/smithy.pr-review/scripts/reply-comment.sh *');
    expect(extraPermissions).toContain('*/smithy.pr-review/scripts/add-comment.sh *');
  });

  it('gives the smithy.gh-issue scripts the same settings-level fallback (issue #559)', () => {
    // Without these, `smithy.orders` and `smithy.engrave` hit a permission
    // prompt per issue on any host that does not apply the skill's own
    // `allowed-tools` grant.
    expect(extraPermissions).toContain('.claude/skills/smithy.gh-issue/scripts/check-env.sh');
    expect(extraPermissions).toContain('.claude/skills/smithy.gh-issue/scripts/search-issues.sh *');
    expect(extraPermissions).toContain('.claude/skills/smithy.gh-issue/scripts/create-issue.sh *');
    expect(extraPermissions).toContain('.claude/skills/smithy.gh-issue/scripts/link-blocked-by.sh *');
    expect(extraPermissions).toContain('*/smithy.gh-issue/scripts/check-env.sh');
    expect(extraPermissions).toContain('*/smithy.gh-issue/scripts/search-issues.sh *');
    expect(extraPermissions).toContain('*/smithy.gh-issue/scripts/create-issue.sh *');
    expect(extraPermissions).toContain('*/smithy.gh-issue/scripts/link-blocked-by.sh *');
  });

  it('grants `smithy status` and nothing else from the smithy CLI (issue #559)', () => {
    // The smithy.status skill auto-activates on plain questions, so its read
    // path needs a session-level grant; the write subcommands stay
    // operator-driven.
    const result = flattenPermissions();
    expect(result).toContain('smithy status');
    expect(result).toContain('smithy status *');
    for (const sub of ['init', 'update', 'uninit']) {
      expect(result.some(entry => entry.startsWith(`smithy ${sub}`))).toBe(false);
    }
  });

  it('writes every Bash rule in the space-wildcard form (issue #559)', () => {
    // One grammar across settings.json and the skills' allowed-tools: a
    // trailing ` *`, never `:*` (a second spelling of the same thing) and
    // never a `cmd*` glued to a command or flag token, which drops the word
    // boundary and would match `cmdother`. A `*` after a path separator is a
    // path glob, not a command wildcard, and is left alone. See
    // docs/permission-grammar.md.
    for (const rule of [...flattenPermissions(), ...extraPermissions]) {
      expect(rule, rule).not.toContain(':*');
      expect(rule, rule).not.toMatch(/[A-Za-z0-9_.-]\*/);
    }
    // The deny list is the one place a glued wildcard is deliberate: `sed -i*`
    // has to catch the suffix form `sed -i.bak` as well as `sed -i`.
    for (const rule of denyPermissions) {
      expect(rule, rule).not.toContain(':*');
    }
  });

  it('keeps the destructive shell primitives out of the allow list (issue #559)', () => {
    const result = flattenPermissions();
    // `mv` and `tee` overwrite files outside the agent's Edit/Write tools and
    // no shipped template calls either; `git mv` covers the tracked rename.
    expect(result.some(entry => entry === 'mv *' || entry.startsWith('mv '))).toBe(false);
    expect(result.some(entry => entry.startsWith('tee'))).toBe(false);
    expect(result).toContain('git mv *');
    // `sed -i` is gone from the table (which is what removes it for Gemini)
    // and denied outright (which is what removes it for Claude, where the
    // bare `sed *` rule would otherwise cover the flag).
    expect(result).toContain('sed *');
    expect(result.some(entry => entry.startsWith('sed -i'))).toBe(false);
    expect(denyPermissions).toContain('sed -i*');
    expect(denyPermissions).toContain('sed --in-place*');
    // `find` stays broad, but not for the two forms that run or delete.
    expect(result).toContain('find *');
    expect(denyPermissions).toContain('find * -exec *');
    expect(denyPermissions).toContain('find * -delete');
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

describe('external artifact store permissions', () => {
  const result = flattenPermissions();

  it('allows committing to a repo-keyed store via git -C', () => {
    // `git -C <store> commit` is how agents record artifact changes in
    // external mode. Permission matching is prefix-based on the whole
    // command string, so these need their own entries — the bare
    // `git commit -m *` never matches a `-C`-prefixed invocation.
    expect(result).toContain('git -C ~/.smithy/repos/* add -A');
    expect(result).toContain('git -C ~/.smithy/repos/* commit -m *');
  });

  it('allows committing to the shared project store', () => {
    expect(result).toContain('git -C ~/.smithy/projects/* add -A');
    expect(result).toContain('git -C ~/.smithy/projects/* commit -m *');
  });

  it('covers the trailing-slash path the prompts actually emit', () => {
    // `{{artifactsRoot}}` always ends in `/`, so agents emit
    // `git -C ~/.smithy/repos/<key>/ add -A`. Matching that against the bare
    // `~/.smithy/repos/* …` form would need `*` to swallow the separator,
    // which permission wildcards do not reliably do — so the `*/` form has
    // to be listed too or every commit hits an approval prompt.
    expect(result).toContain('git -C ~/.smithy/repos/*/ add -A');
    expect(result).toContain('git -C ~/.smithy/repos/*/ commit -m *');
    expect(result).toContain('git -C ~/.smithy/projects/*/ add -A');
    expect(result).toContain('git -C ~/.smithy/projects/*/ commit -m *');
  });

  it('covers the --no-gpg-sign commit form the prompts specify', () => {
    // The prompt tells agents to pass --no-gpg-sign so a machine with
    // `commit.gpgsign` set doesn't block on a passphrase. That flag form is
    // a different command string, so it needs its own entry.
    expect(result).toContain('git -C ~/.smithy/repos/*/ commit --no-gpg-sign -m *');
    expect(result).toContain('git -C ~/.smithy/projects/*/ commit --no-gpg-sign -m *');
  });

  it('uses tilde paths so no developer home directory is committed', () => {
    // These strings land in a shared .claude/settings.json.
    for (const entry of result) {
      if (entry.startsWith('git -C ')) {
        expect(entry).toMatch(/^git -C ~\/\.smithy\//);
      }
    }
  });

  it('does not auto-allow pushing or destructive commands against a store', () => {
    // Syncing a store to a remote is the user's decision, and history is the
    // whole point of the store — an agent must not be able to reset it.
    const storeEntries = result.filter((e) => e.startsWith('git -C '));
    expect(storeEntries.length).toBeGreaterThan(0);
    for (const entry of storeEntries) {
      expect(entry).not.toContain(' push');
      expect(entry).not.toContain(' reset');
      expect(entry).not.toContain(' clean');
      expect(entry).not.toContain(' checkout');
    }
  });
});
