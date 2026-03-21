import fs from 'fs';
import { basePromptsDir } from './utils.js';

export interface TemplateMeta {
  name?: string;
  command?: boolean;
  content: string;
  filename: string;
}

export function getBaseTemplateFiles(): string[] {
  if (!fs.existsSync(basePromptsDir)) return [];
  return fs.readdirSync(basePromptsDir).filter(f => f.endsWith('.md'));
}

export function readTemplate(filename: string): string {
  return fs.readFileSync(`${basePromptsDir}/${filename}`, 'utf8');
}

export function stripFrontmatter(content: string): string {
  return content.replace(/^---\s*[\s\S]*?\n---\s*\n/, '');
}

export function parseFrontmatterName(content: string): string | undefined {
  const match = content.match(/^---\s*\nname:\s*([^\n]+)/m);
  return match?.[1]?.trim();
}

export function isCommandTemplate(content: string): boolean {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/m);
  if (!frontmatterMatch) return false;
  return /command:\s*true/.test(frontmatterMatch[1]!);
}

const AUDIT_CHECKLIST_START = '<!-- audit-checklist-start -->';
const AUDIT_CHECKLIST_END = '<!-- audit-checklist-end -->';
const COMPOSED_CHECKLISTS_PLACEHOLDER = '<!-- composed-checklists -->';

/**
 * Maps template filenames to the artifact extension their audit checklist covers.
 */
export const templateToExtension: Record<string, string> = {
  'smithy.ignite.md': '.rfc.md',
  'smithy.render.md': '.features.md',
  'smithy.mark.md': '.spec.md',
  'smithy.cut.md': '.tasks.md',
  'smithy.strike.md': '.strike.md',
};

/**
 * Extracts the audit checklist content between marker comments.
 * Returns null if markers are not found.
 */
export function extractAuditChecklist(content: string): string | null {
  const startIdx = content.indexOf(AUDIT_CHECKLIST_START);
  if (startIdx === -1) return null;
  const afterStart = startIdx + AUDIT_CHECKLIST_START.length;

  const endIdx = content.indexOf(AUDIT_CHECKLIST_END, afterStart);
  if (endIdx === -1) return null;

  return content.slice(afterStart, endIdx).trim();
}

/**
 * Collects audit checklists from all producing command templates and injects
 * them into the audit template at the composed-checklists placeholder.
 *
 * @param templates - Map of template filename → template content
 * @param auditTemplate - The audit template content containing the placeholder
 * @returns The audit template with composed checklists injected
 */
export function composeAuditTemplate(
  templates: Map<string, string>,
  auditTemplate: string,
): string {
  const sections: string[] = [];

  for (const [filename, extension] of Object.entries(templateToExtension)) {
    const content = templates.get(filename);
    if (!content) continue;

    const checklist = extractAuditChecklist(content);
    if (!checklist) continue;

    // Validate the checklist header references the expected artifact extension
    // so the mapping can't silently drift out of sync with the templates.
    const expectedHeader = `(${extension})`;
    if (!checklist.includes(expectedHeader)) {
      throw new Error(
        `Audit checklist in ${filename} does not reference expected extension "${extension}". ` +
        `Update templateToExtension or the checklist header to match.`,
      );
    }

    sections.push(checklist);
  }

  if (sections.length === 0) return auditTemplate;

  if (!auditTemplate.includes(COMPOSED_CHECKLISTS_PLACEHOLDER)) {
    throw new Error(
      `Audit template is missing the "${COMPOSED_CHECKLISTS_PLACEHOLDER}" placeholder. ` +
      `Cannot inject composed checklists.`,
    );
  }

  const composed = sections.join('\n\n');
  return auditTemplate.replace(COMPOSED_CHECKLISTS_PLACEHOLDER, composed);
}
