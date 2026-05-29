import { z } from 'zod';

/**
 * Provider-agnostic message format. Tools mirror the Anthropic shape because
 * it is the most expressive (content blocks); we down-convert for OpenAI/Ollama.
 */
export const ProviderRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type ProviderRole = z.infer<typeof ProviderRoleSchema>;

export interface ProviderToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ProviderMessage {
  role: ProviderRole;
  content: string;
  /** When role === 'assistant', the model may emit tool calls alongside text. */
  toolCalls?: ProviderToolCall[];
  /** When role === 'tool', this references the tool call id we are responding to. */
  toolCallId?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON schema for the tool's input. */
  inputSchema: Record<string, unknown>;
}

export interface ChatRequest {
  model: string;
  messages: ProviderMessage[];
  systemPrompt?: string;
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  /** Abort the underlying HTTP request. */
  signal?: AbortSignal;
}

export type ChatChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCall: ProviderToolCall }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'done'; reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop' | 'error'; error?: string };

export interface ProviderInfo {
  id: 'anthropic' | 'openai' | 'gemini' | 'cybermind-cloud' | 'ollama' | 'groq' | 'openrouter';
  displayName: string;
  /** True if this provider needs internet access. */
  requiresNetwork: boolean;
  /** True when the provider is configured (key present, server reachable, etc.). */
  ready: boolean;
}

export interface LLMProvider {
  readonly info: ProviderInfo;
  listModels(): Promise<string[]>;
  /**
   * Stream a chat completion. Implementations should yield text chunks as the
   * model produces them, then yield zero or more tool_call chunks, then a
   * final 'done' chunk.
   */
  chat(req: ChatRequest): AsyncIterable<ChatChunk>;
}
