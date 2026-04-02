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
 * Strips frontmatter first (Smithy uses custom fields like `tools: Read, Grep, Glob`
 * that would confuse Dotprompt's metadata resolver), renders the body with partials,
 * then re-attaches the original frontmatter if present.
 *
 * Uses Dotprompt's rendering pipeline so future features (schemas, helpers,
 * variables) are available without further refactoring.
 */
export async function resolvePartials(
  content: string,
  partials: Map<string, string>,
): Promise<string> {
  // Separate frontmatter from body so Dotprompt doesn't try to process
  // Smithy-specific frontmatter fields during render.
  const frontmatterMatch = content.match(/^(---\s*\n[\s\S]*?\n---\s*\n)/);
  const frontmatter = frontmatterMatch?.[1] ?? '';
  const body = frontmatter ? content.slice(frontmatter.length) : content;

  // If body has no partial references, skip rendering entirely
  if (!body.includes('{{>')) {
    return content;
  }

  const instance = new Dotprompt();
  for (const [name, source] of partials) {
    instance.definePartial(name, source);
  }
  const result = await instance.render(body, {});
  const rendered = result.messages
    .map(m => m.content.map(p => ('text' in p ? p.text : '')).join(''))
    .join('\n');

  return frontmatter + rendered;
}
