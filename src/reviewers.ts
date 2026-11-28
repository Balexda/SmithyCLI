import fs from 'node:fs';
import path from 'node:path';
import { templatesBaseDir } from './utils.js';

export const reviewerBaselineDir = path.join(templatesBaseDir, 'reviewers');
export const reviewerBaselineFiles = [
  '.github/instructions/smithy.review-stance.instructions.md',
  '.github/instructions/smithy.planning-artifacts.instructions.md',
  '.github/skills/smithy-review-planning/SKILL.md',
];

export function deployReviewerBaseline(targetDir: string): string[] {
  for (const file of reviewerBaselineFiles) {
    const source = fs.readFileSync(path.join(reviewerBaselineDir, file));
    const destination = path.join(targetDir, file);
    if (fs.existsSync(destination)) {
      if (source.equals(fs.readFileSync(destination))) continue;
      console.log(`  Reviewer baseline: replaced ${file} (differed from the shipped baseline)`);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, source);
    console.log(`  Reviewer baseline: wrote ${file}`);
  }
  console.log(`  Reviewer baseline: ${reviewerBaselineFiles.length} files`);
  return [...reviewerBaselineFiles];
}

function listDirectory(targetDir: string, dir: string): fs.Dirent[] {
  const absolute = path.join(targetDir, dir);
  return fs.existsSync(absolute) ? fs.readdirSync(absolute, { withFileTypes: true }) : [];
}

export function reportDanglingReviewerReferences(targetDir: string, removed: string[]): void {
  if (removed.length === 0) return;

  const instructions = '.github/instructions';
  const skills = '.github/skills';
  const candidates = [
    'AGENTS.md',
    'CLAUDE.md',
    '.github/copilot-instructions.md',
    '.coderabbit.yaml',
    ...listDirectory(targetDir, instructions)
      .filter(entry => entry.isFile() && entry.name.endsWith('.instructions.md') && !entry.name.startsWith('smithy.'))
      .map(entry => `${instructions}/${entry.name}`),
    ...listDirectory(targetDir, skills)
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('smithy-'))
      .map(entry => `${skills}/${entry.name}/SKILL.md`),
  ];
  for (const file of candidates) {
    const absolute = path.join(targetDir, file);
    if (!fs.existsSync(absolute)) continue;
    const content = fs.readFileSync(absolute, 'utf8');
    for (const removedFile of removed) {
      const shortReference = removedFile.startsWith(`${skills}/`)
        ? path.basename(path.dirname(removedFile))
        : path.basename(removedFile);
      const standalone = new RegExp(`(?<![\\w.-])${shortReference.replace(/[.]/g, '\\.')}(?![\\w-])`);
      if (content.includes(removedFile) || standalone.test(content)) {
        console.log(`  ${file} still references ${removedFile}`);
      }
    }
  }
}
