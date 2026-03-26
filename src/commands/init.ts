import path from 'path';
import picocolors from 'picocolors';
import { promptAgent, promptPermissions, promptIssueTemplates, promptTargetDir } from '../interactive.js';
import { copyDirSync, issueTemplatesSrcDir, agentGitignoreEntries, addToGitignore } from '../utils.js';
import * as gemini from '../agents/gemini.js';
import * as claude from '../agents/claude.js';
import * as codex from '../agents/codex.js';
import type { AgentChoice } from '../interactive.js';

export interface InitOptions {
  agent?: AgentChoice;
  permissions?: boolean;
  issueTemplates?: boolean;
  targetDir?: string;
  yes?: boolean;
}

export async function initAction(opts: InitOptions = {}): Promise<void> {
  console.log(picocolors.cyan('🔨 Welcome to Smithy CLI\n'));

  const agent = opts.agent ?? (opts.yes ? 'all' : await promptAgent());
  const initPermissions = opts.permissions ?? (opts.yes ? true : await promptPermissions());
  const initIssueTemplates = opts.issueTemplates ?? (opts.yes ? true : await promptIssueTemplates());
  const targetDir = path.resolve(opts.targetDir ?? (opts.yes ? process.cwd() : await promptTargetDir()));

  if (initIssueTemplates) {
    const issueTemplatesDest = path.join(targetDir, '.github', 'ISSUE_TEMPLATE');
    console.log(picocolors.green(`\nInstalling Smithy GitHub Issue templates in ${issueTemplatesDest}...`));
    copyDirSync(issueTemplatesSrcDir, issueTemplatesDest);
  }

  const agentsToSetup = agent === 'all' ? ['gemini', 'claude', 'codex'] as const : [agent] as const;

  for (const a of agentsToSetup) {
    if (a === 'gemini') {
      gemini.deploy(targetDir, initPermissions);
    } else if (a === 'claude') {
      claude.deploy(targetDir, initPermissions);
    } else if (a === 'codex') {
      codex.deploy(targetDir, initPermissions);
    }
  }

  const gitignoreEntries = agentsToSetup.flatMap(a => agentGitignoreEntries[a] ?? []);
  if (gitignoreEntries.length > 0) {
    const added = addToGitignore(targetDir, gitignoreEntries);
    if (added > 0) {
      console.log(picocolors.blue(`  Added ${added} agent director${added === 1 ? 'y' : 'ies'} to .gitignore`));
    } else {
      console.log(picocolors.dim('  .gitignore already up to date'));
    }
  }

  console.log(picocolors.cyan('\n✅ Initialization complete!'));

  if (agentsToSetup.includes('gemini')) {
    console.log(picocolors.yellow('Note: If you are currently in an interactive Gemini CLI session, please run `/skills reload` to load the new workspace skills.'));
  }
}
