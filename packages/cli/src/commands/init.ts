import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommandContext, SlashCommandHandler } from './index.js';

export function buildInitCommand(ctx: CommandContext): SlashCommandHandler {
  return {
    name: 'init',
    description: 'Initialize project with coding conventions (creates CYBER.md).',
    category: 'config',
    usage: '/init',
    run: () => {
      const cwd = process.cwd();
      const targetPath = path.join(cwd, 'CYBER.md');

      const reply = (content: string) => {
        ctx.appendMessage({
          id: `init-${Date.now()}`,
          role: 'system',
          content,
          createdAt: Date.now(),
        });
      };

      if (fs.existsSync(targetPath)) {
        reply('⚠️ CYBER.md already exists in the current directory.');
        return;
      }

      // Simple auto-detection of project type
      let projectType = 'Generic';
      let buildCommand = 'make';
      let testCommand = 'make test';
      let guidelines = 'Write clean, modern, and self-documenting code.';

      if (fs.existsSync(path.join(cwd, 'package.json'))) {
        projectType = 'Node.js / TypeScript';
        buildCommand = 'npm run build';
        testCommand = 'npm test';
        guidelines = '- Prefer TypeScript over plain JavaScript.\n- Use ES modules (import/export).\n- Keep dependencies minimal and use clean async/await patterns.';
      } else if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
        projectType = 'Rust';
        buildCommand = 'cargo build';
        testCommand = 'cargo test';
        guidelines = '- Follow standard rustfmt conventions.\n- Minimize use of `unsafe` blocks.\n- Handle errors explicitly using Result and Option.';
      } else if (fs.existsSync(path.join(cwd, 'go.mod'))) {
        projectType = 'Go';
        buildCommand = 'go build ./...';
        testCommand = 'go test ./...';
        guidelines = '- Handle errors immediately where they occur.\n- Use standard naming style (camelCase).\n- Write table-driven unit tests.';
      } else if (
        fs.existsSync(path.join(cwd, 'requirements.txt')) ||
        fs.existsSync(path.join(cwd, 'pyproject.toml')) ||
        fs.existsSync(path.join(cwd, 'setup.py'))
      ) {
        projectType = 'Python';
        buildCommand = 'python -m pip install -r requirements.txt';
        testCommand = 'pytest';
        guidelines = '- Follow PEP 8 guidelines.\n- Use type hints for all public functions.\n- Write docstrings in Google style format.';
      }

      const template = `# CYBER.md - Project Conventions

This file defines guidelines and standard instructions for CyberCoder when operating in this codebase.

## Project Profile
- **Project Type**: ${projectType}
- **Build Command**: \`${buildCommand}\`
- **Test Command**: \`${testCommand}\`

## Coding Standards & Guidelines
${guidelines}
- Write thorough unit tests for new functionality.
- Prioritize visual polish, responsive design, and CSS variables for UI components.

## Architecture & Structure
- Document major architecture modules.
- Maintain clean separation between client (frontend) and server (backend) code.

## Preferred Tools
- CLI edits: Use \`edit\` tool for surgical modifications.
- Commands: Propose standard commands using \`run_command\`.
`;

      try {
        fs.writeFileSync(targetPath, template, 'utf8');
        reply(`✅ Successfully initialized project! Created CYBER.md for **${projectType}**.`);
      } catch (err) {
        reply(`❌ Failed to create CYBER.md: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}
