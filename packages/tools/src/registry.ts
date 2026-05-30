import { readFileTool } from './builtin/read-file.js';
import { readManyTool } from './builtin/read-many.js';
import { writeFileTool } from './builtin/write-file.js';
import { editTool } from './builtin/edit.js';
import { listDirTool } from './builtin/list-dir.js';
import { grepTool } from './builtin/grep.js';
import { repoMapTool } from './builtin/repo-map.js';
import { runCommandTool } from './builtin/run-command.js';
import { webSearchTool } from './builtin/web-search.js';
import { webFetchTool } from './builtin/web-fetch.js';
import { projectMemoryTool } from './builtin/project-memory-tool.js';
import type { AgentTool } from './core-types.js';

/**
 * The set of built-in tools every CyberCoder session starts with. Skills can
 * register additional tools at runtime. Order matters for /help listing.
 * Includes live web research (web_search/web_fetch) — a capability Claude Code
 * lacks natively in the CLI — and project_memory (self-learning .cyber/ store).
 */
export function builtinTools(): AgentTool[] {
  return [
    readFileTool,
    readManyTool,
    writeFileTool,
    editTool,
    listDirTool,
    grepTool,
    repoMapTool,
    runCommandTool,
    webSearchTool,
    webFetchTool,
    projectMemoryTool,
  ];
}

export function findTool(name: string): AgentTool | undefined {
  return builtinTools().find((t) => t.schema.name === name);
}
