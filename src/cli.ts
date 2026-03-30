#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command, Option } from 'commander';
import { initAction } from './commands/init.js';
import { uninitAction } from './commands/uninit.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('smithy')
  .description('Smithy Agentic Development Workflow initialization tool')
  .version(version);

program
  .command('init')
  .description('Initialize smithy prompts in the current repository')
  .addOption(
    new Option('-a, --agent <name>', 'AI assistant to configure')
      .choices(['gemini', 'claude', 'codex', 'all'])
  )
  .addOption(
    new Option('-l, --location <location>', 'Deploy location')
      .choices(['repo', 'local', 'user'])
  )
  .option('--permissions', 'Deploy permissions at the selected location')
  .option('--no-permissions', 'Skip permissions setup')
  .option('--issue-templates', 'Install Smithy issue templates')
  .option('--no-issue-templates', 'Skip issue templates')
  .option('-d, --target-dir <path>', 'Target directory')
  .option('-y, --yes', 'Accept defaults for unset options (non-interactive)')
  .action(initAction);

program
  .command('uninit')
  .description('Remove smithy prompts and templates from the current repository')
  .option('-d, --target-dir <path>', 'Target directory')
  .option('-y, --yes', 'Auto-confirm removal (non-interactive)')
  .action(uninitAction);

program.parse(process.argv);
