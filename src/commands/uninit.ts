import fs from 'fs';
import path from 'path';
import picocolors from 'picocolors';
import { promptConfirmUninit, promptManifestChoice } from '../interactive.js';
import { removeIfExists, issueTemplatesSrcDir, resolveIssueTemplatePath } from '../utils.js';
import { readManifest, removeManifestFiles } from '../manifest.js';
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

  const targetDir = path.resolve(opts.targetDir ?? process.cwd());
  const nonInteractive = opts.yes ?? false;

  // 1. Discover manifests
  const repoManifest = readManifest(targetDir, 'repo');
  const userManifest = readManifest(targetDir, 'user');

  // 2. Determine which location(s) to uninit
  type UninitTarget = { location: DeployLocation; hasManifest: boolean };
  const targets: UninitTarget[] = [];

  if (repoManifest && userManifest) {
    // Both exist — prompt for choice
    const choice = nonInteractive
      ? 'both'
      : await promptManifestChoice(
          repoManifest.smithyVersion,
          userManifest.smithyVersion,
          'remove',
        );

    if (choice === 'both' || choice === 'repo') {
      targets.push({ location: 'repo', hasManifest: true });
    }
    if (choice === 'both' || choice === 'user') {
      targets.push({ location: 'user', hasManifest: true });
    }
  } else if (repoManifest) {
    console.log(picocolors.dim('Found repo manifest'));
    targets.push({ location: 'repo', hasManifest: true });
  } else if (userManifest) {
    console.log(picocolors.dim('Found user manifest'));
    targets.push({ location: 'user', hasManifest: true });
  } else {
    // No manifest at all — fall through to legacy cleanup
    targets.push({ location: 'repo', hasManifest: false });
  }

  // 3. Confirm removal
  let confirmed: boolean;
  if (nonInteractive) {
    console.log(picocolors.yellow('Auto-confirming removal (--yes flag provided)'));
    confirmed = true;
  } else {
    confirmed = await promptConfirmUninit();
  }

  if (!confirmed) {
    console.log(picocolors.yellow('\nOperation cancelled.'));
    return;
  }

  let removedCount = 0;

  // Step 1: Remove manifest-tracked files for each selected location
  for (const { location, hasManifest } of targets) {
    if (hasManifest) {
      // If a session-title hook was deployed, strip its entry from settings.json
      // before removing the manifest. The hook script file itself is removed by
      // removeManifestFiles since it's tracked in `files['claude']`.
      const manifest = location === 'repo' ? repoManifest : userManifest;
      if (manifest?.sessionTitles) {
        claude.removeSessionTitleHook(targetDir, location);
      }
      removedCount += removeManifestFiles(targetDir, location);
    }
  }

  // Step 2: Legacy cleanup for installs without a manifest
  removedCount += claude.removeLegacy(targetDir);
  removedCount += gemini.removeLegacy(targetDir);
  removedCount += codex.removeLegacy(targetDir);

  // Step 3: Remove issue templates from targeted locations
  if (fs.existsSync(issueTemplatesSrcDir)) {
    const issueTemplates = fs.readdirSync(issueTemplatesSrcDir).filter(f => f.endsWith('.md') || f.endsWith('.yml'));

    for (const { location } of targets) {
      const dir = resolveIssueTemplatePath(targetDir, location);
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
