import type { SessionMessage } from '../state/session.js';
import { buildHelpCommand } from './help.js';
import { buildClearCommand } from './clear.js';
import { buildExitCommand } from './exit.js';
import { buildStubCommands } from './stubs.js';
import {
  buildSkillsCommand,
  buildResearchCommand,
  buildPlanCommand,
  buildCodeReviewCommand,
} from './skills.js';
import { buildTrustCommand } from './trust.js';
import { buildSecretCommand } from './secret.js';
import { buildModelCommand, buildProviderCommand } from './model-provider.js';
import { buildConsensusCommand } from './consensus.js';
import { buildColorCommand, buildThemeCommand, buildSettingsCommand } from './color.js';
import { buildWorkflowCommand } from './workflow.js';
import { buildRewindCommand } from './rewind.js';
import { buildDiffCommand } from './diff.js';
import { buildProfileCommand } from './profile.js';
import { buildCollabCommand, buildWorktreeCommand } from './collaboration.js';
import { buildImageCommand, buildMermaidCommand, buildCostCommand, buildHotkeysCommand, buildScreenshotCommand, buildMobileCommand } from './rich-io.js';
import { buildMCPCommand, buildSkillsMarketplaceCommand, buildTelemetryCommand } from './ecosystem.js';
import { buildSuperCommand, buildAICommand, buildWorkspaceCommand, buildGenCommand } from './advanced.js';
import { buildCustomCommand, buildCyberMindCommand } from './custom-server.js';
import { buildLoginCommand, buildLogoutCommand, buildProfileCommand as buildAuthProfileCommand, buildKnowledgeCommand } from './auth.js';

export interface CommandContext {
  clear: () => void;
  exit: () => void;
  appendMessage: (m: SessionMessage) => void;
  /**
   * Submit a synthesized user prompt as if the user had typed it. Used by
   * skill shortcuts (e.g. /research, /plan) to inject a "use spawn_subagent…"
   * instruction for the main agent to act on.
   */
  submitUserPrompt?: (text: string) => void;
  /** Current session model getter + setter, for /model. */
  getModel?: () => string;
  setModel?: (model: string) => void;
  /** Current session provider getter + setter, for /provider. */
  getProvider?: () => string;
  setProvider?: (provider: string) => void;
  /** Current accent color getter + setter, for /color and profiles. */
  getColor?: () => string;
  setColor?: (color: string) => void;
  /** Active prompt accent color (e.g. cyan, magenta), for /color. */
  setPromptColor?: (color: string) => void;
  /** Navigate to a different screen (onboarding, theme, settings, welcome, chat). */
  setScreen?: (screen: string) => void;
  /** Clear login state and return to onboarding. */
  logout?: () => void;
}

export interface SlashCommandHandler {
  name: string;
  description: string;
  category:
    | 'session'
    | 'agent'
    | 'skills'
    | 'auth'
    | 'config'
    | 'safety'
    | 'collab'
    | 'cyber'
    | 'utility';
  usage?: string;
  aliases?: string[];
  hidden?: boolean;
  run: (args: string) => void;
}

export interface CommandRegistry {
  all: () => SlashCommandHandler[];
  find: (name: string) => SlashCommandHandler | undefined;
  byCategory: () => Record<string, SlashCommandHandler[]>;
}

export function buildCommandRegistry(ctx: CommandContext): CommandRegistry {
  // The registry is constructed once per session. Stub commands print
  // "coming in M<N>" until the relevant milestone wires them up.
  const commands: SlashCommandHandler[] = [
    buildHelpCommand(ctx, () => commands),
    buildClearCommand(ctx),
    buildExitCommand(ctx),
    buildSkillsCommand(ctx),
    buildResearchCommand(ctx),
    buildPlanCommand(ctx),
    buildCodeReviewCommand(ctx),
    buildTrustCommand(ctx),
    buildSecretCommand(ctx),
    buildModelCommand(ctx),
    buildProviderCommand(ctx),
    buildConsensusCommand(ctx),
    buildColorCommand(ctx),
    buildThemeCommand(ctx),
    buildSettingsCommand(ctx),
    buildWorkflowCommand(ctx),
    buildRewindCommand(ctx),
    buildDiffCommand(ctx),
    buildProfileCommand(ctx),
    buildCollabCommand(ctx),
    buildWorktreeCommand(ctx),
    buildImageCommand(ctx),
    buildMermaidCommand(ctx),
    buildCostCommand(ctx),
    buildHotkeysCommand(ctx),
    buildScreenshotCommand(ctx),
    buildMobileCommand(ctx),
    buildMCPCommand(ctx),
    buildSkillsMarketplaceCommand(ctx),
    buildTelemetryCommand(ctx),
    buildSuperCommand(ctx),
    buildAICommand(ctx),
    buildWorkspaceCommand(ctx),
    buildGenCommand(ctx),
    buildCustomCommand(ctx),
    buildCyberMindCommand(ctx),
    buildLoginCommand(ctx),
    buildLogoutCommand(ctx),
    buildAuthProfileCommand(ctx),
    buildKnowledgeCommand(ctx),
    ...buildStubCommands(ctx),
  ];

  const byName = new Map<string, SlashCommandHandler>();
  for (const c of commands) {
    byName.set(c.name, c);
    for (const alias of c.aliases ?? []) byName.set(alias, c);
  }

  return {
    all: () => commands.filter((c) => !c.hidden),
    find: (name) => byName.get(name),
    byCategory: () => {
      const out: Record<string, SlashCommandHandler[]> = {};
      for (const c of commands) {
        if (c.hidden) continue;
        (out[c.category] ??= []).push(c);
      }
      return out;
    },
  };
}
