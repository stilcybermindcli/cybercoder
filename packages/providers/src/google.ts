import { OpenAIProvider, type OpenAIProviderOptions } from './openai.js';

export class GoogleProvider extends OpenAIProvider {
  constructor(opts: OpenAIProviderOptions = {}) {
    super(
      {
        apiKey: opts.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
        baseURL: opts.baseURL ?? 'https://generativelanguage.googleapis.com/v1beta/openai',
        defaultModel: opts.defaultModel ?? 'gemini-2.5-flash',
      },
      'gemini',
      'Google Gemini'
    );
  }

  override async listModels(): Promise<string[]> {
    return ['gemini-2.5-flash', 'gemini-2.5-pro'];
  }
}
