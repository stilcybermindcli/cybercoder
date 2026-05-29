import { apiClient } from '../utils/api-client.js';
import type { CommandContext, SlashCommandHandler } from './index.js';

export function buildUsageCommand(ctx: CommandContext): SlashCommandHandler {
  return {
    name: 'usage',
    description: 'Show live API usage stats from the backend.',
    category: 'auth',
    usage: '/usage',
    run: async () => {
      const reply = (content: string) => {
        ctx.appendMessage({
          id: `usage-${Date.now()}`,
          role: 'system',
          content,
          createdAt: Date.now(),
        });
      };

      reply('⣾ Querying usage statistics from backend...');

      try {
        const stats = await apiClient.getStats();
        
        const lines = [
          '╭─── CyberCoder Usage Statistics ─────────────────────────────╮',
          `│  Session ID: ${stats.current_session.id.slice(0, 12)}…                   │`,
          `│  Session Started: ${new Date(stats.current_session.started_at).toLocaleTimeString()}                           │`,
          '│                                                             │',
          '│  This Session:                                              │',
          `│    - Commands executed: ${stats.usage.this_session.commands}                                   │`,
          `│    - Tokens consumed: ${stats.usage.this_session.tokens.toLocaleString()}                               │`,
          `│    - Session Cost: $${stats.usage.this_session.cost.toFixed(4)}                                │`,
          '│                                                             │',
          '│  This Month:                                                │',
          `│    - Total requests: ${stats.usage.this_month.total_requests}                                   │`,
          `│    - Total commands: ${stats.usage.this_month.total_commands}                                   │`,
          `│    - Total cost: $${stats.usage.this_month.total_cost.toFixed(4)}                                    │`,
          '╰─────────────────────────────────────────────────────────────╯',
        ];

        reply(lines.join('\n'));
      } catch (err) {
        reply(`❌ Failed to retrieve usage statistics: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}
