import { OpenAIProvider, type OpenAIProviderOptions } from './openai.js';

export class GroqProvider extends OpenAIProvider {
  constructor(opts: OpenAIProviderOptions = {}) {
    super(
      {
        apiKey: opts.apiKey ?? process.env.GROQ_API_KEY,
        baseURL: opts.baseURL ?? 'https://api.groq.com/openai/v1',
        defaultModel: opts.defaultModel ?? 'llama-3.3-70b-versatile',
      },
      'groq',
      'Groq'
    );
  }

  override async listModels(): Promise<string[]> {
    return ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
  }
}
