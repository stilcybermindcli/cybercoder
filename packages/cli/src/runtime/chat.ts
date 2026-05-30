import { runAgentLoop, type AgentEvent } from '@cybermind/core';
import { runGoal, runPlan } from '@cybermind/core';
import { ProviderRouter, type ProviderId } from '@cybermind/providers';
import type { ProviderMessage } from '@cybermind/providers';
import {
  ApprovalGate,
  HeadlessApprovalUI,
  builtinTools,
  WorkspaceCheckpoints,
  loadMcpTools,
  type ApprovalUI,
} from '@cybermind/tools';
import { SkillRegistry, buildSpawnSubagentTool, buildSpawnTeamTool } from '@cybermind/skills';
import type { SessionMessage } from '../state/session.js';
import { loadConfig } from '../utils/config.js';
import { getGitContext, gitContextPrompt } from '../utils/git-context.js';
import { projectMemoryPrompt } from '../utils/project-memory.js';
import { runHooks } from './hooks.js';

let singletonRouter: ProviderRouter | null = null;
let singletonRegistry: SkillRegistry | null = null;
let singletonCheckpoints: WorkspaceCheckpoints | null = null;

/** Per-process session id for grouping workspace checkpoints. */
const SESSION_ID = `sess-${Date.now().toString(36)}`;

export function getCheckpoints(): WorkspaceCheckpoints {
  if (!singletonCheckpoints) singletonCheckpoints = new WorkspaceCheckpoints(SESSION_ID);
  return singletonCheckpoints;
}

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
        baseURL: process.env.CYBERMIND_CLOUD_URL ?? 'https://cybercli-api.onrender.com'
      },
      openai: { apiKey: process.env.OPENAI_API_KEY ?? configKeys.openai },
      groq: { apiKey: process.env.GROQ_API_KEY ?? configKeys.groq },
      google: { apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? configKeys.google ?? configKeys.gemini },
      openrouter: { apiKey: process.env.OPENROUTER_API_KEY ?? configKeys.openrouter },
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
  if (process.env.OPENAI_API_KEY || configKeys.openai) {
    order.push('openai');
  }
  if (process.env.GROQ_API_KEY || configKeys.groq) {
    order.push('groq');
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || configKeys.google || configKeys.gemini) {
    order.push('gemini');
  }
  if (process.env.OPENROUTER_API_KEY || configKeys.openrouter) {
    order.push('openrouter');
  }
  order.push('ollama');
  return order;
}

const SYSTEM_PROMPT = `You are CyberMind, a fullstack agentic coding assistant running inside a terminal.
You help with reading, editing, and running code across the user's project. Be concise,
prefer code over prose, and never invent file paths. You have access to these tools:
- read_file(path, offset?, limit?) — returns numbered lines of a file
- read_many(paths[]) — read SEVERAL files in one call (use to grok a feature fast)
- list_dir(path) — lists a directory
- grep(pattern, path?, include?) — ripgrep-style search
- repo_map(path?) — compact map of the project (dirs + key symbols per file);
  call this FIRST on an unfamiliar repo to navigate efficiently
- write_file(path, content) — create a NEW file (fails on overwrite)
- edit(path, old_string, new_string, replace_all?) — surgical replacements
- run_command(command, cwd?, timeout_ms?) — PowerShell on Windows, bash on Unix
- web_search(query, max_results?) — live keyless web search (titles, urls, snippets)
- web_fetch(url, max_chars?) — fetch a page and return clean readable text
- project_memory(action, …) — self-learning project memory in .cyber/: action='read'
  to recall what's known, 'update' to save durable facts (stack, entry points,
  commands, conventions, key paths, glossary, decisions), 'note' to log a learning.
  Update it whenever you discover something durable so future sessions (or any AI)
  understand this project from .cyber/ alone.
- spawn_subagent(skill, prompt) — delegate to an installed skill (research, plan,
  code-review, …) which runs in an isolated context and returns a summary
- spawn_team(tasks[]) — run MULTIPLE sub-agents IN PARALLEL for independent
  pieces of work (e.g. research + review + plan at once), returns all results
Destructive tools (write_file, edit, run_command) require user approval each turn
unless the user has granted persistent trust via /trust. Prefer spawn_subagent for
broad exploration ("research"), planning ("plan"), and reviewing diffs ("code-review")
— it produces tighter summaries and keeps your main context clean. When a goal has
several independent parts, prefer spawn_team to do them concurrently.`;

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

/** MCP tools are loaded once per process (servers stay alive for the session). */
let mcpToolsCache: any[] | null = null;
async function getMcpTools(): Promise<any[]> {
  if (mcpToolsCache) return mcpToolsCache;
  try {
    const { tools } = await loadMcpTools();
    mcpToolsCache = tools;
  } catch {
    mcpToolsCache = [];
  }
  return mcpToolsCache;
}

/**
 * Build the full wrapped tool set (built-ins behind the approval gate, plus the
 * spawn_subagent and spawn_team orchestration tools, plus any configured MCP
 * server tools) and the git-aware system prompt. Shared by runChat/runGoalChat.
 */
async function buildAgentTools(approvalUI?: ApprovalUI): Promise<{ tools: any[]; systemPrompt: string }> {
  const router = getRouter();
  const registry = getSkillRegistry();
  const gate = new ApprovalGate(approvalUI ?? new HeadlessApprovalUI());
  const builtins = builtinTools();

  const wrappedBuiltins = builtins.map((t) => ({
    schema: t.schema,
    destructive: t.destructive,
    verify: t.verify,
    execute: async (input: Record<string, unknown>, ctx: { cwd: string }) => {
      const ok = await gate.request({
        toolName: t.schema.name,
        input,
        destructive: t.destructive,
        summary: summarizeCall(t.schema.name, input),
      });
      if (!ok) return `[user denied tool '${t.schema.name}']`;

      // preCommand hooks can block dangerous shell commands.
      if (t.schema.name === 'run_command') {
        const cmd = typeof input.command === 'string' ? input.command : '';
        const pre = runHooks('preCommand', cmd);
        if (pre.blocked) return `[blocked by preCommand hook]\n${pre.output}`;
      }

      // Snapshot the target file before any destructive file edit so /rewind
      // can restore it. (write_file/edit carry a `path`; run_command is shell.)
      if (t.destructive && (t.schema.name === 'edit' || t.schema.name === 'write_file')) {
        const target = input.path;
        if (typeof target === 'string' && target) {
          try {
            getCheckpoints().snapshot([target], `${t.schema.name} ${target}`);
          } catch {
            /* checkpointing must never block the edit */
          }
        }
      }

      const result = await t.execute(input, { cwd: ctx.cwd });

      // postEdit / postWrite / postCommand hooks (auto-format, lint, etc.).
      try {
        if (t.schema.name === 'edit') {
          const h = runHooks('postEdit', String(input.path ?? ''));
          if (h.output) return `${result}\n${h.output}`;
        } else if (t.schema.name === 'write_file') {
          const h = runHooks('postWrite', String(input.path ?? ''));
          if (h.output) return `${result}\n${h.output}`;
        } else if (t.schema.name === 'run_command') {
          const h = runHooks('postCommand', String(input.command ?? ''));
          if (h.output) return `${result}\n${h.output}`;
        }
      } catch {
        /* hooks must never break the tool result */
      }
      return result;
    },
  }));

  const toolPool = builtins.map((t) => ({ schema: t.schema, execute: t.execute, destructive: t.destructive, verify: t.verify }));
  const spawnTool = buildSpawnSubagentTool({ registry, provider: router, toolPool });
  const teamTool = buildSpawnTeamTool({ registry, provider: router, toolPool, concurrency: 3 });

  // MCP server tools, each gated through approval (they can do anything).
  const mcpRaw = await getMcpTools();
  const mcpWrapped = mcpRaw.map((t: any) => ({
    schema: t.schema,
    destructive: t.destructive,
    execute: async (input: Record<string, unknown>, ctx: { cwd: string }) => {
      const ok = await gate.request({
        toolName: t.schema.name,
        input,
        destructive: t.destructive,
        summary: `MCP: ${t.schema.name}`,
      });
      if (!ok) return `[user denied tool '${t.schema.name}']`;
      return t.execute(input, ctx);
    },
  }));

  const gitBlock = gitContextPrompt(getGitContext());
  const memoryBlock = projectMemoryPrompt();
  const systemPrompt = [SYSTEM_PROMPT, memoryBlock, gitBlock].filter(Boolean).join('\n\n');

  return { tools: [...wrappedBuiltins, spawnTool, teamTool, ...mcpWrapped], systemPrompt };
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
  const providerMessages = toProviderMessages(history);
  const { tools, systemPrompt } = await buildAgentTools(opts.approvalUI);

  for await (const evt of runAgentLoop(providerMessages, {
    provider: router,
    systemPrompt,
    model: opts.model ?? 'auto',
    signal: opts.signal,
    tools,
  })) {
    opts.onEvent(evt);
  }
}

/**
 * Goal-driven run: keep working across rounds until the goal is met or the
 * round cap is hit. Powers the `/goal` command.
 */
export async function runGoalChat(
  history: SessionMessage[],
  opts: RunChatOptions & { maxRounds?: number },
): Promise<void> {
  const router = getRouter();
  const providerMessages = toProviderMessages(history);
  const { tools, systemPrompt } = await buildAgentTools(opts.approvalUI);

  for await (const evt of runGoal(providerMessages, {
    provider: router,
    systemPrompt,
    model: opts.model ?? 'auto',
    signal: opts.signal,
    tools,
    maxRounds: opts.maxRounds ?? 8,
    onEvent: opts.onEvent,
  })) {
    opts.onEvent(evt);
  }
}

/**
 * Read-only planning pass: produces an ordered task list grounded in the repo.
 * Powers the `/plan` command in real (not a synthesized prompt).
 */
export async function runPlanChat(
  history: SessionMessage[],
  opts: RunChatOptions,
): Promise<{ plan: string; steps: string[] }> {
  const router = getRouter();
  const providerMessages = toProviderMessages(history);
  const { tools } = await buildAgentTools(opts.approvalUI);

  return runPlan(providerMessages, {
    provider: router,
    model: opts.model ?? 'auto',
    tools,
    signal: opts.signal,
    onEvent: opts.onEvent,
  });
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
