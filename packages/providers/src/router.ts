import { createLogger } from '@cybermind/shared';
import { AnthropicProvider } from './anthropic.js';
import { CybermindCloudProvider } from './cybermind-cloud.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';
import { GroqProvider } from './groq.js';
import { GoogleProvider } from './google.js';
import { OpenRouterProvider } from './openrouter.js';
import type { ChatChunk, ChatRequest, LLMProvider, ProviderInfo } from './types.js';

const log = createLogger('providers:router');

export type ProviderId = ProviderInfo['id'];

export interface RouterOptions {
  /** Preferred order to try providers. First ready provider wins. */
  preferred?: ProviderId[];
  /** Always-on local fallback. Defaults to Ollama. */
  fallback?: LLMProvider;
  /** Anthropic-direct opts (BYOK). */
  anthropic?: { apiKey?: string };
  /** CyberMind cloud opts (your backend). */
  cloud?: { apiKey?: string; baseURL?: string };
  /** Ollama opts. */
  ollama?: { baseURL?: string; defaultModel?: string };
  openai?: { apiKey?: string; baseURL?: string };
  groq?: { apiKey?: string; baseURL?: string };
  google?: { apiKey?: string; baseURL?: string };
  openrouter?: { apiKey?: string; baseURL?: string };
}

/**
 * ProviderRouter selects the active provider based on configuration and falls
 * back to Ollama when the chosen provider returns an error chunk. The router
 * is itself an LLMProvider so the agent loop is unaware of fallback logic.
 */
export class ProviderRouter implements LLMProvider {
  public readonly info: ProviderInfo;

  private readonly providers = new Map<ProviderId, LLMProvider>();
  private readonly preferred: ProviderId[];
  private readonly fallback: LLMProvider;

  constructor(opts: RouterOptions = {}) {
    this.providers.set('anthropic', new AnthropicProvider(opts.anthropic));
    this.providers.set('cybermind-cloud', new CybermindCloudProvider(opts.cloud));
    this.providers.set('openai', new OpenAIProvider(opts.openai));
    this.providers.set('groq', new GroqProvider(opts.groq));
    this.providers.set('gemini', new GoogleProvider(opts.google));
    this.providers.set('openrouter', new OpenRouterProvider(opts.openrouter));
    const ollama = new OllamaProvider(opts.ollama);
    this.providers.set('ollama', ollama);

    this.fallback = opts.fallback ?? ollama;
    this.preferred = opts.preferred ?? ['cybermind-cloud', 'anthropic', 'ollama'];

    const active = this.activeProvider();
    this.info = {
      id: active.info.id,
      displayName: `Router (${active.info.displayName})`,
      requiresNetwork: active.info.requiresNetwork,
      ready: active.info.ready,
    };
  }

  /** First preferred-and-ready provider, or the fallback. */
  activeProvider(): LLMProvider {
    for (const id of this.preferred) {
      const p = this.providers.get(id);
      if (p?.info.ready) return p;
    }
    return this.fallback;
  }

  get(id: ProviderId): LLMProvider | undefined {
    return this.providers.get(id);
  }

  async listModels(): Promise<string[]> {
    return this.activeProvider().listModels();
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    const primary = this.activeProvider();
    log.debug('routing chat', { primary: primary.info.id });

    let primaryYieldedSomething = false;
    let primaryError: string | undefined;

    for await (const chunk of primary.chat(req)) {
      if (chunk.type === 'done' && chunk.reason === 'error' && !primaryYieldedSomething) {
        primaryError = chunk.error;
        break;
      }
      primaryYieldedSomething = true;
      yield chunk;
    }

    if (primaryError !== undefined && primary !== this.fallback) {
      log.warn('primary provider failed; falling back', {
        primary: primary.info.id,
        fallback: this.fallback.info.id,
        error: primaryError,
      });
      yield {
        type: 'text',
        text: `\n[router] ${primary.info.displayName} failed (${primaryError}); falling back to ${this.fallback.info.displayName}.\n`,
      };
      yield* this.fallback.chat(req);
    } else if (primaryError !== undefined) {
      yield { type: 'done', reason: 'error', error: primaryError };
    }
  }
}
