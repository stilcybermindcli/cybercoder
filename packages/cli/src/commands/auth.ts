import { createLogger } from '@cybermind/shared';
import type { CommandContext, SlashCommandHandler } from './index.js';
import { apiClient } from '../utils/api-client.js';
import {
  setAuthToken,
  setSessionId,
  setUserProfile,
  clearLogin,
  getAuthToken,
  getUserProfile,
} from '../utils/config.js';

const log = createLogger('auth');

export function buildLoginCommand(ctx: CommandContext): SlashCommandHandler {
  return {
    name: 'login',
    description: 'Login using an API Key',
    category: 'auth',
    usage: '/login <api_key>',
    run: async (args: string) => {
      const reply = (content: string) =>
        ctx.appendMessage({
          id: `login-${Date.now()}`,
          role: 'system',
          content,
          createdAt: Date.now(),
        });

      const key = args.trim();

      if (!key) {
        reply(
          `🔐 CyberCoder Authentication Required\n\n` +
          `Usage: /login <api_key>\n\n` +
          `You can get an API key from the Web dashboard:\n` +
          `https://cybermindcli.info/settings/api-keys\n\n` +
          `Or use local models offline: /provider ollama`
        );
        return;
      }

      reply('🔐 Authenticating key with CyberMind Cloud...');

      try {
        const authInfo = await apiClient.authenticate(key);
        setAuthToken(key);
        setSessionId(authInfo.session_id);
        setUserProfile(authInfo.user);

        reply(
          `✅ Authentication Successful!\n\n` +
          `Welcome back, ${authInfo.user.name || 'Developer'}!\n` +
          `Plan: ${authInfo.user.plan?.toUpperCase() || 'FREE'}\n` +
          `Session ID: ${authInfo.session_id}\n\n` +
          `🚀 CyberCoder is now online and connected to the cloud!`
        );
      } catch (err: any) {
        reply(`✕ Authentication failed: ${err.message || String(err)}`);
      }
    },
  };
}

export function buildLogoutCommand(ctx: CommandContext): SlashCommandHandler {
  return {
    name: 'logout',
    description: 'Logout from CyberCoder and clear all session data',
    category: 'auth',
    usage: '/logout',
    run: async (args: string) => {
      void args;
      const reply = (content: string) =>
        ctx.appendMessage({
          id: `logout-${Date.now()}`,
          role: 'system',
          content,
          createdAt: Date.now(),
        });

      reply('👋 Logging out...');
      try {
        await apiClient.logout();
      } catch {
        // ignore logout errors
      }

      clearLogin();
      if (ctx.logout) {
        ctx.logout();
      }
      reply('👋 Logged out successfully. Session data cleared.');
    },
  };
}

export function buildProfileCommand(ctx: CommandContext): SlashCommandHandler {
  return {
    name: 'profile',
    description: 'View your profile and active session stats',
    category: 'auth',
    usage: '/profile',
    run: async (args: string) => {
      void args;
      const reply = (content: string) =>
        ctx.appendMessage({
          id: `profile-${Date.now()}`,
          role: 'system',
          content,
          createdAt: Date.now(),
        });

      const token = getAuthToken();
      if (!token) {
        reply('👤 Offline / Not Authenticated. Type /login to connect to the cloud.');
        return;
      }

      reply('🔍 Loading profile data from cloud...');

      try {
        const stats = await apiClient.getStats();
        const profile = getUserProfile();

        const profileLines = [
          '👤 CyberCoder Profile',
          '──────────────────────────────────',
          `📋 Account:`,
          `  • Name: ${profile.name || 'Developer'}`,
          `  • Email: ${profile.email || 'N/A'}`,
          `  • Plan: ${profile.plan?.toUpperCase() || 'FREE'}`,
          '',
          `📊 Session Usage:`,
          `  • Session ID: ${stats.current_session.id}`,
          `  • Commands Executed: ${stats.current_session.total_commands}`,
          `  • AI Interactions: ${stats.current_session.ai_interactions}`,
          `  • Session Tokens: ${stats.usage.this_session.tokens.toLocaleString()}`,
          `  • Session Cost: $${stats.usage.this_session.cost.toFixed(4)}`,
          '',
          `📉 Monthly Totals:`,
          `  • Total Requests: ${stats.usage.this_month.total_requests}`,
          `  • Total Cost: $${stats.usage.this_month.total_cost.toFixed(4)}`,
          `  • Total Commands: ${stats.usage.this_month.total_commands}`,
        ];

        reply(profileLines.join('\n'));
      } catch (err: any) {
        reply(`✕ Failed to load profile: ${err.message || String(err)}`);
      }
    },
  };
}

export function buildKnowledgeCommand(ctx: CommandContext): SlashCommandHandler {
  return {
    name: 'knowledge',
    description: 'View your AI knowledge graph context',
    category: 'utility',
    usage: '/knowledge [topic]',
    run: async (args: string) => {
      const reply = (content: string) =>
        ctx.appendMessage({
          id: `knowledge-${Date.now()}`,
          role: 'system',
          content,
          createdAt: Date.now(),
        });

      const token = getAuthToken();
      if (!token) {
        reply('🧠 Offline / Not Authenticated. Connect to cloud to sync knowledge.');
        return;
      }

      reply('🧠 Fetching knowledge graph context...');

      try {
        const context = await apiClient.getContext(args.trim());
        const lines = [
          '🧠 Your Knowledge Graph Context',
          '──────────────────────────────────',
          '📊 Learned Skills:',
          context.knowledge?.skills?.length > 0
            ? context.knowledge.skills.map((s: any) => `  • ${s.technology} (Level ${s.level})`).join('\n')
            : '  • No skills recorded yet.',
          '',
          '🏗️ Project Directories:',
          `  • Current Directory: ${context.current_session.working_directory}`,
          `  • Recent Active Directories:`,
          ...(context.recent_sessions?.map((s: any) => `    - ${s.directory} (${s.commands} cmds)`) || ['    - None']),
        ];

        reply(lines.join('\n'));
      } catch (err: any) {
        reply(`✕ Failed to load knowledge: ${err.message || String(err)}`);
      }
    },
  };
}
