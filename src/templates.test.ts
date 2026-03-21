import { describe, it, expect } from 'vitest';
import {
  extractAuditChecklist,
  composeAuditTemplate,
  templateToExtension,
} from './templates.js';

describe('extractAuditChecklist', () => {
  it('extracts content between audit checklist markers', () => {
    const content = `Some preamble text.

<!-- audit-checklist-start -->
## Audit Checklist (.rfc.md)

| Category | What to check |
|----------|---------------|
| **Ambiguity** | Are goals clearly defined? |
<!-- audit-checklist-end -->

Some trailing text.`;

    const result = extractAuditChecklist(content);
    expect(result).toBe(
      `## Audit Checklist (.rfc.md)\n\n| Category | What to check |\n|----------|---------------|\n| **Ambiguity** | Are goals clearly defined? |`,
    );
  });

  it('returns null when no start marker exists', () => {
    const content = 'Just some regular content without markers.';
    expect(extractAuditChecklist(content)).toBeNull();
  });

  it('returns null when start marker exists but no end marker', () => {
    const content = `Some text
<!-- audit-checklist-start -->
## Checklist
No end marker here.`;
    expect(extractAuditChecklist(content)).toBeNull();
  });

  it('returns null for empty content', () => {
    expect(extractAuditChecklist('')).toBeNull();
  });

  it('handles markers with no content between them', () => {
    const content = '<!-- audit-checklist-start -->\n<!-- audit-checklist-end -->';
    expect(extractAuditChecklist(content)).toBe('');
  });
});

describe('composeAuditTemplate', () => {
  const makeChecklist = (ext: string, category: string) =>
    `<!-- audit-checklist-start -->\n## Audit Checklist (${ext})\n\n| Category | What to check |\n|----------|---------------|\n| **${category}** | Check something |\n<!-- audit-checklist-end -->`;

  it('injects composed checklists at the placeholder', () => {
    const templates = new Map<string, string>();
    templates.set('smithy.ignite.md', `Preamble\n\n${makeChecklist('.rfc.md', 'Ambiguity')}`);
    templates.set('smithy.cut.md', `Preamble\n\n${makeChecklist('.tasks.md', 'Slice Scoping')}`);

    const auditTemplate = `# Audit\n\n<!-- composed-checklists -->\n\n## Output`;
    const result = composeAuditTemplate(templates, auditTemplate);

    expect(result).toContain('## Audit Checklist (.rfc.md)');
    expect(result).toContain('## Audit Checklist (.tasks.md)');
    expect(result).toContain('## Output');
    expect(result).not.toContain('<!-- composed-checklists -->');
  });

  it('preserves audit template when no templates have checklists', () => {
    const templates = new Map<string, string>();
    templates.set('smithy.ignite.md', 'No checklist here');

    const auditTemplate = '# Audit\n\n<!-- composed-checklists -->';
    const result = composeAuditTemplate(templates, auditTemplate);

    expect(result).toBe(auditTemplate);
  });

  it('preserves audit template when templates map is empty', () => {
    const templates = new Map<string, string>();
    const auditTemplate = '# Audit\n\n<!-- composed-checklists -->';
    const result = composeAuditTemplate(templates, auditTemplate);

    expect(result).toBe(auditTemplate);
  });

  it('only processes known producing command templates', () => {
    const templates = new Map<string, string>();
    templates.set('smithy.forge.md', `Preamble\n\n${makeChecklist('.unknown', 'Forge')}`);
    templates.set('smithy.ignite.md', `Preamble\n\n${makeChecklist('.rfc.md', 'Ambiguity')}`);

    const auditTemplate = '# Audit\n\n<!-- composed-checklists -->';
    const result = composeAuditTemplate(templates, auditTemplate);

    expect(result).toContain('## Audit Checklist (.rfc.md)');
    expect(result).not.toContain('Forge');
  });

  it('composes all five producing command checklists in order', () => {
    const templates = new Map<string, string>();
    templates.set('smithy.ignite.md', makeChecklist('.rfc.md', 'Ambiguity'));
    templates.set('smithy.render.md', makeChecklist('.features.md', 'Coverage'));
    templates.set('smithy.mark.md', makeChecklist('.spec.md', 'Traceability'));
    templates.set('smithy.cut.md', makeChecklist('.tasks.md', 'Scoping'));
    templates.set('smithy.strike.md', makeChecklist('.strike.md', 'Completeness'));

    const auditTemplate = '# Audit\n\n<!-- composed-checklists -->\n\n## End';
    const result = composeAuditTemplate(templates, auditTemplate);

    // All five should be present
    expect(result).toContain('.rfc.md');
    expect(result).toContain('.features.md');
    expect(result).toContain('.spec.md');
    expect(result).toContain('.tasks.md');
    expect(result).toContain('.strike.md');

    // Order should match templateToExtension iteration order
    const rfcIdx = result.indexOf('.rfc.md');
    const featuresIdx = result.indexOf('.features.md');
    const specIdx = result.indexOf('.spec.md');
    const tasksIdx = result.indexOf('.tasks.md');
    const strikeIdx = result.indexOf('.strike.md');
    expect(rfcIdx).toBeLessThan(featuresIdx);
    expect(featuresIdx).toBeLessThan(specIdx);
    expect(specIdx).toBeLessThan(tasksIdx);
    expect(tasksIdx).toBeLessThan(strikeIdx);
  });
});

describe('templateToExtension', () => {
  it('maps all five producing command templates', () => {
    expect(Object.keys(templateToExtension)).toHaveLength(5);
    expect(templateToExtension['smithy.ignite.md']).toBe('.rfc.md');
    expect(templateToExtension['smithy.render.md']).toBe('.features.md');
    expect(templateToExtension['smithy.mark.md']).toBe('.spec.md');
    expect(templateToExtension['smithy.cut.md']).toBe('.tasks.md');
    expect(templateToExtension['smithy.strike.md']).toBe('.strike.md');
  });
});
