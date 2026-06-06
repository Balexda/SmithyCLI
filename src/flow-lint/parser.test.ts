import { describe, expect, it } from 'vitest';

import { parseFlowDoc, parseFrontMatter, parseScreenDoc } from './parser.js';

describe('parseFrontMatter', () => {
  it('parses a fenced YAML mapping', () => {
    const { data, error } = parseFrontMatter('---\nid: AddTitle\nscreens: [A, B]\n---\nbody\n');
    expect(error).toBeUndefined();
    expect(data).toEqual({ id: 'AddTitle', screens: ['A', 'B'] });
  });

  it('returns null data when there is no front-matter block', () => {
    expect(parseFrontMatter('# just markdown\n')).toEqual({ data: null });
  });

  it('tolerates a leading BOM and blank lines before the fence', () => {
    const { data } = parseFrontMatter('﻿\n\n---\nid: X\n---\n');
    expect(data).toEqual({ id: 'X' });
  });

  it('reports an error on malformed YAML', () => {
    const { data, error } = parseFrontMatter('---\nid: : :\n  - broken\n---\n');
    expect(data).toBeNull();
    expect(error).toBeDefined();
  });

  it('reports an error when the block is a sequence, not a mapping', () => {
    const { data, error } = parseFrontMatter('---\n- a\n- b\n---\n');
    expect(data).toBeNull();
    expect(error).toMatch(/mapping/);
  });
});

describe('parseFlowDoc', () => {
  it('extracts id, screens, and maestro', () => {
    const doc = parseFlowDoc(
      'design/flows/AddTitle.flow.md',
      'AddTitle',
      '---\nid: AddTitle\nscreens: [Library, AddTitle]\nmaestro: maestro/flows/AddTitle.yaml\n---\n',
    );
    expect(doc).toMatchObject({
      id: 'AddTitle',
      screens: ['Library', 'AddTitle'],
      maestro: 'maestro/flows/AddTitle.yaml',
      stem: 'AddTitle',
    });
    expect(doc.parseError).toBeUndefined();
  });

  it('coerces a single screen scalar into a one-element list', () => {
    const doc = parseFlowDoc('f.flow.md', 'f', '---\nid: f\nscreens: Library\nmaestro: m.yaml\n---\n');
    expect(doc.screens).toEqual(['Library']);
  });

  it('treats an explicitly empty screens list as present-but-empty', () => {
    const doc = parseFlowDoc('f.flow.md', 'f', '---\nid: f\nscreens: []\nmaestro: m.yaml\n---\n');
    expect(doc.screens).toEqual([]);
  });

  it('reports a parseError when there is no front-matter', () => {
    const doc = parseFlowDoc('f.flow.md', 'f', '# no front matter\n');
    expect(doc.parseError).toMatch(/front-matter/);
  });
});

describe('parseScreenDoc', () => {
  it('extracts id and composable only', () => {
    const doc = parseScreenDoc(
      'design/screens/Library.design.md',
      'Library',
      '---\nid: Library\ncomposable: app/Library.kt\ndesign_system: x\n---\n',
    );
    expect(doc).toMatchObject({ id: 'Library', composable: 'app/Library.kt', stem: 'Library' });
  });
});
