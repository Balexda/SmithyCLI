import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { promptConfirmUninit, promptTargetDir } from '../interactive.js';
import { removeIfExists, issueTemplatesSrcDir } from '../utils.js';
import * as gemini from '../agents/gemini.js';
import * as claude from '../agents/claude.js';
import * as codex from '../agents/codex.js';

export interface UninitOptions {
  targetDir?: string;
  yes?: boolean;
}

export async function uninitAction(opts: UninitOptions = {}): Promise<void> {
  console.log(picocolors.cyan('🧹 Welcome to Smithy CLI (Uninit)\n'));

  let confirmed: boolean;
  if (opts.yes) {
    console.log(picocolors.yellow('Auto-confirming removal (--yes flag provided)'));
    confirmed = true;
  } else {
    confirmed = await promptConfirmUninit();
  }

  if (!confirmed) {
    console.log(picocolors.yellow('\nOperation cancelled.'));
    return;
  }

  const targetDir = path.resolve(opts.targetDir ?? (opts.yes ? process.cwd() : await promptTargetDir()));

  let removedCount = 0;

  // Remove agent artifacts
  removedCount += gemini.remove(targetDir);
  removedCount += claude.remove(targetDir);
  removedCount += codex.remove(targetDir);

  // Remove issue templates
  if (fs.existsSync(issueTemplatesSrcDir)) {
    const issueTemplates = fs.readdirSync(issueTemplatesSrcDir).filter(f => f.endsWith('.md') || f.endsWith('.yml'));
    const issueTemplatesDest = path.join(targetDir, '.github', 'ISSUE_TEMPLATE');

    for (const file of issueTemplates) {
      if (removeIfExists(path.join(issueTemplatesDest, file))) removedCount++;
    }
  }

  if (removedCount > 0) {
    console.log(picocolors.green(`\n✅ Successfully removed ${removedCount} Smithy artifacts.`));
    console.log(picocolors.blue('Note: Configuration and permission files were preserved.'));
  } else {
    console.log(picocolors.yellow('\nNo Smithy artifacts were found to remove.'));
  }
}
