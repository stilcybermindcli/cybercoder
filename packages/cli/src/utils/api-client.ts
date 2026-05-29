import { loadConfig, getAuthToken, getSessionId } from './config.js';
import { os, hostname } from 'node:os';

const BACKEND_URL = process.env.CYBERMIND_CLOUD_URL ?? 'https://cybercli-api.onrender.com/api/v1';

interface AuthResponse {
  success: boolean;
  session_id: string;
  user: {
    id: string;
    email?: string;
    name?: string;
    plan?: string;
  };
  quota: any;
  expires_at: string;
}

interface StatsResponse {
  current_session: {
    id: string;
    started_at: string;
    total_commands: number;
    ai_interactions: number;
    status: string;
  };
  usage: {
    quota: any;
    this_session: {
      tokens: number;
      cost: number;
      commands: number;
    };
    today: any;
    this_month: {
      total_requests: number;
      total_cost: number;
      total_commands: number;
    };
  };
}

class ApiClient {
  private getHeaders(): Record<string, string> {
    const token = getAuthToken();
    const sessionId = getSessionId();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (sessionId) {
      headers['x-cli-session'] = sessionId;
    }
    return headers;
  }

  async authenticate(apiKey: string): Promise<AuthResponse> {
    const machineId = process.env.COMPUTERNAME || process.env.HOSTNAME || hostname() || 'unknown-mac';
    const osType = process.platform;
    const shellType = process.env.SHELL || process.env.COMSPEC || 'unknown-shell';
    const currentCwd = process.cwd();

    const response = await fetch(`${BACKEND_URL}/cli/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        machine_id: machineId,
        machine_name: hostname(),
        os: osType,
        shell: shellType,
        cwd: currentCwd,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Authentication failed' }));
      throw new Error(err.error || 'Authentication failed');
    }

    return response.json() as Promise<AuthResponse>;
  }

  async refreshSession(): Promise<any> {
    const response = await fetch(`${BACKEND_URL}/cli/auth/refresh`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to refresh session');
    }
    return response.json();
  }

  async logout(): Promise<any> {
    const response = await fetch(`${BACKEND_URL}/cli/auth/logout`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to logout');
    }
    return response.json();
  }

  async getModels(): Promise<any> {
    const response = await fetch(`${BACKEND_URL}/cli/models`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch models');
    }
    return response.json();
  }

  async getStats(): Promise<StatsResponse> {
    const response = await fetch(`${BACKEND_URL}/cli/stats`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch stats');
    }
    return response.json() as Promise<StatsResponse>;
  }

  async getContext(prompt: string): Promise<any> {
    const response = await fetch(`${BACKEND_URL}/cli/context?prompt=${encodeURIComponent(prompt)}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch context');
    }
    return response.json();
  }

  async updateContext(technologies: string[], codeQuality: number, patternsDetected: string[]): Promise<any> {
    const response = await fetch(`${BACKEND_URL}/cli/context/update`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        technologies,
        code_quality: codeQuality,
        patterns_detected: patternsDetected,
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to update context');
    }
    return response.json();
  }

  async trackCommand(command: string, args: string, cwd: string, exitCode: number, outputPreview: string, durationMs: number): Promise<any> {
    const response = await fetch(`${BACKEND_URL}/cli/track/command`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        command,
        args,
        cwd,
        exit_code: exitCode,
        output_preview: outputPreview,
        duration_ms: durationMs,
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to track command');
    }
    return response.json();
  }

  async *streamCompletion(payload: {
    prompt?: string;
    messages?: Array<{ role: string; content: string }>;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    system?: string;
  }): AsyncGenerator<{ content: string; model?: string }> {
    const response = await fetch(`${BACKEND_URL}/cli/complete`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        ...payload,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Streaming failed: ${response.status} ${errText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(dataStr);
            yield parsed;
          } catch {
            // ignore JSON parse error on incomplete chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export const apiClient = new ApiClient();
