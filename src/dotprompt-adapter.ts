import { Dotprompt } from 'dotprompt';

const dp = new Dotprompt();

export interface ParsedTemplate {
  name: string | undefined;
  description: string | undefined;
  tools: string[] | undefined;
  model: string | undefined;
  frontmatter: Record<string, unknown>;
  body: string;
  raw: string;
}

/**
 * Parse a template string using Dotprompt's YAML frontmatter parser.
 * Returns structured metadata and the template body (frontmatter stripped).
 */
export function parseTemplate(content: string): ParsedTemplate {
  const parsed = dp.parse(content);
  return {
    name: parsed.name,
    description: parsed.description,
    tools: parsed.tools,
    model: parsed.model,
    frontmatter: parsed.raw ?? {},
    body: parsed.template,
    raw: content,
  };
}

/**
 * Resolve Handlebars partials in a template string via Dotprompt's render().
 *
 * Captures the original frontmatter via regex and reattaches it after rendering
 * to preserve exact YAML formatting. Dotprompt's render() handles frontmatter
 * parsing internally — we just need the original text back verbatim.
 *
 * Uses Dotprompt's rendering pipeline so future features (schemas, helpers,
 * variables) are available without further refactoring.
 */
export async function resolvePartials(
  content: string,
  partials: Map<string, string>,
): Promise<string> {
  // If there are no partial references, skip rendering entirely
  if (!content.includes('{{>')) {
    return content;
  }

  // Capture original frontmatter text for verbatim reattachment after render.
  const frontmatterMatch = content.match(/^(---\s*\n[\s\S]*?\n---\s*\n)/);
  const frontmatter = frontmatterMatch?.[1] ?? '';

  const instance = new Dotprompt({ partials: Object.fromEntries(partials) });
  const result = await instance.render(content, {});
  const rendered = result.messages
    .map(m => m.content.map(p => ('text' in p ? p.text : '')).join(''))
    .join('\n');

  return frontmatter + rendered;
}
