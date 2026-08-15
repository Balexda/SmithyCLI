/**
 * Generic YAML-frontmatter helpers shared by the per-agent deployers.
 *
 * Smithy templates carry one frontmatter block that has to serve three
 * targets with different vocabularies. Rather than maintain a block per
 * target, each deployer *translates* the single source block into the shape
 * its agent understands — see `agent-models.ts` for the sub-agent translation
 * and `command-frontmatter.ts` for the Claude command translation.
 */

/** Matches a frontmatter block plus the body that follows it. */
const FRONTMATTER_RE = /^(---\s*\n[\s\S]*?\n---\s*\n)([\s\S]*)$/;

/**
 * A top-level YAML key line: unindented `key:` or `key: value`. Continuation
 * lines of a block value (`hooks:` and friends) are indented and therefore do
 * not match, which is what lets {@link filterFrontmatterKeys} carry a nested
 * value along with the key that owns it.
 */
const TOP_LEVEL_KEY_RE = /^([A-Za-z0-9_.-]+)\s*:/;

/**
 * Split a template into its raw frontmatter block (fences included) and body.
 * Returns an empty `frontmatter` when the content has no block.
 */
export function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: '', body: content };
  return { frontmatter: match[1] ?? '', body: match[2] ?? '' };
}

/**
 * Rewrite `content`'s frontmatter to hold only the keys in `allowed`,
 * preserving source order and the exact formatting of every kept line
 * (including indented continuation lines of a block value).
 *
 * Keys are dropped rather than rejected: a template's frontmatter is a union
 * of what all three targets need, so a key this target does not understand is
 * expected, not an error.
 *
 * Content with no frontmatter is returned unchanged. Content whose
 * frontmatter holds no allowed key comes back as a bare body — an empty
 * `---\n---\n` block would be noise, and for a Claude command it is exactly
 * the pre-existing stripped output.
 */
export function filterFrontmatterKeys(content: string, allowed: ReadonlySet<string>): string {
  const { frontmatter, body } = splitFrontmatter(content);
  if (!frontmatter) return content;

  const inner = frontmatter.replace(/^---\s*\n/, '').replace(/\n---\s*\n$/, '');
  const kept: string[] = [];
  let keeping = false;

  for (const line of inner.split('\n')) {
    const isTopLevel = !/^\s/.test(line) && line.trim() !== '';
    if (isTopLevel) {
      const key = line.match(TOP_LEVEL_KEY_RE)?.[1];
      // An unindented line that is not a `key:` line can only be a
      // continuation of a multi-line scalar, so leave `keeping` alone.
      if (key !== undefined) keeping = allowed.has(key);
    }
    if (keeping) kept.push(line);
  }

  // Trailing blank lines belong to whichever key was last kept; they add
  // nothing to the emitted block.
  while (kept.length > 0 && kept[kept.length - 1]!.trim() === '') kept.pop();

  if (kept.length === 0) return body;
  return `---\n${kept.join('\n')}\n---\n${body}`;
}
