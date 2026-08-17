import fs from 'fs';
import path from 'path';

/**
 * Write a skill's bundled reference files into an already-created skill
 * directory, preserving the relative layout the `SKILL.md` body links to
 * (`references/examples.md` stays `references/examples.md`), and return the
 * written paths relative to `baseDir` so the manifest can track them.
 *
 * Shared by all three agent deployers: the files are plain markdown the
 * calling agent reads on demand, so there is nothing per-agent to translate,
 * and a skill whose body links to a file that only shipped on one target
 * would be a dangling link on the other two.
 *
 * Reference files are deliberately *not* marked executable — unlike
 * `scripts/`, nothing runs them.
 *
 * Values arrive as rendered text for `.prompt`-derived entries and as raw
 * `Buffer`s for everything else; `fs.writeFileSync` handles both, and passing
 * the Buffer straight through is what keeps a bundled binary byte-identical.
 */
export function writeSkillResources(
  skillDir: string,
  baseDir: string,
  resources: Map<string, string | Buffer>,
): string[] {
  const written: string[] = [];
  for (const [relPath, content] of resources) {
    const dest = path.join(skillDir, ...relPath.split('/'));
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(dest, content);
    written.push(path.relative(baseDir, dest));
  }
  return written;
}
