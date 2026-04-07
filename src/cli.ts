#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command, Option } from 'commander';
import { initAction, type InitOptions } from './commands/init.js';
import { toolchains, type LanguageToolchain } from './permissions.js';
import { uninitAction } from './commands/uninit.js';
import { updateAction } from './commands/update.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('smithy')
  .description('Smithy Agentic Development Workflow initialization tool')
  .version(version);

program
  .command('init')
  .alias('setup')
  .description('Initialize smithy prompts in the current repository')
  .addOption(
    new Option('-a, --agent <name>', 'AI assistant to configure')
      .choices(['claude', 'gemini', 'all'])
  )
  .addOption(
    new Option('-l, --location <location>', 'Deploy location')
      .choices(['repo', 'user'])
      .conflicts('targetDir')
  )
  .option('--permissions', 'Deploy permissions at the selected location')
  .option('--no-permissions', 'Skip permissions setup')
  .option('--issue-templates', 'Install Smithy issue templates')
  .option('--no-issue-templates', 'Skip issue templates')
  .option('--toolchains <list>', 'Comma-separated language toolchains to include in permissions (node,java,rust,python)')
  .option('-d, --target-dir <path>', 'Target directory')
  .option('-y, --yes', 'Accept defaults for unset options (non-interactive)')
  .action((opts: Record<string, unknown>) => {
    const initOpts: InitOptions = { ...opts } as InitOptions;
    if (typeof opts.toolchains === 'string') {
      const valid = new Set(Object.keys(toolchains));
      const langs = (opts.toolchains as string).split(',').map(s => s.trim()).filter(Boolean);
      const invalid = langs.filter(l => !valid.has(l));
      if (invalid.length > 0) {
        console.error(`Error: Unknown toolchain(s): ${invalid.join(', ')}. Valid: ${[...valid].join(', ')}`);
        process.exitCode = 1;
        return;
      }
      initOpts.languages = langs as LanguageToolchain[];
    }
    return initAction(initOpts);
  });

program
  .command('uninit')
  .description('Remove smithy prompts and templates from the current repository')
  .option('-d, --target-dir <path>', 'Target directory')
  .option('-y, --yes', 'Auto-confirm removal (non-interactive)')
  .action(uninitAction);

program
  .command('update')
  .alias('upgrade')
  .description('Update deployed smithy templates to the current CLI version')
  .option('-d, --target-dir <path>', 'Target directory')
  .option('-y, --yes', 'Accept defaults (non-interactive)')
  .action(updateAction);

program.parse(process.argv);
