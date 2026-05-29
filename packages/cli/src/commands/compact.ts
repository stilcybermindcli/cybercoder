import { getRouter } from '../runtime/chat.js';
import type { CommandContext, SlashCommandHandler } from './index.js';

export function buildCompactCommand(ctx: CommandContext): SlashCommandHandler {
  return {
    name: 'compact',
    description: 'Compress conversation history to free context window.',
    category: 'session',
    usage: '/compact [focus_topic]',
    run: async (args: string) => {
      const focus = args.trim();
      const reply = (content: string) => {
        ctx.appendMessage({
          id: `compact-${Date.now()}`,
          role: 'system',
          content,
          createdAt: Date.now(),
        });
      };

      const getMessages = ctx.getMessages;
      const setMessages = ctx.setMessages;

      if (!getMessages || !setMessages) {
        reply('⚠️ Compaction is not supported in this environment.');
        return;
      }

      const history = getMessages();
      // Only keep user and assistant messages for summarization
      const chatHistory = history.filter((m) => m.role === 'user' || m.role === 'assistant');

      if (chatHistory.length < 3) {
        reply('ℹ️ Message history is too brief to require compaction.');
        return;
      }

      reply('⣾ Compressing conversation history via active provider...');

      const chatText = chatHistory
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n');

      const systemPrompt = `You are a conversation compaction assistant. Your task is to summarize the preceding developer-assistant chat log into a single, dense, bulleted summary.
Specify what files have been read/edited, what build/test commands were run, and what tasks remain.
${focus ? `Focus particularly on: ${focus}` : ''}
Keep the summary under 200 words. Do not introduce yourself or add pleasantries. Start immediately with the bulleted list.`;

      try {
        const router = getRouter();
        let summary = '';

        // Call active provider
        const chunks = router.chat({
          model: 'auto',
          messages: [{ role: 'user', content: chatText }],
          systemPrompt,
          temperature: 0.3,
        });

        for await (const chunk of chunks) {
          if (chunk.type === 'text') {
            summary += chunk.text;
          } else if (chunk.type === 'done' && chunk.reason === 'error') {
            throw new Error(chunk.error ?? 'Unknown model error');
          }
        }

        if (!summary) {
          throw new Error('Empty summary returned');
        }

        // Replace history with the compacted message
        const compactedMessage = {
          id: `compact-summary-${Date.now()}`,
          role: 'system' as const,
          content: `[Conversation compacted to free context window]\n\n**Progress summary so far**:\n${summary.trim()}`,
          createdAt: Date.now(),
        };

        setMessages([compactedMessage]);
        reply('✨ History successfully compacted!');
      } catch (err) {
        reply(`❌ Failed to compact history: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}
