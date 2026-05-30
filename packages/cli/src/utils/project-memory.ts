import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `.cyber/` — self-learning project memory.
 *
 * The goal: any agent (a fresh CyberCoder session, a brand-new account, or even
 * a different AI) can understand THIS project end-to-end by reading ONLY the
 * `.cyber/` folder. CyberCoder writes what it learns here as it works, so the
 * understanding compounds over time instead of being re-derived every session.
 *
 * Layout:
 *   .cyber/project.json   — structured facts (name, stack, entry points,
 *                           commands, conventions, important paths, glossary)
 *   .cyber/memory.md      — free-form learnings/decisions log (append-only-ish)
 *   .cyber/README.md      — human/agent pointer explaining the contract
 *
 * Nothing here is destructive to the user's code; it lives in its own folder.
 */

export const CYBER_DIR = '.cyber';

export interface ProjectMemory {
  /** Schema version so future CyberCoder versions can migrate safely. */
  version: number;
  name?: string;
  summary?: string;
  /** e.g. ["React 19", "Vite", "Node/Express", "MongoDB"]. */
  stack?: string[];
  /** Entry points the agent should read first. */
  entryPoints?: string[];
  /** How to build / test / run / lint this project. */
  commands?: Record<string, string>;
  /** Project conventions the agent must follow (style, patterns, do/don't). */
  conventions?: string[];
  /** Important paths with a one-line note each. */
  importantPaths?: Array<{ path: string; note: string }>;
  /** Domain glossary so the agent speaks the project's language. */
  glossary?: Array<{ term: string; meaning: string }>;
  /** Architecture / key decisions captured over time. */
  decisions?: string[];
  /** ISO timestamps. */
  createdAt?: string;
  updatedAt?: string;
}

function cyberPath(cwd: string, ...parts: string[]): string {
  return join(cwd, CYBER_DIR, ...parts);
}

export function cyberDirExists(cwd: string = process.cwd()): boolean {
  try {
    return statSync(join(cwd, CYBER_DIR)).isDirectory();
  } catch {
    return false;
  }
}

const DEFAULT_MEMORY: ProjectMemory = {
  version: 1,
  stack: [],
  entryPoints: [],
  commands: {},
  conventions: [],
  importantPaths: [],
  glossary: [],
  decisions: [],
};

export function readProjectMemory(cwd: string = process.cwd()): ProjectMemory | null {
  const file = cyberPath(cwd, 'project.json');
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as ProjectMemory;
    return { ...DEFAULT_MEMORY, ...parsed };
  } catch {
    return null;
  }
}

export function readProjectMemoryNotes(cwd: string = process.cwd()): string {
  const file = cyberPath(cwd, 'memory.md');
  if (!existsSync(file)) return '';
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function ensureCyberDir(cwd: string) {
  const dir = join(cwd, CYBER_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const README = `# .cyber — Project Memory

This folder is CyberCoder's self-learning memory for **this** project.

**Contract:** To understand this project, an AI agent should read THIS folder
first. \`project.json\` holds structured facts (stack, entry points, commands,
conventions). \`memory.md\` is a running log of learnings and decisions.

CyberCoder maintains these files automatically as it works. You can edit them
by hand too — they're plain JSON/Markdown. Safe to commit to version control so
the whole team (and future sessions) share the same understanding.
`;

export function initProjectMemory(cwd: string = process.cwd(), seed?: Partial<ProjectMemory>): ProjectMemory {
  ensureCyberDir(cwd);
  const now = new Date().toISOString();
  const existing = readProjectMemory(cwd);
  const memory: ProjectMemory = {
    ...DEFAULT_MEMORY,
    ...existing,
    ...seed,
    version: 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeFileSync(cyberPath(cwd, 'project.json'), JSON.stringify(memory, null, 2), 'utf8');
  if (!existsSync(cyberPath(cwd, 'README.md'))) {
    writeFileSync(cyberPath(cwd, 'README.md'), README, 'utf8');
  }
  if (!existsSync(cyberPath(cwd, 'memory.md'))) {
    writeFileSync(cyberPath(cwd, 'memory.md'), `# Project Memory Log\n\n_CyberCoder records learnings and decisions here as it works._\n`, 'utf8');
  }
  return memory;
}

/** Merge a partial update into project.json (arrays are unioned, not replaced). */
export function updateProjectMemory(patch: Partial<ProjectMemory>, cwd: string = process.cwd()): ProjectMemory {
  ensureCyberDir(cwd);
  const current = readProjectMemory(cwd) ?? initProjectMemory(cwd);

  const mergeArr = <T,>(a: T[] | undefined, b: T[] | undefined): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of [...(a ?? []), ...(b ?? [])]) {
      const key = typeof item === 'string' ? item : JSON.stringify(item);
      if (!seen.has(key)) { seen.add(key); out.push(item); }
    }
    return out;
  };

  const next: ProjectMemory = {
    ...current,
    ...patch,
    version: 1,
    stack: mergeArr(current.stack, patch.stack),
    entryPoints: mergeArr(current.entryPoints, patch.entryPoints),
    conventions: mergeArr(current.conventions, patch.conventions),
    decisions: mergeArr(current.decisions, patch.decisions),
    importantPaths: mergeArr(current.importantPaths, patch.importantPaths),
    glossary: mergeArr(current.glossary, patch.glossary),
    commands: { ...(current.commands ?? {}), ...(patch.commands ?? {}) },
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(cyberPath(cwd, 'project.json'), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/** Append a free-form learning to memory.md with a timestamp. */
export function appendProjectNote(note: string, cwd: string = process.cwd()): void {
  ensureCyberDir(cwd);
  const file = cyberPath(cwd, 'memory.md');
  const header = existsSync(file) ? '' : `# Project Memory Log\n\n`;
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  writeFileSync(file, `${header}${readProjectMemoryNotes(cwd)}\n- [${stamp}] ${note.trim()}\n`, 'utf8');
}

/**
 * Render the project memory as a compact system-prompt block so every session
 * starts already knowing the project. Truncated to stay token-friendly.
 */
export function projectMemoryPrompt(cwd: string = process.cwd()): string {
  const mem = readProjectMemory(cwd);
  const notes = readProjectMemoryNotes(cwd);
  if (!mem && !notes) return '';

  const parts: string[] = ['[Project memory — .cyber/ (read this to understand the project)]'];
  if (mem?.name) parts.push(`name: ${mem.name}`);
  if (mem?.summary) parts.push(`summary: ${mem.summary}`);
  if (mem?.stack?.length) parts.push(`stack: ${mem.stack.join(', ')}`);
  if (mem?.entryPoints?.length) parts.push(`entry points: ${mem.entryPoints.join(', ')}`);
  if (mem?.commands && Object.keys(mem.commands).length) {
    parts.push(`commands: ${Object.entries(mem.commands).map(([k, v]) => `${k}=\`${v}\``).join(', ')}`);
  }
  if (mem?.conventions?.length) parts.push(`conventions: ${mem.conventions.slice(0, 8).join('; ')}`);
  if (mem?.importantPaths?.length) {
    parts.push(`key paths: ${mem.importantPaths.slice(0, 8).map((p) => `${p.path} (${p.note})`).join('; ')}`);
  }
  if (mem?.glossary?.length) {
    parts.push(`glossary: ${mem.glossary.slice(0, 8).map((g) => `${g.term}=${g.meaning}`).join('; ')}`);
  }
  if (mem?.decisions?.length) parts.push(`decisions: ${mem.decisions.slice(0, 6).join('; ')}`);

  let block = parts.join('\n');
  if (notes) {
    const trimmedNotes = notes.length > 2000 ? notes.slice(notes.length - 2000) : notes;
    block += `\n\n[Recent learnings — .cyber/memory.md]\n${trimmedNotes.trim()}`;
  }
  return block.length > 6000 ? block.slice(0, 6000) + '\n…[memory truncated]' : block;
}
