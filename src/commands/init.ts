import path from 'path';
import picocolors from 'picocolors';
import { promptAgent, promptPermissions, promptIssueTemplates, promptTargetDir } from '../interactive.js';
import { copyDirSync, issueTemplatesSrcDir } from '../utils.js';
import * as gemini from '../agents/gemini.js';
import * as claude from '../agents/claude.js';
import * as codex from '../agents/codex.js';

export async function initAction(): Promise<void> {
  console.log(picocolors.cyan('🔨 Welcome to Smithy CLI\n'));

  const agent = await promptAgent();
  const initPermissions = await promptPermissions();
  const initIssueTemplates = await promptIssueTemplates();
  const targetDir = path.resolve(await promptTargetDir());

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

  console.log(picocolors.cyan('\n✅ Initialization complete!'));

  if (agentsToSetup.includes('gemini')) {
    console.log(picocolors.yellow('Note: If you are currently in an interactive Gemini CLI session, please run `/skills reload` to load the new workspace skills.'));
  }
}
