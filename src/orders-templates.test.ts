import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ORDERS_DEFAULT_TEMPLATES,
  provisionOrdersTemplates,
} from './orders-templates.js';

const ORDERS_TYPES = ['rfc', 'features', 'spec', 'tasks'] as const;

describe('provisionOrdersTemplates', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-orders-tpl-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('provisions all four files into a fresh repo with default content', () => {
    const result = provisionOrdersTemplates({ targetDir: tmpDir, location: 'repo' });

    const ordersDir = path.join(tmpDir, '.smithy', 'templates', 'orders');
    for (const type of ORDERS_TYPES) {
      const file = path.join(ordersDir, `${type}.md`);
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.readFileSync(file, 'utf8')).toBe(ORDERS_DEFAULT_TEMPLATES[type]);
      expect(result.templatesWritten).toContain(file);
    }
    expect(result.templatesWritten).toHaveLength(4);
    expect(result.templatesPreserved).toEqual([]);
  });

  it('creates intermediate templates/ and orders/ directories when absent', () => {
    expect(fs.existsSync(path.join(tmpDir, '.smithy'))).toBe(false);

    provisionOrdersTemplates({ targetDir: tmpDir, location: 'repo' });

    expect(fs.statSync(path.join(tmpDir, '.smithy')).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(tmpDir, '.smithy', 'templates')).isDirectory()).toBe(true);
    expect(
      fs.statSync(path.join(tmpDir, '.smithy', 'templates', 'orders')).isDirectory(),
    ).toBe(true);
  });

  it('preserves existing files when overwrite is false (default)', () => {
    const ordersDir = path.join(tmpDir, '.smithy', 'templates', 'orders');
    fs.mkdirSync(ordersDir, { recursive: true });
    const customSpec = 'custom user spec';
    const specPath = path.join(ordersDir, 'spec.md');
    fs.writeFileSync(specPath, customSpec);

    const result = provisionOrdersTemplates({ targetDir: tmpDir, location: 'repo' });

    expect(fs.readFileSync(specPath, 'utf8')).toBe(customSpec);
    expect(result.templatesPreserved).toEqual([specPath]);

    for (const type of ORDERS_TYPES) {
      if (type === 'spec') continue;
      const file = path.join(ordersDir, `${type}.md`);
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.readFileSync(file, 'utf8')).toBe(ORDERS_DEFAULT_TEMPLATES[type]);
      expect(result.templatesWritten).toContain(file);
    }
    expect(result.templatesWritten).toHaveLength(3);
    expect(result.templatesWritten).not.toContain(specPath);
  });

  it('treats empty existing files as present and preserves them (presence is the signal)', () => {
    const ordersDir = path.join(tmpDir, '.smithy', 'templates', 'orders');
    fs.mkdirSync(ordersDir, { recursive: true });
    const tasksPath = path.join(ordersDir, 'tasks.md');
    fs.writeFileSync(tasksPath, '');

    const result = provisionOrdersTemplates({
      targetDir: tmpDir,
      location: 'repo',
      overwrite: false,
    });

    expect(fs.statSync(tasksPath).size).toBe(0);
    expect(result.templatesPreserved).toEqual([tasksPath]);
    expect(result.templatesWritten).not.toContain(tasksPath);
  });

  it('overwrite=true replaces only the four canonical files (extras untouched)', () => {
    const ordersDir = path.join(tmpDir, '.smithy', 'templates', 'orders');
    fs.mkdirSync(ordersDir, { recursive: true });
    const specPath = path.join(ordersDir, 'spec.md');
    const readmePath = path.join(ordersDir, 'README.md');
    fs.writeFileSync(specPath, 'custom user spec');
    fs.writeFileSync(readmePath, 'custom readme content');

    const result = provisionOrdersTemplates({
      targetDir: tmpDir,
      location: 'repo',
      overwrite: true,
    });

    expect(fs.readFileSync(specPath, 'utf8')).toBe(ORDERS_DEFAULT_TEMPLATES.spec);
    expect(fs.readFileSync(readmePath, 'utf8')).toBe('custom readme content');

    for (const type of ORDERS_TYPES) {
      const file = path.join(ordersDir, `${type}.md`);
      expect(result.templatesWritten).toContain(file);
    }
    expect(result.templatesWritten).toHaveLength(4);
    expect(result.templatesWritten).not.toContain(readmePath);
    expect(result.templatesPreserved).toEqual([]);
  });

  it('never touches the manifest file or non-orders siblings under <manifestDir>', () => {
    const manifestDir = path.join(tmpDir, '.smithy');
    fs.mkdirSync(manifestDir, { recursive: true });
    const manifestPath = path.join(manifestDir, 'smithy-manifest.json');
    const manifestContent = '{"sentinel":true}';
    fs.writeFileSync(manifestPath, manifestContent);

    // A peer template family that should also be left alone.
    const peerDir = path.join(manifestDir, 'templates', 'artifacts');
    fs.mkdirSync(peerDir, { recursive: true });
    const peerFile = path.join(peerDir, 'note.md');
    const peerContent = 'untouched peer template';
    fs.writeFileSync(peerFile, peerContent);

    const beforeManifestStat = fs.statSync(manifestPath);
    const beforePeerStat = fs.statSync(peerFile);

    provisionOrdersTemplates({ targetDir: tmpDir, location: 'repo' });

    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestContent);
    expect(fs.statSync(manifestPath).size).toBe(beforeManifestStat.size);

    expect(fs.readFileSync(peerFile, 'utf8')).toBe(peerContent);
    expect(fs.statSync(peerFile).size).toBe(beforePeerStat.size);

    // Sanity: only the four canonical files exist under templates/orders/.
    const ordersDir = path.join(manifestDir, 'templates', 'orders');
    const entries = fs.readdirSync(ordersDir).sort();
    expect(entries).toEqual(['features.md', 'rfc.md', 'spec.md', 'tasks.md']);
  });

  it('writes under a stubbed HOME when location is "user"', () => {
    const stubbedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-stub-home-'));
    const repoTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-repo-'));
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    process.env.HOME = stubbedHome;
    process.env.USERPROFILE = stubbedHome;

    try {
      const result = provisionOrdersTemplates({ targetDir: repoTmp, location: 'user' });

      const userOrdersDir = path.join(stubbedHome, '.smithy', 'templates', 'orders');
      for (const type of ORDERS_TYPES) {
        const file = path.join(userOrdersDir, `${type}.md`);
        expect(fs.existsSync(file)).toBe(true);
        expect(fs.readFileSync(file, 'utf8')).toBe(ORDERS_DEFAULT_TEMPLATES[type]);
        expect(result.templatesWritten).toContain(file);
      }
      // The repo's own .smithy/ must NOT be created by user-location provisioning.
      expect(fs.existsSync(path.join(repoTmp, '.smithy'))).toBe(false);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      fs.rmSync(stubbedHome, { recursive: true, force: true });
      fs.rmSync(repoTmp, { recursive: true, force: true });
    }
  });
});
