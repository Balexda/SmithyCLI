#!/usr/bin/env node
import { Command } from 'commander';
import { select, input, confirm } from '@inquirer/prompts';
import picocolors from 'picocolors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('smithy')
  .description('Codex-Assisted Development Workflow initialization tool')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize smithy prompts in the current repository')
  .action(async () => {
    console.log(picocolors.cyan('🔨 Welcome to Smithy CLI\n'));

    const agent = await select({
      message: 'Which AI assistant CLI are you configuring this repository for?',
      choices: [
        { name: 'Gemini CLI', value: 'gemini', description: 'Sets up workspace skills in .gemini/skills/' },
        { name: 'Claude', value: 'claude', description: 'Sets up prompt files for Claude in .claude/prompts/' },
        { name: 'Codex', value: 'codex', description: 'Sets up prompt files for Codex in tools/codex/prompts/' },
        { name: 'All', value: 'all', description: 'Sets up all of the above' }
      ]
    });

    const initPermissions = await confirm({
      message: 'Would you like to initialize default smithy permissions for the selected agent(s)? (Grants access to non-destructive repo actions)',
      default: true
    });

    const initIssueTemplates = await confirm({
      message: 'Would you like to install the Smithy GitHub Issue templates? (Requires a GitHub repository)',
      default: true
    });

    const targetDirInput = await input({
      message: 'Target directory?',
      default: process.cwd()
    });

    const targetDir = path.resolve(targetDirInput);

    const templatesBaseDir = path.join(__dirname, '../src/templates');

    function copyDirSync(src: string, dest: string) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }

      const entries = fs.readdirSync(src, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          copyDirSync(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    if (initIssueTemplates) {
      const issueTemplatesSrc = path.join(templatesBaseDir, 'issue-templates');
      const issueTemplatesDest = path.join(targetDir, '.github', 'ISSUE_TEMPLATE');
      console.log(picocolors.green(`\nInstalling Smithy GitHub Issue templates in ${issueTemplatesDest}...`));
      copyDirSync(issueTemplatesSrc, issueTemplatesDest);
    }

    const defaultPermissionsList = [
      "git status",
      "git fetch origin",
      "git pull origin master",
      "git checkout *",
      "git branch *",
      "git push origin feature/*",
      "git push origin fix/*",
      "git push origin chore/*",
      "cp *",
      "npm run build",
      "npm install",
      "npm test",
      "gh pr create *",
      "gh pr status",
      "gh pr view *",
      "gh issue list",
      "gh issue view *",
      "gh label list",
      "gh run list",
      "gh run view *",
      "gh api repos/*"
    ];

    const agentsToSetup = agent === 'all' ? ['gemini', 'claude', 'codex'] : [agent];

    const basePromptsDir = path.join(templatesBaseDir, 'base');
    const baseFiles = fs.existsSync(basePromptsDir) ? fs.readdirSync(basePromptsDir).filter(f => f.endsWith('.md')) : [];

    for (const a of agentsToSetup) {
      if (a === 'gemini') {
         const destDir = path.join(targetDir, '.gemini');
         const skillsDir = path.join(destDir, 'skills');
         console.log(picocolors.green(`\nInitializing Gemini CLI workspace skills in ${skillsDir}...`));
         
         for (const file of baseFiles) {
           const content = fs.readFileSync(path.join(basePromptsDir, file), 'utf8');
           const match = content.match(/^---\nname:\s*([^\n]+)\ndescription:\s*"([^"]+)"\n---\n/);
           if (match) {
             const name = match[1].trim();
             const skillPath = path.join(skillsDir, name);
             if (!fs.existsSync(skillPath)) fs.mkdirSync(skillPath, { recursive: true });
             fs.writeFileSync(path.join(skillPath, 'SKILL.md'), content);
           }
         }
         
         if (initPermissions) {
           const configPath = path.join(destDir, 'config.json');
           let config = { 
             permissions: { 
               allowed_commands: defaultPermissionsList 
             } 
           };
           if (fs.existsSync(configPath)) {
              try {
                config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (!config.permissions) config.permissions = { allowed_commands: [] };
                if (!config.permissions.allowed_commands) config.permissions.allowed_commands = [];
                // Merge and deduplicate
                config.permissions.allowed_commands = [...new Set([...config.permissions.allowed_commands, ...defaultPermissionsList])];
              } catch(e) {}
           }
           if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
           fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
           console.log(picocolors.blue(`  Added default permissions to ${configPath}`));
         }
      } else if (a === 'claude') {
         const destDir = path.join(targetDir, '.claude', 'prompts');
         console.log(picocolors.green(`\nInitializing Claude prompts in ${destDir}...`));
         if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
         
         for (const file of baseFiles) {
           const content = fs.readFileSync(path.join(basePromptsDir, file), 'utf8');
           const strippedContent = content.replace(/^---\nname:[^\n]+\ndescription:[^\n]+\n---\n/, '');
           fs.writeFileSync(path.join(destDir, file), strippedContent);
         }
         
         if (initPermissions) {
           const claudeBaseDir = path.join(targetDir, '.claude');
           if (!fs.existsSync(claudeBaseDir)) fs.mkdirSync(claudeBaseDir, { recursive: true });
           const configPath = path.join(claudeBaseDir, 'config.json');
           const config = { permissions: { allowed_commands: defaultPermissionsList } };
           fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
           console.log(picocolors.blue(`  Added default permissions to ${configPath}`));
         }
      } else if (a === 'codex') {
         const destDir = path.join(targetDir, 'tools', 'codex', 'prompts');
         console.log(picocolors.green(`\nInitializing Codex prompts in ${destDir}...`));
         if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
         
         for (const file of baseFiles) {
           const content = fs.readFileSync(path.join(basePromptsDir, file), 'utf8');
           const strippedContent = content.replace(/^---\nname:[^\n]+\ndescription:[^\n]+\n---\n/, '');
           fs.writeFileSync(path.join(destDir, file), strippedContent);
         }
         
         if (initPermissions) {
           const codexBaseDir = path.join(targetDir, '.codex');
           if (!fs.existsSync(codexBaseDir)) fs.mkdirSync(codexBaseDir, { recursive: true });
           const configPath = path.join(codexBaseDir, 'config.toml');
           
           // Generate specific Codex-style approval rules based on the provided patterns
           let tomlContent = `[approvals]\npolicy = "auto"\n\n`;
           
           defaultPermissionsList.forEach(cmd => {
             const parts = cmd.split(' ');
             const baseCmd = parts[0];
             const args = parts.slice(1);
             
             const hasWildcard = args.some(arg => arg.includes('*'));
             
             if (hasWildcard) {
               const cleanArgs = args.map(arg => arg.replace('*', '')).filter(arg => arg !== '');
               tomlContent += `[[approvals.rules]]\ncommand = "${baseCmd}"\nargs_startswith = ${JSON.stringify(cleanArgs)}\n\n`;
             } else {
               tomlContent += `[[approvals.rules]]\ncommand = "${baseCmd}"\nargs = ${JSON.stringify(args)}\n\n`;
             }
           });
           
           if (!fs.existsSync(configPath) || !fs.readFileSync(configPath, 'utf8').includes('[approvals]')) {
             fs.appendFileSync(configPath, (fs.existsSync(configPath) ? '\n' : '') + tomlContent);
             console.log(picocolors.blue(`  Added default permissions to ${configPath}`));
           }
         }
      }
    }

    console.log(picocolors.cyan('\n✅ Initialization complete!'));
    
    if (agentsToSetup.includes('gemini')) {
      console.log(picocolors.yellow('Note: If you are currently in an interactive Gemini CLI session, please run `/skills reload` to load the new workspace skills.'));
    }
  });

program.parse(process.argv);
