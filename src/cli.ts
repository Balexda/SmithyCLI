#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command, Option } from 'commander';
import { initAction, type InitOptions } from './commands/init.js';
import { toolchains, type LanguageToolchain } from './permissions.js';
import { uninitAction } from './commands/uninit.js';
import { updateAction } from './commands/update.js';
import { statusAction, type StatusOptions } from './commands/status.js';

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
  .option('--no-session-titles', 'Skip the Claude Code session-title hook')
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

program
  .command('status')
  .description('Scan the repository and report the status of Smithy artifacts')
  .option('--root <path>', 'Directory to scan (defaults to current working directory)')
  .addOption(
    new Option('--format <format>', 'Output format')
      .choices(['text', 'json'])
      .default('text'),
  )
  // `--all` is wired (US3) and `--status` / `--type` are wired (US6).
  // `--graph` and `--no-color` remain stubs that Commander parses so
  // `smithy status --help` advertises the full surface; `--graph` is
  // owned by US10 and `--no-color` has no effect until a colored
  // renderer lands.
  //
  // `--status` and `--type` deliberately do NOT use Commander
  // `.choices()` because Commander's invalid-choice handler exits with
  // code 1, while the contracts mandate exit code 2 for invalid values
  // on these two flags. `statusAction` validates them manually and
  // sets `process.exitCode = 2`.
  .option('--status <state>', 'Filter by status: done|in-progress|not-started|unknown')
  .option('--type <artifact-type>', 'Filter by artifact type: rfc|features|spec|tasks')
  .option('--all', 'Disable collapsing of done subtrees so every artifact surfaces')
  .option('--graph', 'Render the cross-artifact dependency graph (stub — wired in US2/US10)')
  .option('--no-color', 'Suppress ANSI color output (stub — no colored text yet)')
  .action((opts: Record<string, unknown>) => {
    const statusOpts: StatusOptions = { ...opts } as StatusOptions;
    return statusAction(statusOpts);
  });

program.parse(process.argv);
