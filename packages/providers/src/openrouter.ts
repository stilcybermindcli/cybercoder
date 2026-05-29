import { OpenAIProvider, type OpenAIProviderOptions } from './openai.js';

export class OpenRouterProvider extends OpenAIProvider {
  constructor(opts: OpenAIProviderOptions = {}) {
    super(
      {
        apiKey: opts.apiKey ?? process.env.OPENROUTER_API_KEY,
        baseURL: opts.baseURL ?? 'https://openrouter.ai/api/v1',
        defaultModel: opts.defaultModel ?? 'google/gemini-2.5-flash',
      },
      'openrouter',
      'OpenRouter'
    );
  }

  override async listModels(): Promise<string[]> {
    return [
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-r1-distill-llama-70b',
      'anthropic/claude-3.5-sonnet',
    ];
  }
}
