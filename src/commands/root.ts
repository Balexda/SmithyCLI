import {
  ArtifactRootError,
  resolveArtifactRoot,
  type ResolvedArtifactRoot,
} from '../project-store.js';

/**
 * `smithy root` — report where planning artifacts go for this run.
 *
 * Read-only. The deployed prompts carry one root baked in at `smithy init`;
 * this command applies the run-time rules on top (an explicit `--project`,
 * the artifact being worked on, a single named store for reads, else the
 * install root) and prints the answer in the two spellings an agent needs:
 * the prefix to substitute for the rendered one, and the rendered one so the
 * substitution is a literal find-and-replace rather than an inference.
 *
 * Exit 2 on a user error — an invalid slug, a named project with no store on
 * disk, an unreadable `--from` path — because silently falling back to the
 * install root is precisely how a spec lands in the wrong store.
 */
export interface RootOptions {
  project?: string;
  from?: string;
  write?: boolean;
  format?: 'text' | 'json';
  targetDir?: string;
}

export function rootAction(opts: RootOptions = {}): void {
  let resolved: ResolvedArtifactRoot;
  try {
    resolved = resolveArtifactRoot({
      ...(opts.targetDir !== undefined ? { targetDir: opts.targetDir } : {}),
      project: opts.project,
      from: opts.from,
      mode: opts.write === true ? 'write' : 'read',
    });
  } catch (err) {
    if (err instanceof ArtifactRootError) {
      process.stderr.write(`smithy root: ${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  if (opts.format === 'json') {
    console.log(JSON.stringify(resolved, null, 2));
    return;
  }

  console.log(formatRootText(resolved));
}

/**
 * Text rendering: the prefix on its own first line (so `smithy root | head -1`
 * is the answer), then the facts an operator reads to understand why.
 */
export function formatRootText(r: ResolvedArtifactRoot): string {
  const lines = [
    r.prefix === '' ? '.' : r.prefix,
    `path:     ${r.path}`,
    `kind:     ${r.kind}${r.store ? ' (git-backed store)' : ''}`,
    `rule:     ${r.rule} — ${RULE_LABELS[r.rule]}`,
    `project:  ${r.project ?? '(none)'}`,
    `rendered: ${r.rendered_prefix === '' ? '.' : r.rendered_prefix}`,
  ];
  if (r.warning !== undefined) lines.push(`warning:  ${r.warning}`);
  return lines.join('\n');
}

const RULE_LABELS: Record<ResolvedArtifactRoot['rule'], string> = {
  1: 'explicit --project',
  2: 'declared by the artifact',
  3: 'the only named project store (reads only)',
  4: 'install root',
};
