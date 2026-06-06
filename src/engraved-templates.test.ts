import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  DECISION_STATUSES,
  ENGRAVED_DEFAULT_DOMAIN,
  ENGRAVED_DEFAULT_LOCATIONS,
  ENGRAVED_DEFAULT_TEMPLATES,
  ENGRAVED_DOMAINS,
  ENGRAVED_KINDS,
  ENGRAVED_REQUIRED_SECTIONS,
  ENGRAVED_SUFFIXES,
  INVARIANT_STATUSES,
  KNOWN_EXCEPTION_DISPOSITIONS,
  KNOWN_EXCEPTION_SEVERITIES,
  PRINCIPLE_STATUSES,
  type DecisionFrontmatter,
  type InvariantFrontmatter,
  type PrincipleFrontmatter,
} from './engraved-templates.js';

const SCHEMA_DOC_PATH = path.join(
  __dirname,
  '..',
  'docs',
  'engraved-knowledge-schema.md',
);

const readSchemaDoc = (): string => fs.readFileSync(SCHEMA_DOC_PATH, 'utf8');

describe('engraved-templates: enums and constants', () => {
  it('exposes the three engraved kinds', () => {
    expect([...ENGRAVED_KINDS].sort()).toEqual(
      ['decision', 'invariant', 'principle'].sort(),
    );
  });

  it('exposes both ownership domains with system as the default', () => {
    expect([...ENGRAVED_DOMAINS].sort()).toEqual(['design', 'system']);
    expect(ENGRAVED_DEFAULT_DOMAIN).toBe('system');
  });

  it('declares the decision lifecycle from the EPIC description', () => {
    expect([...DECISION_STATUSES]).toEqual([
      'proposed',
      'accepted',
      'superseded',
      'deprecated',
    ]);
  });

  it('declares only aligned / drifting for invariant alignment', () => {
    expect([...INVARIANT_STATUSES]).toEqual(['aligned', 'drifting']);
  });

  it('declares only active for principles', () => {
    expect([...PRINCIPLE_STATUSES]).toEqual(['active']);
  });

  it('declares ledger severity and disposition vocabularies', () => {
    expect([...KNOWN_EXCEPTION_SEVERITIES]).toEqual(['low', 'medium', 'high']);
    expect([...KNOWN_EXCEPTION_DISPOSITIONS]).toEqual(['accepted', 'temporary']);
  });

  it('declares dot-prefixed suffixes for the two suffixed kinds', () => {
    expect(ENGRAVED_SUFFIXES.decision).toBe('.decision.md');
    expect(ENGRAVED_SUFFIXES.invariant).toBe('.invariant.md');
    // Principle has no suffix; it lives at a known constitution path.
    expect((ENGRAVED_SUFFIXES as Record<string, string>).principle).toBeUndefined();
  });

  it('provides default repo locations for both domains', () => {
    for (const domain of ENGRAVED_DOMAINS) {
      for (const kind of ENGRAVED_KINDS) {
        const loc = ENGRAVED_DEFAULT_LOCATIONS[domain][kind];
        expect(loc).toMatch(/^docs\//);
        expect(loc.endsWith('/')).toBe(true);
      }
    }
    expect(ENGRAVED_DEFAULT_LOCATIONS.system.decision).toBe('docs/decisions/');
    expect(ENGRAVED_DEFAULT_LOCATIONS.design.invariant).toBe('docs/design/invariants/');
  });
});

describe('engraved-templates: scaffold body strings', () => {
  it('provides a scaffold for every kind', () => {
    for (const kind of ENGRAVED_KINDS) {
      const body = ENGRAVED_DEFAULT_TEMPLATES[kind];
      expect(body, `missing scaffold for ${kind}`).toBeTruthy();
      expect(body.startsWith('---\n')).toBe(true);
      expect(body).toContain(`kind: ${kind}`);
      expect(body).toContain('# {{title}}');
    }
  });

  it('decision scaffold declares the full decision frontmatter shape', () => {
    const body = ENGRAVED_DEFAULT_TEMPLATES.decision;
    const expectedKeys: Array<keyof DecisionFrontmatter | 'decided_at'> = [
      'id',
      'kind',
      'domain',
      'title',
      'status',
      'decided_at',
      'topics',
      'scope',
      'applies_to',
      'supersedes',
      'superseded_by',
      'establishes',
    ];
    for (const key of expectedKeys) {
      expect(body, `decision scaffold missing key: ${key}`).toMatch(
        new RegExp(`^${key}:`, 'm'),
      );
    }
    // New decisions start as `proposed`; superseded_by is empty at authoring time.
    expect(body).toMatch(/^status: proposed$/m);
    expect(body).toMatch(/^superseded_by: \[\]$/m);
  });

  it('invariant scaffold declares the full invariant frontmatter shape', () => {
    const body = ENGRAVED_DEFAULT_TEMPLATES.invariant;
    const expectedKeys: Array<keyof InvariantFrontmatter> = [
      'id',
      'kind',
      'domain',
      'title',
      'status',
      'topics',
      'scope',
      'applies_to',
      'established_by',
    ];
    for (const key of expectedKeys) {
      expect(body, `invariant scaffold missing key: ${key}`).toMatch(
        new RegExp(`^${key}:`, 'm'),
      );
    }
    // Fresh invariant starts aligned (the ledger is empty).
    expect(body).toMatch(/^status: aligned$/m);
  });

  it('invariant scaffold includes the Known-Exceptions ledger with the canonical columns in order', () => {
    const body = ENGRAVED_DEFAULT_TEMPLATES.invariant;
    expect(body).toContain('## Known Exceptions');
    // Header row, verbatim:
    expect(body).toContain(
      '| Where | What diverges | Disposition + Why | Tracking Issue | Severity |',
    );
    // Separator row immediately after the header:
    expect(body).toMatch(
      /\| Where \| What diverges \| Disposition \+ Why \| Tracking Issue \| Severity \|\n\|-+\|-+\|-+\|-+\|-+\|/,
    );
  });

  it('principle scaffold declares the full principle frontmatter shape and is locked to active', () => {
    const body = ENGRAVED_DEFAULT_TEMPLATES.principle;
    const expectedKeys: Array<keyof PrincipleFrontmatter> = [
      'id',
      'kind',
      'domain',
      'title',
      'status',
      'topics',
      'scope',
      'applies_to',
    ];
    for (const key of expectedKeys) {
      expect(body, `principle scaffold missing key: ${key}`).toMatch(
        new RegExp(`^${key}:`, 'm'),
      );
    }
    expect(body).toMatch(/^status: active$/m);
    // Principles have no supersession / establishes edges.
    expect(body).not.toContain('supersedes:');
    expect(body).not.toContain('superseded_by:');
    expect(body).not.toContain('establishes:');
    expect(body).not.toContain('established_by:');
  });

  it('every scaffold body declares all required sections in order', () => {
    for (const kind of ENGRAVED_KINDS) {
      const body = ENGRAVED_DEFAULT_TEMPLATES[kind];
      let cursor = 0;
      for (const section of ENGRAVED_REQUIRED_SECTIONS[kind]) {
        const idx = body.indexOf(`## ${section}`, cursor);
        expect(
          idx,
          `expected "## ${section}" in ${kind} scaffold after position ${cursor}`,
        ).toBeGreaterThanOrEqual(0);
        cursor = idx;
      }
    }
  });
});

describe('engraved-templates: doc parity with src/engraved-templates.ts', () => {
  it('schema doc references the canonical TS module', () => {
    const doc = readSchemaDoc();
    expect(doc).toContain('src/engraved-templates.ts');
  });

  it('schema doc enumerates the three kinds in its overview table', () => {
    const doc = readSchemaDoc();
    for (const kind of ENGRAVED_KINDS) {
      expect(doc.toLowerCase(), `schema doc must mention ${kind}`).toContain(kind);
    }
  });

  it('schema doc declares the same lifecycle states as the TS exports', () => {
    const doc = readSchemaDoc();
    for (const status of DECISION_STATUSES) {
      expect(doc, `schema doc must mention decision status: ${status}`).toContain(status);
    }
    for (const status of INVARIANT_STATUSES) {
      expect(doc, `schema doc must mention invariant status: ${status}`).toContain(status);
    }
    for (const status of PRINCIPLE_STATUSES) {
      expect(doc, `schema doc must mention principle status: ${status}`).toContain(status);
    }
  });

  it('schema doc declares the same suffix conventions as the TS exports', () => {
    const doc = readSchemaDoc();
    expect(doc).toContain(ENGRAVED_SUFFIXES.decision);
    expect(doc).toContain(ENGRAVED_SUFFIXES.invariant);
  });

  it('schema doc declares the same default locations as the TS exports', () => {
    const doc = readSchemaDoc();
    expect(doc).toContain(ENGRAVED_DEFAULT_LOCATIONS.system.decision);
    expect(doc).toContain(ENGRAVED_DEFAULT_LOCATIONS.system.invariant);
    expect(doc).toContain(ENGRAVED_DEFAULT_LOCATIONS.design.decision);
    expect(doc).toContain(ENGRAVED_DEFAULT_LOCATIONS.design.invariant);
  });

  it('schema doc declares the same Known-Exceptions ledger columns as the TS scaffold', () => {
    const doc = readSchemaDoc();
    // Same canonical header row used by the invariant scaffold:
    expect(doc).toContain(
      '| Where | What diverges | Disposition + Why | Tracking Issue | Severity |',
    );
  });
});
