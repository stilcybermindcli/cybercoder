import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentTool } from '../types.js';

/**
 * `project_memory` — lets the agent persist what it learns about THIS project
 * into a `.cyber/` folder so future sessions (or any other AI) understand the
 * project by reading `.cyber/` alone. Self-learning, compounding context.
 *
 * Actions:
 *   - read:   return the current project.json + memory.md
 *   - update: merge structured facts into project.json (arrays are unioned)
 *   - note:   append a free-form learning/decision to memory.md
 *
 * Writing into a dedicated `.cyber/` folder is low-risk (it never touches the
 * user's source), so this tool is non-destructive and runs without approval.
 */

const CYBER_DIR = '.cyber';

interface ProjectMemory {
  version: number;
  name?: string;
  summary?: string;
  stack?: string[];
  entryPoints?: string[];
  commands?: Record<string, string>;
  conventions?: string[];
  importantPaths?: Array<{ path: string; note: string }>;
  glossary?: Array<{ term: string; meaning: string }>;
  decisions?: string[];
  createdAt?: string;
  updatedAt?: string;
}

const DEFAULTS: ProjectMemory = {
  version: 1, stack: [], entryPoints: [], commands: {}, conventions: [],
  importantPaths: [], glossary: [], decisions: [],
};

function p(cwd: string, ...parts: string[]) { return join(cwd, CYBER_DIR, ...parts); }
function ensureDir(cwd: string) { const d = join(cwd, CYBER_DIR); if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

function read(cwd: string): ProjectMemory | null {
  const f = p(cwd, 'project.json');
  if (!existsSync(f)) return null;
  try { return { ...DEFAULTS, ...(JSON.parse(readFileSync(f, 'utf8')) as ProjectMemory) }; } catch { return null; }
}
function readNotes(cwd: string): string {
  const f = p(cwd, 'memory.md');
  if (!existsSync(f)) return '';
  try { return readFileSync(f, 'utf8'); } catch { return ''; }
}

function mergeArr<T>(a: T[] | undefined, b: T[] | undefined): T[] {
  const seen = new Set<string>(); const out: T[] = [];
  for (const item of [...(a ?? []), ...(b ?? [])]) {
    const k = typeof item === 'string' ? item : JSON.stringify(item);
    if (!seen.has(k)) { seen.add(k); out.push(item); }
  }
  return out;
}

export const projectMemoryTool: AgentTool = {
  schema: {
    name: 'project_memory',
    description:
      "Persist or read self-learning project memory in the .cyber/ folder so future sessions understand this project from .cyber/ alone. Use action='read' to recall, 'update' to save structured facts (stack, entryPoints, commands, conventions, importantPaths, glossary, decisions, name, summary), and 'note' to append a free-form learning. Call 'update'/'note' whenever you discover something durable about the project.",
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read', 'update', 'note'], description: 'read | update | note' },
        name: { type: 'string' },
        summary: { type: 'string' },
        stack: { type: 'array', items: { type: 'string' } },
        entryPoints: { type: 'array', items: { type: 'string' } },
        commands: { type: 'object', description: 'map of label -> shell command, e.g. {"build":"npm run build"}' },
        conventions: { type: 'array', items: { type: 'string' } },
        importantPaths: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, note: { type: 'string' } } } },
        glossary: { type: 'array', items: { type: 'object', properties: { term: { type: 'string' }, meaning: { type: 'string' } } } },
        decisions: { type: 'array', items: { type: 'string' } },
        note: { type: 'string', description: "For action='note': the learning to append." },
      },
      required: ['action'],
    },
  },
  destructive: false,
  async execute(input, ctx) {
    const cwd = ctx.cwd;
    const action = String(input.action ?? 'read');

    if (action === 'read') {
      const mem = read(cwd);
      const notes = readNotes(cwd);
      if (!mem && !notes) return 'No .cyber/ project memory yet. Use action="update"/"note" to start one.';
      return JSON.stringify({ project: mem, notes }, null, 2);
    }

    if (action === 'note') {
      const note = String(input.note ?? '').trim();
      if (!note) return 'Provide a non-empty `note`.';
      ensureDir(cwd);
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const prev = readNotes(cwd) || '# Project Memory Log\n';
      writeFileSync(p(cwd, 'memory.md'), `${prev}\n- [${stamp}] ${note}\n`, 'utf8');
      return `Recorded learning to .cyber/memory.md`;
    }

    // update
    ensureDir(cwd);
    const now = new Date().toISOString();
    const current = read(cwd) ?? { ...DEFAULTS, createdAt: now };
    const patch = input as Partial<ProjectMemory>;
    const next: ProjectMemory = {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      version: 1,
      stack: mergeArr(current.stack, patch.stack),
      entryPoints: mergeArr(current.entryPoints, patch.entryPoints),
      conventions: mergeArr(current.conventions, patch.conventions),
      decisions: mergeArr(current.decisions, patch.decisions),
      importantPaths: mergeArr(current.importantPaths, patch.importantPaths),
      glossary: mergeArr(current.glossary, patch.glossary),
      commands: { ...(current.commands ?? {}), ...(patch.commands ?? {}) },
      createdAt: current.createdAt ?? now,
      updatedAt: now,
    };
    writeFileSync(p(cwd, 'project.json'), JSON.stringify(next, null, 2), 'utf8');

    // Drop a README pointer the first time so other agents know the contract.
    const readme = p(cwd, 'README.md');
    if (!existsSync(readme)) {
      writeFileSync(readme, '# .cyber — Project Memory\n\nRead this folder first to understand the project. `project.json` = structured facts; `memory.md` = learnings log. Maintained by CyberCoder.\n', 'utf8');
    }
    return `Updated .cyber/project.json (${Object.keys(patch).filter((k) => k !== 'action').join(', ') || 'no fields'}).`;
  },
};

/** True when a `.cyber/` memory folder exists in cwd. */
export function hasCyberMemory(cwd: string = process.cwd()): boolean {
  try { return statSync(join(cwd, CYBER_DIR)).isDirectory(); } catch { return false; }
}
