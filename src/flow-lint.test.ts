import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  discoverFlowGraph,
  lintFlowGraph,
  validateFlowGraph,
} from './flow-lint.js';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'smithy-flow-lint-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(relPath: string, contents: string): void {
  const absPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, contents);
}

function screen(id: string): string {
  return `---
id: ${id}
component-path: src/${id}.tsx
design_system: test-system
---

## Why this screen exists
`;
}

function flow(id: string, screens: string[], testBodyPath: string): string {
  return `---
id: ${id}
screens: [${screens.join(', ')}]
test-body: ${testBodyPath}
---

## Intent
`;
}

describe('flow-lint graph discovery', () => {
  it('discovers screen annotations, flow definitions, and declared test-body paths', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], 'tests/e2e/add-title.spec.ts'));
    write('tests/e2e/add-title.spec.ts', 'test("add title", () => {});\n');
    write('tests/e2e/unrelated.spec.ts', 'test("unrelated", () => {});\n');

    const graph = discoverFlowGraph(root);

    expect(graph.screens).toEqual([{ id: 'Library', path: 'design/screens/Library.design.md' }]);
    expect(graph.flows).toEqual([
      {
        id: 'AddTitle',
        path: 'design/flows/AddTitle.flow.md',
        screens: ['Library'],
        testBodyPath: 'tests/e2e/add-title.spec.ts',
      },
    ]);
    expect(graph.declaredTestBodyPaths).toEqual(['tests/e2e/add-title.spec.ts']);
    expect(graph.orphanTestBodies).toEqual({ status: 'not-run', roots: [], paths: [] });
  });

  it('resolves the artifact root from a nested subpath', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], 'maestro/flows/AddTitle.yaml'));
    write('maestro/flows/AddTitle.yaml', '# flow\n');
    write('src/app/nested/file.ts', 'export {};\n');

    const graph = discoverFlowGraph(path.join(root, 'src/app/nested'));

    expect(graph.root).toBe(root);
    expect(graph.screens.map((artifact) => artifact.id)).toEqual(['Library']);
    expect(graph.flows.map((artifact) => artifact.id)).toEqual(['AddTitle']);
  });

  it('scopes orphan test-body discovery to the explicit flow-test root', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], 'ui-flows/AddTitle.yaml'));
    write('ui-flows/AddTitle.yaml', '# flow\n');
    write('ui-flows/RemovedFlow.yaml', '# orphan\n');
    write('tests/e2e/unrelated.spec.ts', 'test("unrelated", () => {});\n');

    const graph = discoverFlowGraph(root, { flowTestRoot: 'ui-flows' });

    expect(graph.orphanTestBodies).toEqual({
      status: 'scanned',
      roots: ['ui-flows'],
      paths: ['ui-flows/RemovedFlow.yaml'],
    });
  });

  it('reports orphan discovery as not-run when the explicit flow-test root is missing', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], 'ui-flows/AddTitle.yaml'));
    write('ui-flows/AddTitle.yaml', '# flow\n');

    const graph = discoverFlowGraph(root, { flowTestRoot: 'does-not-exist' });

    expect(graph.orphanTestBodies).toEqual({ status: 'not-run', roots: [], paths: [] });
  });

  it('reports orphan discovery as not-run when the flow-test root escapes the artifact root', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], 'ui-flows/AddTitle.yaml'));
    write('ui-flows/AddTitle.yaml', '# flow\n');

    const graph = discoverFlowGraph(root, { flowTestRoot: '../..' });

    expect(graph.orphanTestBodies).toEqual({ status: 'not-run', roots: [], paths: [] });
  });

  it('ignores hidden files under the scoped flow-test root', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], 'ui-flows/AddTitle.yaml'));
    write('ui-flows/AddTitle.yaml', '# flow\n');
    write('ui-flows/.gitkeep', '');
    write('ui-flows/.DS_Store', '');

    const graph = discoverFlowGraph(root, { flowTestRoot: 'ui-flows' });

    expect(graph.orphanTestBodies).toEqual({
      status: 'scanned',
      roots: ['ui-flows'],
      paths: [],
    });
  });

  it('scopes orphan test-body discovery to the conventional stub location when present', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], 'maestro/flows/AddTitle.yaml'));
    write('maestro/flows/AddTitle.yaml', '# flow\n');
    write('maestro/flows/RemovedFlow.yaml', '# orphan\n');

    const graph = discoverFlowGraph(root);

    expect(graph.orphanTestBodies).toEqual({
      status: 'scanned',
      roots: ['maestro/flows'],
      paths: ['maestro/flows/RemovedFlow.yaml'],
    });
  });
});

describe('flow-lint graph validation', () => {
  it('reports no findings for a fully resolved fixture', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], 'maestro/flows/AddTitle.yaml'));
    write('maestro/flows/AddTitle.yaml', '# flow\n');

    const { findings } = lintFlowGraph(root);

    expect(findings).toEqual([]);
  });

  it('fails dangling screen references with the missing ScreenId and flow named', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library', 'AddTitleScreen'], 'maestro/flows/AddTitle.yaml'));
    write('maestro/flows/AddTitle.yaml', '# flow\n');

    const { findings } = lintFlowGraph(root);

    expect(findings).toContainEqual({
      type: 'missing-screen',
      flowId: 'AddTitle',
      flowPath: 'design/flows/AddTitle.flow.md',
      screenId: 'AddTitleScreen',
    });
  });

  it('fails missing paired test bodies with the owning flow named', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], 'maestro/flows/AddTitle.yaml'));

    const { findings } = lintFlowGraph(root);

    expect(findings).toContainEqual({
      type: 'missing-test-body',
      flowId: 'AddTitle',
      flowPath: 'design/flows/AddTitle.flow.md',
      testBodyPath: 'maestro/flows/AddTitle.yaml',
    });
  });

  it('fails orphan executable test bodies within the scoped flow-test root', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], 'ui-flows/AddTitle.yaml'));
    write('ui-flows/AddTitle.yaml', '# flow\n');
    write('ui-flows/RemovedFlow.yaml', '# orphan\n');

    const { findings } = lintFlowGraph(root, { flowTestRoot: 'ui-flows' });

    expect(findings).toContainEqual({
      type: 'orphan-test-body',
      testBodyPath: 'ui-flows/RemovedFlow.yaml',
    });
  });

  it('fails duplicate ScreenId values with every conflicting artifact named', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/screens/Nested/LibraryCopy.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], 'maestro/flows/AddTitle.yaml'));
    write('maestro/flows/AddTitle.yaml', '# flow\n');

    const findings = validateFlowGraph(discoverFlowGraph(root));

    expect(findings).toContainEqual({
      type: 'duplicate-screen-id',
      screenId: 'Library',
      paths: [
        'design/screens/Library.design.md',
        'design/screens/Nested/LibraryCopy.design.md',
      ],
    });
  });

  it('fails duplicate test-body declarations shared across flows', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], 'maestro/flows/Shared.yaml'));
    write('design/flows/EditTitle.flow.md', flow('EditTitle', ['Library'], 'maestro/flows/Shared.yaml'));
    write('maestro/flows/Shared.yaml', '# flow\n');

    const findings = validateFlowGraph(discoverFlowGraph(root));

    expect(findings).toContainEqual({
      type: 'duplicate-test-body',
      testBodyPath: 'maestro/flows/Shared.yaml',
      paths: [
        'design/flows/AddTitle.flow.md',
        'design/flows/EditTitle.flow.md',
      ],
    });
  });

  it('fails a test-body path that escapes the artifact root', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], '../escapes/AddTitle.yaml'));

    const { findings } = lintFlowGraph(root);

    expect(findings).toContainEqual({
      type: 'missing-test-body',
      flowId: 'AddTitle',
      flowPath: 'design/flows/AddTitle.flow.md',
      testBodyPath: '../escapes/AddTitle.yaml',
    });
  });

  it('fails duplicate FlowId values with every conflicting artifact named', () => {
    write('design/screens/Library.design.md', screen('Library'));
    write('design/flows/AddTitle.flow.md', flow('AddTitle', ['Library'], 'maestro/flows/AddTitle.yaml'));
    write('design/flows/Nested/AddTitleCopy.flow.md', flow('AddTitle', ['Library'], 'maestro/flows/AddTitleCopy.yaml'));
    write('maestro/flows/AddTitle.yaml', '# flow\n');
    write('maestro/flows/AddTitleCopy.yaml', '# flow\n');

    const findings = validateFlowGraph(discoverFlowGraph(root));

    expect(findings).toContainEqual({
      type: 'duplicate-flow-id',
      flowId: 'AddTitle',
      paths: [
        'design/flows/AddTitle.flow.md',
        'design/flows/Nested/AddTitleCopy.flow.md',
      ],
    });
  });
});
