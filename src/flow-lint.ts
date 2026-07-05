import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface ScreenArtifact {
  id: string;
  path: string;
}

export interface FlowArtifact {
  id: string;
  path: string;
  screens: string[];
  testBodyPath: string;
}

export interface OrphanScanResult {
  status: 'scanned' | 'not-run';
  roots: string[];
  paths: string[];
}

export interface FlowGraph {
  root: string;
  screens: ScreenArtifact[];
  flows: FlowArtifact[];
  declaredTestBodyPaths: string[];
  orphanTestBodies: OrphanScanResult;
}

export type FlowLintFinding =
  | {
      type: 'missing-screen';
      flowId: string;
      flowPath: string;
      screenId: string;
    }
  | {
      type: 'missing-test-body';
      flowId: string;
      flowPath: string;
      testBodyPath: string;
    }
  | {
      type: 'orphan-test-body';
      testBodyPath: string;
    }
  | {
      type: 'duplicate-screen-id';
      screenId: string;
      paths: string[];
    }
  | {
      type: 'duplicate-flow-id';
      flowId: string;
      paths: string[];
    };

export interface DiscoverFlowGraphOptions {
  flowTestRoot?: string;
}

interface Frontmatter {
  id?: unknown;
  screens?: unknown;
  'test-body'?: unknown;
}

const CONVENTIONAL_FLOW_TEST_ROOT = 'maestro/flows';

export function discoverFlowGraph(
  rootOrSubpath: string,
  options: DiscoverFlowGraphOptions = {},
): FlowGraph {
  const root = resolveArtifactRoot(rootOrSubpath);
  const screens = discoverScreens(root);
  const flows = discoverFlows(root);
  const declaredTestBodyPaths = uniqueSorted(
    flows.map((flow) => normalizeRelativePath(flow.testBodyPath)).filter(Boolean),
  );
  const orphanTestBodies = discoverOrphanTestBodies(
    root,
    new Set(declaredTestBodyPaths),
    options.flowTestRoot,
  );

  return {
    root,
    screens,
    flows,
    declaredTestBodyPaths,
    orphanTestBodies,
  };
}

export function validateFlowGraph(graph: FlowGraph): FlowLintFinding[] {
  const findings: FlowLintFinding[] = [];
  const screensById = groupById(graph.screens);
  const flowsById = groupById(graph.flows);

  for (const [id, artifacts] of screensById) {
    if (id !== '' && artifacts.length > 1) {
      findings.push({
        type: 'duplicate-screen-id',
        screenId: id,
        paths: artifacts.map((artifact) => artifact.path).sort(),
      });
    }
  }

  for (const [id, artifacts] of flowsById) {
    if (id !== '' && artifacts.length > 1) {
      findings.push({
        type: 'duplicate-flow-id',
        flowId: id,
        paths: artifacts.map((artifact) => artifact.path).sort(),
      });
    }
  }

  for (const flow of graph.flows) {
    for (const screenId of flow.screens) {
      if (!screensById.has(screenId)) {
        findings.push({
          type: 'missing-screen',
          flowId: flow.id,
          flowPath: flow.path,
          screenId,
        });
      }
    }

    const absoluteTestBodyPath = path.join(graph.root, flow.testBodyPath);
    if (!isFile(absoluteTestBodyPath)) {
      findings.push({
        type: 'missing-test-body',
        flowId: flow.id,
        flowPath: flow.path,
        testBodyPath: flow.testBodyPath,
      });
    }
  }

  for (const testBodyPath of graph.orphanTestBodies.paths) {
    findings.push({
      type: 'orphan-test-body',
      testBodyPath,
    });
  }

  return findings;
}

export function lintFlowGraph(
  rootOrSubpath: string,
  options: DiscoverFlowGraphOptions = {},
): { graph: FlowGraph; findings: FlowLintFinding[] } {
  const graph = discoverFlowGraph(rootOrSubpath, options);
  return { graph, findings: validateFlowGraph(graph) };
}

function discoverScreens(root: string): ScreenArtifact[] {
  const screenDir = path.join(root, 'design', 'screens');
  return listFiles(screenDir, '.design.md').map((artifactPath) => {
    const frontmatter = readFrontmatter(artifactPath);
    return {
      id: stringField(frontmatter.id),
      path: relativePath(root, artifactPath),
    };
  });
}

function discoverFlows(root: string): FlowArtifact[] {
  const flowDir = path.join(root, 'design', 'flows');
  return listFiles(flowDir, '.flow.md').map((artifactPath) => {
    const frontmatter = readFrontmatter(artifactPath);
    return {
      id: stringField(frontmatter.id),
      path: relativePath(root, artifactPath),
      screens: stringListField(frontmatter.screens),
      testBodyPath: normalizeRelativePath(stringField(frontmatter['test-body'])),
    };
  });
}

function discoverOrphanTestBodies(
  root: string,
  declaredTestBodyPaths: Set<string>,
  explicitFlowTestRoot?: string,
): OrphanScanResult {
  const scopedRoots = explicitFlowTestRoot
    ? [resolveScopedRoot(root, explicitFlowTestRoot)]
    : conventionalFlowTestRoots(root);

  if (scopedRoots.length === 0) {
    return { status: 'not-run', roots: [], paths: [] };
  }

  const orphanPaths = scopedRoots.flatMap((scanRoot) =>
    listFiles(scanRoot).map((filePath) => relativePath(root, filePath)),
  ).filter((testBodyPath) => !declaredTestBodyPaths.has(testBodyPath));

  return {
    status: 'scanned',
    roots: scopedRoots.map((scanRoot) => relativePath(root, scanRoot)),
    paths: uniqueSorted(orphanPaths),
  };
}

function resolveArtifactRoot(rootOrSubpath: string): string {
  const realStart = fs.realpathSync(rootOrSubpath);
  const start = isDirectory(realStart) ? realStart : path.dirname(realStart);
  let current = start;

  while (true) {
    if (
      isDirectory(path.join(current, 'design', 'screens')) ||
      isDirectory(path.join(current, 'design', 'flows'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

function resolveScopedRoot(root: string, scopedRoot: string): string {
  return path.isAbsolute(scopedRoot)
    ? fs.realpathSync(scopedRoot)
    : fs.realpathSync(path.join(root, scopedRoot));
}

function conventionalFlowTestRoots(root: string): string[] {
  const conventionalRoot = path.join(root, CONVENTIONAL_FLOW_TEST_ROOT);
  return isDirectory(conventionalRoot) ? [fs.realpathSync(conventionalRoot)] : [];
}

function listFiles(root: string, suffix?: string): string[] {
  if (!isDirectory(root)) return [];
  const files: string[] = [];
  walk(root, files, suffix);
  return files.sort();
}

function walk(dir: string, files: string[], suffix?: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, files, suffix);
    } else if (entry.isFile() && (suffix === undefined || entry.name.endsWith(suffix))) {
      files.push(entryPath);
    }
  }
}

function readFrontmatter(filePath: string): Frontmatter {
  const contents = fs.readFileSync(filePath, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(contents);
  if (match === null) return {};
  const parsed = parseYaml(match[1] ?? '') as unknown;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Frontmatter;
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringListField(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function groupById<T extends { id: string }>(artifacts: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const artifact of artifacts) {
    const existing = grouped.get(artifact.id) ?? [];
    existing.push(artifact);
    grouped.set(artifact.id, existing);
  }
  return grouped;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function relativePath(root: string, target: string): string {
  return normalizeRelativePath(path.relative(root, target));
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join('/').replace(/^\.\//, '');
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function isFile(target: string): boolean {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}
