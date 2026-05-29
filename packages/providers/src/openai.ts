import { createLogger } from '@cybermind/shared';
import type {
  ChatChunk,
  ChatRequest,
  LLMProvider,
  ProviderInfo,
  ProviderMessage,
  ToolSchema,
} from './types.js';

const log = createLogger('providers:openai');

export interface OpenAIProviderOptions {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
}

export class OpenAIProvider implements LLMProvider {
  public readonly info: ProviderInfo;
  protected readonly apiKey: string;
  protected readonly baseURL: string;
  protected readonly defaultModel: string;

  constructor(opts: OpenAIProviderOptions = {}, providerId: ProviderInfo['id'] = 'openai', displayName = 'OpenAI') {
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.baseURL = opts.baseURL ?? 'https://api.openai.com/v1';
    this.defaultModel = opts.defaultModel ?? 'gpt-4o-mini';
    this.info = {
      id: providerId,
      displayName,
      requiresNetwork: true,
      ready: Boolean(this.apiKey),
    };
  }

  async listModels(): Promise<string[]> {
    return ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o1-preview'];
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    const model = req.model && req.model !== 'auto' ? req.model : this.defaultModel;
    log.debug('openai chat', { model, messages: req.messages.length });

    const messages = [
      ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
      ...req.messages.map(toOpenAIMessage),
    ];

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
      stream_options: { include_usage: true },
    };

    if (req.tools?.length) {
      body.tools = req.tools.map(toOpenAITool);
    }

    try {
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: req.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        yield {
          type: 'done',
          reason: 'error',
          error: `OpenAI HTTP ${res.status}: ${errText}`,
        };
        return;
      }

      if (!res.body) {
        yield { type: 'done', reason: 'error', error: 'Response body is null' };
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      // Map to accumulate streaming tool calls
      const toolCallsMap = new Map<number, { id?: string; name?: string; arguments: string }>();
      let usageInfo: { prompt_tokens: number; completion_tokens: number } | null = null;

      while (!done) {
        const { value, done: chunkDone } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed === 'data: [DONE]') {
              done = true;
              break;
            }
            if (trimmed.startsWith('data: ')) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                
                // Track usage if present
                if (json.usage) {
                  usageInfo = json.usage;
                }

                const choice = json.choices?.[0];
                if (!choice) continue;

                if (choice.delta?.content) {
                  yield { type: 'text', text: choice.delta.content };
                }

                if (choice.delta?.tool_calls) {
                  for (const tcDelta of choice.delta.tool_calls) {
                    const idx = tcDelta.index ?? 0;
                    let tc = toolCallsMap.get(idx);
                    if (!tc) {
                      tc = { id: tcDelta.id, name: tcDelta.function?.name, arguments: '' };
                      toolCallsMap.set(idx, tc);
                    }
                    if (tcDelta.id) tc.id = tcDelta.id;
                    if (tcDelta.function?.name) tc.name = tcDelta.function.name;
                    if (tcDelta.function?.arguments) tc.arguments += tcDelta.function.arguments;
                  }
                }
              } catch (err) {
                // Ignore json parsing issues on partial lines
              }
            }
          }
        }
        if (chunkDone) done = true;
      }

      // Emit accumulated tool calls
      for (const [, tc] of toolCallsMap) {
        if (tc.id && tc.name) {
          let parsedArgs = {};
          try {
            parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
          } catch (e) {
            log.warn('Failed to parse tool arguments JSON', tc.arguments);
          }
          yield {
            type: 'tool_call',
            toolCall: {
              id: tc.id,
              name: tc.name,
              input: parsedArgs,
            },
          };
        }
      }

      // Emit usage if present
      if (usageInfo) {
        yield {
          type: 'usage',
          inputTokens: usageInfo.prompt_tokens,
          outputTokens: usageInfo.completion_tokens,
        };
      }

      yield { type: 'done', reason: toolCallsMap.size > 0 ? 'tool_use' : 'end_turn' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('openai stream failed', msg);
      yield { type: 'done', reason: 'error', error: msg };
    }
  }
}

function toOpenAIMessage(m: ProviderMessage) {
  if (m.role === 'tool') {
    return {
      role: 'tool',
      content: m.content,
      tool_call_id: m.toolCallId,
    };
  }
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content || null,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.input),
        },
      })),
    };
  }
  return {
    role: m.role,
    content: m.content,
  };
}

function toOpenAITool(t: ToolSchema) {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  };
}
