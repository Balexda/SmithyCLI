/**
 * Guard for the reviewer instruction files under `.github/`.
 *
 * Automated reviewers (Copilot code review, Codex, CodeRabbit) read these
 * files as their prompt, and they drop a malformed one silently: an
 * instruction file with no `applyTo` is ignored, and a skill whose `name` does
 * not match its directory is never loaded. Nothing reports the loss — the
 * review simply gets worse. These checks hold the shape the reviewers
 * require, the size GitHub recommends, and the boundary between the
 * Smithy-general layer (`smithy.*`, `smithy-*`) and this repository's own
 * rules. The layout is described in `docs/reviewer-instructions.md`.
 *
 * CodeRabbit does not read the files the way Copilot does: it applies an
 * instruction file only inside its own directory unless `.coderabbit.yaml`
 * says which paths it governs, and it never discovers the skills. That file
 * therefore repeats each rule file's path and scope, and the last block here
 * holds the two copies together.
 *
 * Every check is paired with a planted-defect test, as in
 * `template-lint.test.ts`: a guard that stopped looking passes exactly like a
 * clean tree. The plants are in-memory strings, so nothing in the tracked
 * tree is written.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { splitFrontmatter } from './frontmatter.js';
import { DESCRIPTION_BUDGETS } from './template-lint.js';
import { reviewerBaselineDir, reviewerBaselineFiles } from './reviewers.js';
import { templatesBaseDir } from './utils.js';

const repoRoot = path.resolve(templatesBaseDir, '..', '..');
const githubDir = path.join(repoRoot, '.github');
const instructionsDir = path.join(githubDir, 'instructions');
const skillsDir = path.join(githubDir, 'skills');
const codeRabbitConfigPath = path.join(repoRoot, '.coderabbit.yaml');

/** GitHub's guidance for a custom instruction file read during code review. */
const INSTRUCTION_CHAR_BUDGET = 4000;

/** The two agents an instruction file may opt out of. */
const EXCLUDABLE_AGENTS = new Set(['code-review', 'coding-agent']);

/**
 * References that resolve only inside SmithyCLI. A file in the Smithy-general
 * layer is written to be true in any repository that uses Smithy, so it may
 * name none of them.
 */
const REPO_SPECIFIC_REFERENCES: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'a SmithyCLI source path', pattern: /(^|[\s`(])src\// },
  { label: 'the evals tree', pattern: /(^|[\s`(])evals\// },
  { label: 'an engraved-record path', pattern: /docs\/(invariants|decisions|constitution)\b/ },
  { label: 'an engraved-record ID', pattern: /\b(INV|D|P)-\d+\b/ },
  { label: 'an issue or pull request number', pattern: /(^|\s)#\d+\b/ },
  { label: 'the repository name', pattern: /\bSmithyCLI\b/ },
];

function frontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim().replace(/^["']|["']$/g, '');
}

/** Problems with one `.github/instructions/*.instructions.md` file. */
function checkInstructionFile(fileName: string, content: string): string[] {
  const problems: string[] = [];
  const { frontmatter } = splitFrontmatter(content);
  if (!frontmatterValue(frontmatter, 'applyTo')) {
    problems.push(`${fileName}: no applyTo — reviewers ignore an instruction file without one`);
  }
  const excluded = frontmatterValue(frontmatter, 'excludeAgent');
  if (excluded !== undefined && !EXCLUDABLE_AGENTS.has(excluded)) {
    problems.push(`${fileName}: excludeAgent "${excluded}" is not one of ${[...EXCLUDABLE_AGENTS].join(', ')}`);
  }
  if (content.length > INSTRUCTION_CHAR_BUDGET) {
    problems.push(`${fileName}: ${content.length} characters, over the ${INSTRUCTION_CHAR_BUDGET} budget — move depth into a skill`);
  }
  return problems;
}

/** Problems with one `.github/skills/<dir>/SKILL.md` file. */
function checkSkill(dirName: string, content: string): string[] {
  const problems: string[] = [];
  const { frontmatter } = splitFrontmatter(content);
  const name = frontmatterValue(frontmatter, 'name');
  if (name !== dirName) {
    problems.push(`${dirName}: frontmatter name "${name ?? ''}" does not match its directory`);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(dirName)) {
    problems.push(`${dirName}: skill names use lowercase letters, digits, and hyphens only`);
  }
  const description = frontmatterValue(frontmatter, 'description') ?? '';
  const words = description.split(/\s+/).filter(Boolean).length;
  if (words === 0) {
    problems.push(`${dirName}: no description — it is the trigger a reviewer matches on`);
  } else if (words > DESCRIPTION_BUDGETS.skills) {
    problems.push(`${dirName}: description is ${words} words, over the ${DESCRIPTION_BUDGETS.skills}-word skill budget`);
  }
  return problems;
}

/** Repository-specific references found in a Smithy-general file. */
function findRepoSpecificReferences(label: string, content: string): string[] {
  const { body } = splitFrontmatter(content);
  return REPO_SPECIFIC_REFERENCES
    .filter(({ pattern }) => pattern.test(body))
    .map(({ label: what }) => `${label}: names ${what}, which only exists in this repository`);
}

/** Skill names an instruction file sends the reviewer to, as `` `name` skill ``. */
function referencedSkills(content: string): string[] {
  return [...content.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)*)`\s+skill\b/g)].map((m) => m[1] as string);
}

const instructionPath = (fileName: string) => `.github/instructions/${fileName}`;
const skillPath = (dirName: string) => `.github/skills/${dirName}/SKILL.md`;

/** Every key in a parsed YAML document, at any depth. */
function allKeys(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(allKeys);
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, value]) => [key, ...allKeys(value)]);
}

/**
 * Problems with `.coderabbit.yaml`, given the instruction files and skills it
 * should point at (file or directory name → content). The config may only
 * point: every rule file a reviewer reads is listed once with the paths it
 * governs, and no rule text is written inline.
 */
function checkCodeRabbitConfig(
  configText: string,
  instructions: ReadonlyMap<string, string>,
  skills: ReadonlyMap<string, string>,
): string[] {
  const problems: string[] = [];
  const config = parseYaml(configText) as
    | { knowledge_base?: { code_guidelines?: { enabled?: boolean; filePatterns?: unknown[] } } }
    | null;
  const guidelines = config?.knowledge_base?.code_guidelines;

  if (guidelines?.enabled === false) {
    problems.push('code_guidelines is disabled — CodeRabbit would read none of the rule files');
  }
  const inline = allKeys(config).filter((key) => key === 'instructions' || key.endsWith('_instructions'));
  if (inline.length > 0) {
    problems.push(`${[...new Set(inline)].join(', ')}: rule text belongs in a rule file, not inline in the config`);
  }

  const scopes = new Map<string, string>();
  for (const entry of guidelines?.filePatterns ?? []) {
    const { files, applyTo } = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    if (typeof files !== 'string' || typeof applyTo !== 'string') {
      problems.push(`${JSON.stringify(entry)}: an entry needs files and applyTo — without applyTo a file is applied only inside its own directory`);
    } else if (scopes.has(files)) {
      problems.push(`${files}: listed twice`);
    } else {
      scopes.set(files, applyTo);
    }
  }

  const applyToOf = (content: string) => frontmatterValue(splitFrontmatter(content).frontmatter, 'applyTo');
  const expected = new Map<string, string[]>();
  for (const [fileName, content] of instructions) {
    const reviewsCode = frontmatterValue(splitFrontmatter(content).frontmatter, 'excludeAgent') !== 'code-review';
    if (reviewsCode) {
      expected.set(instructionPath(fileName), [applyToOf(content) ?? '']);
    } else if (scopes.has(instructionPath(fileName))) {
      problems.push(`${instructionPath(fileName)}: excluded from code review, so it is not a reviewer rule`);
    }
  }
  for (const dirName of skills.keys()) {
    const senders = [...instructions.values()].filter((content) => referencedSkills(content).includes(dirName));
    expected.set(skillPath(dirName), senders.map((content) => applyToOf(content) ?? ''));
  }

  for (const [file, allowed] of expected) {
    const scope = scopes.get(file);
    if (scope === undefined) {
      problems.push(`${file}: not listed — CodeRabbit would not apply it`);
    } else if (allowed.length === 0) {
      problems.push(`${file}: no instruction file sends a reviewer to this skill, so it has no paths to copy`);
    } else if (!allowed.includes(scope)) {
      problems.push(`${file}: applyTo "${scope}" does not match "${allowed.join('" or "')}"`);
    }
  }
  for (const file of scopes.keys()) {
    if (!expected.has(file) && !problems.some((p) => p.startsWith(`${file}:`))) {
      problems.push(`${file}: not an instruction file or review skill in this repository`);
    }
  }
  return problems;
}

const instructionFiles = fs.existsSync(instructionsDir)
  ? fs.readdirSync(instructionsDir).filter((f) => f.endsWith('.md')).sort()
  : [];
const skillDirs = fs.existsSync(skillsDir)
  ? fs.readdirSync(skillsDir).filter((d) => fs.existsSync(path.join(skillsDir, d, 'SKILL.md'))).sort()
  : [];
const readInstruction = (f: string) => fs.readFileSync(path.join(instructionsDir, f), 'utf-8');
const readSkill = (d: string) => fs.readFileSync(path.join(skillsDir, d, 'SKILL.md'), 'utf-8');

describe('reviewer instructions — path-scoped files', () => {
  it('ships at least the Smithy-general and repository layers', () => {
    expect(instructionFiles.some((f) => f.startsWith('smithy.'))).toBe(true);
    expect(instructionFiles.some((f) => !f.startsWith('smithy.'))).toBe(true);
  });

  it('names every file NAME.instructions.md', () => {
    expect(instructionFiles.filter((f) => !f.endsWith('.instructions.md'))).toEqual([]);
  });

  it('gives every file an applyTo, a valid excludeAgent, and a size inside the budget', () => {
    expect(instructionFiles.flatMap((f) => checkInstructionFile(f, readInstruction(f)))).toEqual([]);
  });

  it('keeps the repository-wide file inside the same budget', () => {
    const content = fs.readFileSync(path.join(githubDir, 'copilot-instructions.md'), 'utf-8');
    expect(content.length).toBeLessThanOrEqual(INSTRUCTION_CHAR_BUDGET);
  });

  it('detects a planted file with no applyTo', () => {
    expect(checkInstructionFile('plant.instructions.md', '---\nexcludeAgent: "coding-agent"\n---\nbody')).toHaveLength(1);
  });

  it('detects a planted unknown excludeAgent', () => {
    const plant = '---\napplyTo: "**"\nexcludeAgent: "reviewer"\n---\nbody';
    expect(checkInstructionFile('plant.instructions.md', plant)).toHaveLength(1);
  });

  it('detects a planted over-budget file', () => {
    const plant = `---\napplyTo: "**"\n---\n${'x'.repeat(INSTRUCTION_CHAR_BUDGET)}`;
    expect(checkInstructionFile('plant.instructions.md', plant)).toHaveLength(1);
  });
});

describe('reviewer instructions — skills', () => {
  it('gives every skill a matching name and a description inside the skill budget', () => {
    expect(skillDirs.flatMap((d) => checkSkill(d, readSkill(d)))).toEqual([]);
  });

  it('sends the reviewer only to skills that exist', () => {
    const dead = instructionFiles.flatMap((f) =>
      referencedSkills(readInstruction(f))
        .filter((name) => !skillDirs.includes(name))
        .map((name) => `${f} → ${name}`),
    );
    expect(dead).toEqual([]);
  });

  it('detects a planted name that does not match its directory', () => {
    expect(checkSkill('review-plant', '---\nname: other\ndescription: "Use when reviewing."\n---\n')).toHaveLength(1);
  });

  it('detects a planted over-budget description', () => {
    const description = Array.from({ length: DESCRIPTION_BUDGETS.skills + 1 }, () => 'word').join(' ');
    expect(checkSkill('review-plant', `---\nname: review-plant\ndescription: "${description}"\n---\n`)).toHaveLength(1);
  });

  it('detects a planted reference to a skill that does not exist', () => {
    expect(referencedSkills('use the `no-such-review` skill')).toEqual(['no-such-review']);
  });
});

describe('reviewer instructions — the Smithy-general layer stays general', () => {
  it('names nothing that exists only in this repository', () => {
    const leaks = [
      ...instructionFiles
        .filter((f) => f.startsWith('smithy.'))
        .flatMap((f) => findRepoSpecificReferences(f, readInstruction(f))),
      ...skillDirs
        .filter((d) => d.startsWith('smithy-'))
        .flatMap((d) => findRepoSpecificReferences(d, readSkill(d))),
    ];
    expect(leaks).toEqual([]);
  });

  it.each(reviewerBaselineFiles)('ships a portable byte-identical baseline source for %s', (file) => {
    const source = fs.readFileSync(path.join(reviewerBaselineDir, file));
    expect(findRepoSpecificReferences(file, source.toString('utf8'))).toEqual([]);
    expect(source.equals(fs.readFileSync(path.join(repoRoot, file)))).toBe(true);
  });

  it('detects planted repository-specific references', () => {
    const plant = '---\napplyTo: "**"\n---\nRead `src/manifest.ts`, cite INV-2, and see #551.';
    expect(findRepoSpecificReferences('plant', plant)).toHaveLength(3);
  });

  it('leaves artifact vocabulary alone', () => {
    const clean = '---\napplyTo: "**"\n---\nAn open `SD-003` row, `AS 2.1`, `FR-006`, and `.claude/commands/smithy.audit.md`.';
    expect(findRepoSpecificReferences('clean', clean)).toEqual([]);
  });
});

describe('reviewer instructions — CodeRabbit config', () => {
  const instructions = new Map(instructionFiles.map((f) => [f, readInstruction(f)] as const));
  const skills = new Map(skillDirs.map((d) => [d, readSkill(d)] as const));
  const config = fs.readFileSync(codeRabbitConfigPath, 'utf-8');

  const entry = (files: string, applyTo: string) => `      - files: "${files}"\n        applyTo: "${applyTo}"\n`;
  const plantConfig = (entries: string, extra = '') =>
    `${extra}knowledge_base:\n  code_guidelines:\n    filePatterns:\n${entries}`;
  const plantInstructions = new Map([
    ['plant.instructions.md', '---\napplyTo: "src/**"\n---\nLoad the `review-plant` skill.'],
  ]);
  const plantSkills = new Map([['review-plant', '']]);
  const cleanEntries =
    entry('.github/instructions/plant.instructions.md', 'src/**') +
    entry('.github/skills/review-plant/SKILL.md', 'src/**');

  it('lists every reviewer rule file once, with the paths the file itself declares', () => {
    expect(checkCodeRabbitConfig(config, instructions, skills)).toEqual([]);
  });

  it('accepts a planted config that only points', () => {
    expect(checkCodeRabbitConfig(plantConfig(cleanEntries), plantInstructions, plantSkills)).toEqual([]);
  });

  it('detects a planted instruction file the config does not list', () => {
    const plant = plantConfig(entry('.github/skills/review-plant/SKILL.md', 'src/**'));
    expect(checkCodeRabbitConfig(plant, plantInstructions, plantSkills)).toHaveLength(1);
  });

  it('detects a planted skill the config does not list', () => {
    const plant = plantConfig(entry('.github/instructions/plant.instructions.md', 'src/**'));
    expect(checkCodeRabbitConfig(plant, plantInstructions, plantSkills)).toHaveLength(1);
  });

  it('detects a planted applyTo that drifted from the file', () => {
    const plant = plantConfig(
      entry('.github/instructions/plant.instructions.md', '**') +
        entry('.github/skills/review-plant/SKILL.md', 'src/**'),
    );
    expect(checkCodeRabbitConfig(plant, plantInstructions, plantSkills)).toHaveLength(1);
  });

  it('detects a planted entry with no applyTo', () => {
    const plant = plantConfig(`${cleanEntries}      - "docs/standards.md"\n`);
    expect(checkCodeRabbitConfig(plant, plantInstructions, plantSkills)).toHaveLength(1);
  });

  it('detects a planted entry for a file that is not a reviewer rule', () => {
    const plant = plantConfig(cleanEntries + entry('.github/instructions/gone.instructions.md', '**'));
    expect(checkCodeRabbitConfig(plant, plantInstructions, plantSkills)).toHaveLength(1);
  });

  it('detects a planted entry for a file excluded from code review', () => {
    const withAgentFile = new Map([
      ...plantInstructions,
      ['agent.instructions.md', '---\napplyTo: "**"\nexcludeAgent: "code-review"\n---\nbody'],
    ]);
    const plant = plantConfig(cleanEntries + entry('.github/instructions/agent.instructions.md', '**'));
    expect(checkCodeRabbitConfig(plant, withAgentFile, plantSkills)).toHaveLength(1);
  });

  it('detects planted inline rule text', () => {
    const plant = plantConfig(
      cleanEntries,
      'reviews:\n  path_instructions:\n    - path: "src/**"\n      instructions: "Flag everything."\n',
    );
    expect(checkCodeRabbitConfig(plant, plantInstructions, plantSkills)).toHaveLength(1);
  });

  it('detects planted disabled guidelines', () => {
    const plant = plantConfig(cleanEntries).replace('filePatterns:', 'enabled: false\n    filePatterns:');
    expect(checkCodeRabbitConfig(plant, plantInstructions, plantSkills)).toHaveLength(1);
  });
});

describe('reviewer instructions — AGENTS.md', () => {
  it('keeps the section Codex reads its review rules from', () => {
    const agents = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf-8');
    expect(agents).toMatch(/^## Code Review Rules$/m);
  });
});
