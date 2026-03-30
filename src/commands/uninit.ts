import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { promptConfirmUninit, promptTargetDir } from '../interactive.js';
import { removeIfExists, issueTemplatesSrcDir, resolveIssueTemplatePath } from '../utils.js';
import * as gemini from '../agents/gemini.js';
import * as claude from '../agents/claude.js';
import * as codex from '../agents/codex.js';
import type { DeployLocation } from '../interactive.js';

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

  // Remove issue templates from repo-scoped deploy locations only.
  // User-global (~/.smithy/) is intentionally skipped — it may be shared
  // across repos and should not be removed by a per-repo uninit.
  if (fs.existsSync(issueTemplatesSrcDir)) {
    const issueTemplates = fs.readdirSync(issueTemplatesSrcDir).filter(f => f.endsWith('.md') || f.endsWith('.yml'));

    const repoScopedLocations: DeployLocation[] = ['repo', 'local'];
    for (const loc of repoScopedLocations) {
      const dir = resolveIssueTemplatePath(targetDir, loc);
      for (const file of issueTemplates) {
        if (removeIfExists(path.join(dir, file))) removedCount++;
      }
    }

    // Legacy: .github/ISSUE_TEMPLATE/ (clean up old deployments)
    const legacyDir = path.join(targetDir, '.github', 'ISSUE_TEMPLATE');
    for (const file of issueTemplates) {
      if (removeIfExists(path.join(legacyDir, file))) removedCount++;
    }
  }

  if (removedCount > 0) {
    console.log(picocolors.green(`\n✅ Successfully removed ${removedCount} Smithy artifacts.`));
    console.log(picocolors.blue('Note: Configuration and permission files were preserved.'));
  } else {
    console.log(picocolors.yellow('\nNo Smithy artifacts were found to remove.'));
  }
}
