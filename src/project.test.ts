import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readArtifactProject, resolveDeclaredProject } from './project.js';
import type { DeclaredProjectInput } from './project.js';

describe('explicit project resolution', () => {
  let home: string;
  let artifact: string;
  let projects: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-project-'));
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    artifact = path.join(home, 'input.spec.md');
    projects = path.join(home, '.smithy', 'projects');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(home, { recursive: true, force: true });
  });

  function resolve(input: Omit<DeclaredProjectInput, 'mode'> = {}) {
    return resolveDeclaredProject({ mode: 'repo', ...input });
  }

  function writeArtifact(content: string) {
    fs.writeFileSync(artifact, content);
    return { inputArtifact: artifact };
  }

  it('selects an empty store and preserves option, artifact and agreement provenance', () => {
    fs.mkdirSync(path.join(projects, 'Fleet-Sync'), { recursive: true });
    const input = writeArtifact('# Spec\r\n\r\n**Project**: \t `Fleet-Sync`  \r\n');

    expect(resolve({ optionProject: 'Fleet-Sync' })).toEqual({
      kind: 'selected', slug: 'Fleet-Sync', source: 'option',
    });
    expect(resolve(input)).toEqual({
      kind: 'selected', slug: 'Fleet-Sync', source: 'artifact', artifact,
    });
    expect(resolve({ ...input, optionProject: 'Fleet-Sync' })).toEqual({
      kind: 'selected', slug: 'Fleet-Sync', source: 'agreement', artifact,
    });
    expect(fs.readdirSync(path.join(projects, 'Fleet-Sync'))).toEqual([]);
  });

  it('reports both sources in a case-sensitive conflict before checking the store', () => {
    expect(resolve({ ...writeArtifact('**Project**: Fleet-Sync'), optionProject: 'fleet-sync' })).toEqual({
      kind: 'project-conflict', optionValue: 'fleet-sync', artifactValue: 'Fleet-Sync', artifact,
    });
  });

  it.each(['', '.', '..', '../fleet-sync', 'fleet sync', 'équipe', 'default'])(
    'validates supplied values before comparing them or checking the store (%j)',
    (value) => {
      expect(resolve({ ...writeArtifact('**Project**: Fleet-Sync'), optionProject: value })).toEqual({
        kind: 'invalid-project', value, source: 'option',
        reason: value === 'default' ? 'reserved-name' : 'invalid-slug',
      });
      expect(resolve({ ...writeArtifact('**Project**: `' + value + '`'), optionProject: 'Fleet-Sync' })).toEqual({
        kind: 'invalid-project', value, source: 'artifact', artifact,
        reason: value === 'default' ? 'reserved-name' : 'invalid-slug',
      });
    },
  );

  it('reports missing and non-directory stores without creating anything', () => {
    expect(resolve({ optionProject: 'Fleet-Sync' })).toEqual({
      kind: 'project-missing', slug: 'Fleet-Sync', source: 'option',
    });
    expect(fs.existsSync(path.join(home, '.smithy'))).toBe(false);

    fs.mkdirSync(projects, { recursive: true });
    fs.writeFileSync(path.join(projects, 'Fleet-Sync'), 'regular file');
    expect(resolve(writeArtifact('**Project**: Fleet-Sync'))).toEqual({
      kind: 'project-missing', slug: 'Fleet-Sync', source: 'artifact', artifact,
    });
    expect(fs.readFileSync(path.join(projects, 'Fleet-Sync'), 'utf8')).toBe('regular file');
  });

  it('ignores legacy fields, fenced examples, body sections and directory names', () => {
    fs.mkdirSync(path.join(projects, 'Fleet-Sync'), { recursive: true });
    const input = writeArtifact([
      '---', 'project: Fleet-Sync', '---', '# Spec', '',
      'project: Fleet-Sync',
      '````markdown', '```', '**Project**: Fleet-Sync', '````',
      '~~~markdown', '**Project**: Fleet-Sync', '~~~',
      '<!--', '**Project**: Fleet-Sync', '-->',
      '## Body', '**Project**: Fleet-Sync',
    ].join('\n'));
    expect(readArtifactProject(artifact)).toEqual({ kind: 'absent' });
    expect(resolveDeclaredProject({ ...input, mode: 'external', repositoryKey: 'Fleet-Sync' })).toEqual({
      kind: 'none',
    });
  });

  it('reads only the supplied artifact, even when nearby artifacts declare a project', () => {
    fs.mkdirSync(path.join(projects, 'Fleet-Sync'), { recursive: true });
    fs.mkdirSync(path.join(home, 'nested'));
    const parent = writeArtifact('**Project**: Fleet-Sync').inputArtifact;
    artifact = path.join(home, 'nested', 'input.tasks.md');
    const input = writeArtifact(`# Tasks\n\n**Source**: ${parent}\n`);

    expect(resolve(input)).toEqual({ kind: 'none' });
  });

  it('reads the header following empty YAML frontmatter', () => {
    const input = writeArtifact('---\n---\n# Spec\n\n**Project**: Fleet-Sync\n\n---\n\n## Body\n');
    expect(resolve(input)).toEqual({
      kind: 'project-missing', slug: 'Fleet-Sync', source: 'artifact', artifact,
    });
  });

  it.each([
    ['A body paragraph.', '', '**Project**: Fleet-Sync'],
    ['- ```md', '  **Project**: Fleet-Sync', '  ```'],
  ])('ignores project-shaped lines in an unheaded body', (...body) => {
    expect(resolve(writeArtifact(['# Spec', '', ...body].join('\n')))).toEqual({ kind: 'none' });
  });

  it.each([
    undefined,
    '**Project**: Fleet-Sync\n**Project**: Fleet-Sync',
    '**Project**: `Fleet-Sync',
    '**Project**: `Fleet-Sync` explanation',
    '**Project** Fleet-Sync',
  ])('refuses artifact errors before validating the option (%j)', (content) => {
    if (content !== undefined) writeArtifact(content);
    expect(resolve({ inputArtifact: artifact, optionProject: '' })).toEqual({
      kind: 'invalid-artifact', artifact, reason: expect.any(String),
    });
  });
});
