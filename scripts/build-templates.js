import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDir = path.join(__dirname, '../src/templates/base');
const templatesDir = path.join(__dirname, '../src/templates');

// Metadata mapping for Gemini Skills
const metadata = {
  'smithy.scope.md': {
    name: 'smithy-scope',
    description: 'Transform an Accepted RFC into a feature-plan folder. Use when converting an RFC into actionable milestones or running smithy.scope.'
  },
  'smithy.segment.md': {
    name: 'smithy-segment',
    description: 'Convert a feature-plan milestone into GitHub Task Stub issues. Use when breaking down a milestone or running smithy.segment.'
  },
  'smithy.queue.md': {
    name: 'smithy-queue',
    description: 'Generate Implementation Task issues from a tasks.md spec. Use when queuing issues from a spec or running smithy.queue.'
  },
  'smithy.stage.md': {
    name: 'smithy-stage',
    description: 'Implement a spec phase end-to-end and open a PR. Use when executing a phase from tasks.md or running smithy.stage.'
  },
  'smithy.fix.md': {
    name: 'smithy-fix',
    description: 'Apply targeted microfixes for CI failures, local failures, or code review feedback. Use when there is an isolated issue to repair or when requested.'
  },
  'smithy.detail.md': {
    name: 'smithy-detail',
    description: 'Review a UX journey and prepare it for Spec Kit / tasks.md generation. Use when converting a flowmap/journey into specs.'
  }
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function buildTemplates() {
  const files = fs.readdirSync(baseDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(baseDir, file), 'utf8');
    const meta = metadata[file];

    if (!meta) {
      console.warn(`No metadata found for ${file}, skipping.`);
      continue;
    }

    // --- Build Gemini Templates ---
    const geminiSkillDir = path.join(templatesDir, 'gemini', 'skills', meta.name);
    ensureDir(geminiSkillDir);
    
    const frontmatter = `---
name: ${meta.name}
description: "${meta.description}"
---
`;
    fs.writeFileSync(path.join(geminiSkillDir, 'SKILL.md'), frontmatter + content);

    // --- Build Codex Templates ---
    const codexDir = path.join(templatesDir, 'codex', 'prompts');
    ensureDir(codexDir);
    fs.writeFileSync(path.join(codexDir, file), content);

    // --- Build Claude Templates ---
    const claudeDir = path.join(templatesDir, 'claude', 'prompts');
    ensureDir(claudeDir);
    fs.writeFileSync(path.join(claudeDir, file), content);
  }
  
  console.log('Templates built successfully.');
}

buildTemplates();
