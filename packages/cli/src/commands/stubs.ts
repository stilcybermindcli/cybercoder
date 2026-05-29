import type { CommandContext, SlashCommandHandler } from './index.js';

/**
 * Every slash command listed in the master plan is registered up-front, even
 * if its real implementation lands in a later milestone. This lets `/help`
 * advertise the full command surface and gives users a clear "coming in MN"
 * message instead of "unknown command".
 *
 * As each milestone wires a command, delete its stub entry here and add the
 * real handler to its own file under packages/cli/src/commands/.
 */

interface StubSpec {
  name: string;
  description: string;
  category: SlashCommandHandler['category'];
  milestone: string;
  aliases?: string[];
  usage?: string;
}

const STUBS: StubSpec[] = [
  // Session / context
  { name: 'branch', category: 'session', milestone: 'M5', description: 'Fork the conversation at this point.' },
  { name: 'background', category: 'session', milestone: 'M5', description: 'Send this session to the background and free the terminal.' },
  { name: 'btw', category: 'session', milestone: 'M5', description: 'Ask a quick side question without interrupting the main thread.' },
  // /color, /model, /provider, /consensus wired in M5.

  // Agent / model
  { name: 'fallback', category: 'agent', milestone: 'M10', description: 'Manually switch to local Ollama as fallback.' },
  { name: 'agents', category: 'agent', milestone: 'M11', description: 'Manage parallel agent worktree configurations.' },
  { name: 'advisor', category: 'agent', milestone: 'M10', description: 'Consult a stronger advisor model at key moments.' },
  // /research, /plan, /code-review wired in M4 (see commands/skills.ts).

  // Skills
  // /skills wired in M4 (see commands/skills.ts).
  { name: 'skill-creator', category: 'skills', milestone: 'M13', description: 'Author a new skill interactively.' },
  { name: 'agent-browser', category: 'skills', milestone: 'M7', description: 'Run the Playwright browser-automation skill.' },

  // Auth / sync
  { name: 'team', category: 'auth', milestone: 'M6', description: 'Switch the active team workspace.' },
  { name: 'sync', category: 'auth', milestone: 'M6', description: 'Push/pull skills and settings to/from the backend.' },

  // Config / project
  { name: 'add-dir', category: 'config', milestone: 'M5', description: 'Add another working directory to this session.' },

  // Safety
  // /trust, /secret wired in M5.
  { name: 'sandbox', category: 'safety', milestone: 'M10', description: 'Toggle Docker/Podman sandbox for risky commands.' },
  { name: 'replay', category: 'safety', milestone: 'M10', description: 'Deterministically rerun a recorded session.' },

  // Collab
  { name: 'mirror', category: 'collab', milestone: 'M11', description: 'Open the web UI mirror at http://localhost:7777.' },
  { name: 'pair', category: 'collab', milestone: 'M11', description: 'Start or join a live pair session over LAN/tunnel.' },

  // Workflows / palette
  // /workflow wired in M5.
  { name: 'palette', category: 'utility', milestone: 'M12', description: 'Open the fuzzy command palette (Ctrl+K).' },

  // Cyber
  { name: 'cyber', category: 'cyber', milestone: 'Phase 2', description: 'Reserved for the autonomous bug-bounty mode. Coming soon.' },
];

export function buildStubCommands(ctx: CommandContext): SlashCommandHandler[] {
  return STUBS.map((spec) => ({
    name: spec.name,
    description: spec.description,
    category: spec.category,
    aliases: spec.aliases,
    usage: spec.usage,
    run: () => {
      ctx.appendMessage({
        id: `${spec.name}-${Date.now()}`,
        role: 'system',
        content: `/${spec.name} is registered but its implementation lands in ${spec.milestone}.`,
        createdAt: Date.now(),
      });
    },
  }));
}
