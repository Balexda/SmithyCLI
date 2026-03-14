#!/usr/bin/env node
import { Command } from 'commander';
import { initAction } from './commands/init.js';
import { uninitAction } from './commands/uninit.js';

const program = new Command();

program
  .name('smithy')
  .description('Smithy Agentic Development Workflow initialization tool')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize smithy prompts in the current repository')
  .action(initAction);

program
  .command('uninit')
  .description('Remove smithy prompts and templates from the current repository')
  .action(uninitAction);

program.parse(process.argv);
