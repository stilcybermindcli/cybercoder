import { AnthropicProvider, type AnthropicProviderOptions } from './anthropic.js';
import type { ProviderInfo } from './types.js';

const DEFAULT_BASE_URL = process.env.CYBERMIND_CLOUD_URL ?? 'https://cybercli-api.onrender.com/v1';

/**
 * `cybermind-cloud` provider talks to your own backend (`cybermindcli.info`)
 * which exposes an Anthropic-compatible `/v1/messages` endpoint. This means
 * we can reuse the AnthropicProvider implementation and just override the
 * baseURL + auth header.
 *
 * The backend forwards to the user's chosen model — including your hosted
 * models (e.g. `minimax-m2.5-free`) — and bills against the user's account.
 */
export class CybermindCloudProvider extends AnthropicProvider {
  public override readonly info: ProviderInfo;

  constructor(opts: AnthropicProviderOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.CYBERMIND_API_KEY;
    super({
      apiKey,
      baseURL: opts.baseURL ?? DEFAULT_BASE_URL,
      defaultModel: opts.defaultModel ?? 'cybermind-default',
    });
    this.info = {
      id: 'cybermind-cloud',
      displayName: 'CyberMind Cloud',
      requiresNetwork: true,
      ready: Boolean(apiKey),
    };
  }
}
