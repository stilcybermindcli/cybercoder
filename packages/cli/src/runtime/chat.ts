import { runAgentLoop, type AgentEvent } from '@cybermind/core';
import { ProviderRouter, type ProviderId } from '@cybermind/providers';
import type { ProviderMessage } from '@cybermind/providers';
import {
  ApprovalGate,
  HeadlessApprovalUI,
  builtinTools,
  type ApprovalUI,
} from '@cybermind/tools';
import { SkillRegistry, buildSpawnSubagentTool } from '@cybermind/skills';
import type { SessionMessage } from '../state/session.js';
import { loadConfig } from '../utils/config.js';

let singletonRouter: ProviderRouter | null = null;
let singletonRegistry: SkillRegistry | null = null;

export function getRouter(): ProviderRouter {
  const config = loadConfig();
  const configKeys = config.apiKeys ?? {};
  
  const cloudApiKey = process.env.CYBERMIND_API_KEY ?? config.authToken ?? configKeys.cybermind ?? configKeys.cybermind_cloud;

  if (!singletonRouter) {
    singletonRouter = new ProviderRouter({
      preferred: defaultProviderOrder(config, configKeys),
      anthropic: { apiKey: process.env.ANTHROPIC_API_KEY ?? configKeys.anthropic },
      cloud: { 
        apiKey: cloudApiKey,
        baseURL: process.env.CYBERMIND_CLOUD_URL ?? 'https://cybercli-api.onrender.com/v1'
      },
      ollama: {
        defaultModel: config.lastModel || 'auto'
      }
    });
  }
  return singletonRouter;
}

export function getSkillRegistry(): SkillRegistry {
  if (!singletonRegistry) singletonRegistry = new SkillRegistry();
  return singletonRegistry;
}

function defaultProviderOrder(config: any, configKeys: Record<string, string>): ProviderId[] {
  const order: ProviderId[] = [];
  const cloudApiKey = process.env.CYBERMIND_API_KEY ?? config.authToken ?? configKeys.cybermind ?? configKeys.cybermind_cloud;
  
  if (cloudApiKey) {
    order.push('cybermind-cloud');
  }
  if (process.env.ANTHROPIC_API_KEY || configKeys.anthropic) {
    order.push('anthropic');
  }
  order.push('ollama');
  return order;
}

const SYSTEM_PROMPT = `You are CyberMind, a fullstack agentic coding assistant running inside a terminal.
You help with reading, editing, and running code across the user's project. Be concise,
prefer code over prose, and never invent file paths. You have access to these tools:
- read_file(path, offset?, limit?) — returns numbered lines of a file
- list_dir(path) — lists a directory
- grep(pattern, path?, include?) — ripgrep-style search
- write_file(path, content) — create a NEW file (fails on overwrite)
- edit(path, old_string, new_string, replace_all?) — surgical replacements
- run_command(command, cwd?, timeout_ms?) — PowerShell on Windows, bash on Unix
- spawn_subagent(skill, prompt) — delegate to an installed skill (research, plan,
  code-review, …) which runs in an isolated context and returns a summary
Destructive tools (write_file, edit, run_command) require user approval each turn
unless the user has granted persistent trust via /trust. Prefer spawn_subagent for
broad exploration ("research"), planning ("plan"), and reviewing diffs ("code-review")
— it produces tighter summaries and keeps your main context clean.`;

/**
 * Convert UI session messages into provider messages (drops system entries
 * the CLI uses for its own status output).
 */
export function toProviderMessages(messages: SessionMessage[]): ProviderMessage[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));
}

export interface RunChatOptions {
  model?: string;
  onEvent: (evt: AgentEvent) => void;
  signal?: AbortSignal;
  /** Caller-supplied approval UI; defaults to headless (auto-deny destructive). */
  approvalUI?: ApprovalUI;
}

/**
 * Drive one agent turn. The caller passes the conversation history (after
 * appending the latest user message) and receives events as the model streams.
 */
export async function runChat(
  history: SessionMessage[],
  opts: RunChatOptions,
): Promise<void> {
  const router = getRouter();
  const registry = getSkillRegistry();
  const providerMessages = toProviderMessages(history);
  const gate = new ApprovalGate(opts.approvalUI ?? new HeadlessApprovalUI());
  const builtins = builtinTools();

  // Bridge each built-in tool through the approval gate. Read-only tools
  // (read_file, list_dir, grep) are non-destructive and the gate auto-allows
  // them in session-bypass mode; destructive ones prompt the user.
  const wrappedBuiltins = builtins.map((t) => ({
    schema: t.schema,
    execute: async (input: Record<string, unknown>, ctx: { cwd: string }) => {
      const ok = await gate.request({
        toolName: t.schema.name,
        input,
        destructive: t.destructive,
        summary: summarizeCall(t.schema.name, input),
      });
      if (!ok) return `[user denied tool '${t.schema.name}']`;
      return t.execute(input, { cwd: ctx.cwd });
    },
  }));

  // Sub-agents need the *unwrapped* built-ins as their tool pool — the
  // sub-agent runs its own (currently no-approval) loop. Future M11 work
  // wires per-skill approval policies here.
  const spawnTool = buildSpawnSubagentTool({
    registry,
    provider: router,
    toolPool: builtins.map((t) => ({ schema: t.schema, execute: t.execute })),
  });

  const wrappedTools = [...wrappedBuiltins, spawnTool];

  for await (const evt of runAgentLoop(providerMessages, {
    provider: router,
    systemPrompt: SYSTEM_PROMPT,
    model: opts.model ?? 'auto',
    signal: opts.signal,
    tools: wrappedTools,
  })) {
    opts.onEvent(evt);
  }
}

function summarizeCall(name: string, input: Record<string, unknown>): string {
  if (name === 'run_command') return `Run: ${String(input.command ?? '')}`;
  if (name === 'write_file') return `Create file: ${String(input.path ?? '')}`;
  if (name === 'edit') return `Edit file: ${String(input.path ?? '')}`;
  if (name === 'read_file') return `Read: ${String(input.path ?? '')}`;
  if (name === 'list_dir') return `List: ${String(input.path ?? '')}`;
  if (name === 'grep') return `Grep: /${String(input.pattern ?? '')}/`;
  return `${name}(${Object.keys(input).join(', ')})`;
}
