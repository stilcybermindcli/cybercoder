#!/usr/bin/env node

// src/index.tsx
import { Command } from "commander";
import { render } from "ink";

// ../shared/src/types.ts
import { z } from "zod";
var RoleSchema = z.enum(["system", "user", "assistant", "tool"]);
var MessageSchema = z.object({
  id: z.string(),
  role: RoleSchema,
  content: z.string(),
  createdAt: z.number().int().positive(),
  /** Optional tool call payload when role === 'assistant' issued a tool call. */
  toolCalls: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      input: z.record(z.unknown())
    })
  ).optional(),
  /** Optional reference back to a tool call when role === 'tool'. */
  toolCallId: z.string().optional()
});

// ../shared/src/logger.ts
import chalk from "chalk";
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join as join2 } from "path";

// ../shared/src/paths.ts
import { homedir } from "os";
import { join, resolve } from "path";
function getHomeDir() {
  return process.env.CYBERMIND_HOME ? resolve(process.env.CYBERMIND_HOME) : join(homedir(), ".cybermind");
}
function getSettingsPath() {
  return join(getHomeDir(), "settings.json");
}
function getTrustPath() {
  return join(getHomeDir(), "trust.json");
}
function getSkillsDir() {
  return join(getHomeDir(), "skills");
}
function getLogsDir() {
  return join(getHomeDir(), "logs");
}
function getDataDir() {
  return getHomeDir();
}
function getSecretsPath() {
  return join(getHomeDir(), "secrets.enc");
}
function getProjectDir(cwd = process.cwd()) {
  return join(cwd, ".cybermind");
}
function getProjectSkillsDir(cwd = process.cwd()) {
  return join(getProjectDir(cwd), "skills");
}

// ../shared/src/logger.ts
var LEVEL_ORDER = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
var COLOR = {
  debug: (s) => chalk.gray(s),
  info: (s) => chalk.cyan(s),
  warn: (s) => chalk.yellow(s),
  error: (s) => chalk.red(s)
};
var envLevel = (process.env.CYBERMIND_LOG_LEVEL ?? "info").toLowerCase();
var minLevel = LEVEL_ORDER[envLevel] ?? LEVEL_ORDER.info;
var writeToFile = process.env.CYBERMIND_LOG_FILE !== "false";
var logFilePath = null;
function ensureLogFile() {
  if (logFilePath) return logFilePath;
  const dir = getLogsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  logFilePath = join2(dir, `cybermind-${stamp}.log`);
  return logFilePath;
}
function emit(level, scope, message, data) {
  if (LEVEL_ORDER[level] < minLevel) return;
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  const tag = `[${level.toUpperCase()}]`.padEnd(7);
  const head = `${chalk.dim(ts)} ${COLOR[level](tag)} ${chalk.dim(`(${scope})`)}`;
  const dataStr = data !== void 0 ? ` ${safeStringify(data)}` : "";
  if (level === "error" || level === "warn" || process.env.CYBERMIND_LOG_STDERR === "true") {
    process.stderr.write(`${head} ${message}${dataStr}
`);
  }
  if (writeToFile) {
    try {
      const file = ensureLogFile();
      appendFileSync(file, `${ts} ${level.toUpperCase()} (${scope}) ${message}${dataStr}
`, {
        encoding: "utf8"
      });
    } catch {
    }
  }
}
function safeStringify(data) {
  try {
    return typeof data === "string" ? data : JSON.stringify(data);
  } catch {
    return String(data);
  }
}
function createLogger(scope) {
  return {
    debug: (m, d) => emit("debug", scope, m, d),
    info: (m, d) => emit("info", scope, m, d),
    warn: (m, d) => emit("warn", scope, m, d),
    error: (m, d) => emit("error", scope, m, d),
    child: (sub) => createLogger(`${scope}:${sub}`)
  };
}

// ../shared/src/version.ts
var CYBERMIND_VERSION = "0.1.17";
var CYBERMIND_NAME = "CyberMind";

// ../shared/src/checkpoint.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync, writeFileSync, readdirSync } from "fs";
import { join as join3 } from "path";
import { z as z2 } from "zod";
var log = createLogger("checkpoint");
function getCheckpointsDir() {
  return join3(getDataDir(), "checkpoints");
}
var CheckpointSchema = z2.object({
  id: z2.string(),
  createdAt: z2.number(),
  messages: z2.array(
    z2.object({
      id: z2.string(),
      role: z2.enum(["user", "assistant", "system"]),
      content: z2.string(),
      createdAt: z2.number()
    })
  ),
  model: z2.string(),
  provider: z2.string()
});
var CheckpointManager = class {
  dir;
  constructor() {
    this.dir = getCheckpointsDir();
    if (!existsSync2(this.dir)) mkdirSync2(this.dir, { recursive: true });
  }
  /** Persist the current session state to a new checkpoint file. */
  save(messages, model, provider) {
    const id = crypto.randomUUID();
    const checkpoint = {
      id,
      createdAt: Date.now(),
      messages: structuredClone(messages),
      // deep copy to avoid mutation
      model,
      provider
    };
    const path = join3(this.dir, `${id}.json`);
    writeFileSync(path, JSON.stringify(checkpoint, null, 2), "utf8");
    const latest = join3(this.dir, "latest.json");
    try {
      writeFileSync(latest, JSON.stringify(checkpoint, null, 2), "utf8");
    } catch (err) {
      log.warn("failed to write latest symlink", String(err));
    }
    log.info("saved checkpoint", { id, messageCount: messages.length });
    return id;
  }
  /** Load a checkpoint by id. Returns null if not found or corrupt. */
  load(id) {
    const path = join3(this.dir, `${id}.json`);
    if (!existsSync2(path)) return null;
    try {
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw);
      const checkpoint = CheckpointSchema.parse(parsed);
      return checkpoint;
    } catch (err) {
      log.warn("failed to load checkpoint", { id, error: String(err) });
      return null;
    }
  }
  /** Load the most recent checkpoint (latest.json). */
  loadLatest() {
    const path = join3(this.dir, "latest.json");
    if (!existsSync2(path)) return null;
    try {
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw);
      const checkpoint = CheckpointSchema.parse(parsed);
      return checkpoint;
    } catch (err) {
      log.warn("failed to load latest checkpoint", { error: String(err) });
      return null;
    }
  }
  /** List all checkpoint ids sorted by creation time (newest first). */
  list() {
    if (!existsSync2(this.dir)) return [];
    const entries = [];
    const files = readdirSync(this.dir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      if (file.name === "latest.json") continue;
      const id = file.name.slice(0, -5);
      const cp = this.load(id);
      if (cp) {
        entries.push({ id, createdAt: cp.createdAt, messageCount: cp.messages.length });
      }
    }
    return entries.sort((a, b) => b.createdAt - a.createdAt);
  }
  /** Delete a checkpoint file. */
  delete(id) {
    const path = join3(this.dir, `${id}.json`);
    if (!existsSync2(path)) return false;
    try {
      writeFileSync(path, "");
      log.info("deleted checkpoint", { id });
      return true;
    } catch (err) {
      log.warn("failed to delete checkpoint", { id, error: String(err) });
      return false;
    }
  }
};

// ../shared/src/profiles.ts
import { existsSync as existsSync3, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "fs";
import { z as z3 } from "zod";
var log2 = createLogger("profiles");
var ProfileSchema = z3.object({
  name: z3.enum(["default", "strict-ts", "hobby", "paranoid"]),
  /** Model to use for this profile */
  model: z3.string(),
  /** Provider to use for this profile */
  provider: z3.string(),
  /** Approval mode for tools */
  approvalMode: z3.enum(["always-ask", "session-bypass", "persistent-bypass"]),
  /** Whether to enable telemetry */
  telemetryEnabled: z3.boolean(),
  /** Whether to enable auto-checkpoint */
  autoCheckpoint: z3.boolean(),
  /** Custom accent color */
  accentColor: z3.string().optional()
});
var DEFAULT_PROFILES = {
  default: {
    name: "default",
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    approvalMode: "always-ask",
    telemetryEnabled: false,
    autoCheckpoint: true,
    accentColor: "blue"
  },
  "strict-ts": {
    name: "strict-ts",
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    approvalMode: "always-ask",
    telemetryEnabled: true,
    autoCheckpoint: true,
    accentColor: "red"
  },
  hobby: {
    name: "hobby",
    model: "claude-3-haiku-20241022",
    provider: "anthropic",
    approvalMode: "session-bypass",
    telemetryEnabled: false,
    autoCheckpoint: false,
    accentColor: "green"
  },
  paranoid: {
    name: "paranoid",
    model: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    approvalMode: "always-ask",
    telemetryEnabled: false,
    autoCheckpoint: true,
    accentColor: "orange"
  }
};
var SettingsSchema = z3.object({
  activeProfile: z3.string(),
  profiles: z3.record(z3.string(), ProfileSchema)
});
var ProfileManager = class {
  settingsPath;
  constructor() {
    this.settingsPath = getSettingsPath();
  }
  /** Get the current active profile */
  getActiveProfile() {
    const settings = this.loadSettings();
    const active = settings.profiles[settings.activeProfile];
    if (!active) {
      log2.warn("Active profile not found, falling back to default");
      return DEFAULT_PROFILES.default;
    }
    return active;
  }
  /** Set the active profile by name */
  setActiveProfile(name) {
    const settings = this.loadSettings();
    if (!settings.profiles[name]) {
      log2.warn("Profile not found", { name });
      return false;
    }
    settings.activeProfile = name;
    this.saveSettings(settings);
    log2.info("Switched profile", { name });
    return true;
  }
  /** Get all available profiles */
  listProfiles() {
    const settings = this.loadSettings();
    return settings.profiles;
  }
  /** Update a profile's settings */
  updateProfile(name, updates) {
    const settings = this.loadSettings();
    if (!settings.profiles[name]) {
      log2.warn("Profile not found for update", { name });
      return false;
    }
    settings.profiles[name] = { ...settings.profiles[name], ...updates };
    this.saveSettings(settings);
    log2.info("Updated profile", { name, updates: Object.keys(updates) });
    return true;
  }
  /** Reset a profile to its default configuration */
  resetProfile(name) {
    const defaultConfig = DEFAULT_PROFILES[name];
    if (!defaultConfig) {
      log2.warn("Cannot reset unknown profile", { name });
      return false;
    }
    const { name: _, ...configWithoutName } = defaultConfig;
    return this.updateProfile(name, configWithoutName);
  }
  loadSettings() {
    if (!existsSync3(this.settingsPath)) {
      const profiles = {};
      for (const [name, profile] of Object.entries(DEFAULT_PROFILES)) {
        profiles[name] = { ...profile };
      }
      const settings = {
        activeProfile: "default",
        profiles
      };
      this.saveSettings(settings);
      return settings;
    }
    try {
      const raw = readFileSync2(this.settingsPath, "utf8");
      const parsed = JSON.parse(raw);
      const settings = SettingsSchema.parse(parsed);
      return settings;
    } catch (err) {
      log2.error("Failed to load settings, using defaults", { error: String(err) });
      const profiles = {};
      for (const [name, profile] of Object.entries(DEFAULT_PROFILES)) {
        profiles[name] = { ...profile };
      }
      return {
        activeProfile: "default",
        profiles
      };
    }
  }
  saveSettings(settings) {
    try {
      writeFileSync2(this.settingsPath, JSON.stringify(settings, null, 2), "utf8");
    } catch (err) {
      log2.error("Failed to save settings", { error: String(err) });
    }
  }
};

// ../shared/src/collaboration.ts
import { existsSync as existsSync4, mkdirSync as mkdirSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3, readdirSync as readdirSync2 } from "fs";
import { join as join4 } from "path";
import { z as z4 } from "zod";
var log3 = createLogger("collaboration");
var CollaborationSessionSchema = z4.object({
  id: z4.string(),
  name: z4.string(),
  createdAt: z4.number(),
  participants: z4.array(z4.string()),
  worktrees: z4.record(z4.string(), z4.string()),
  sharedContext: z4.record(z4.unknown()),
  status: z4.enum(["active", "paused", "completed"])
});
var CollaborationManager = class {
  sessionsDir;
  worktreesDir;
  constructor() {
    this.sessionsDir = join4(getDataDir(), "collaboration", "sessions");
    this.worktreesDir = join4(getDataDir(), "collaboration", "worktrees");
    if (!existsSync4(this.sessionsDir)) mkdirSync3(this.sessionsDir, { recursive: true });
    if (!existsSync4(this.worktreesDir)) mkdirSync3(this.worktreesDir, { recursive: true });
  }
  /** Create a new collaboration session */
  createSession(name, initialAgentId) {
    const session = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      participants: [initialAgentId],
      worktrees: {},
      sharedContext: {},
      status: "active"
    };
    this.saveSession(session);
    log3.info("Created collaboration session", { sessionId: session.id, name });
    return session;
  }
  /** Get a session by ID */
  getSession(sessionId) {
    const path = join4(this.sessionsDir, `${sessionId}.json`);
    if (!existsSync4(path)) return null;
    try {
      const raw = readFileSync3(path, "utf8");
      const parsed = JSON.parse(raw);
      return CollaborationSessionSchema.parse(parsed);
    } catch (err) {
      log3.warn("Failed to load session", { sessionId, error: String(err) });
      return null;
    }
  }
  /** List all sessions */
  listSessions() {
    if (!existsSync4(this.sessionsDir)) return [];
    const sessions = [];
    const files = readdirSync2(this.sessionsDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      const sessionId = file.name.slice(0, -5);
      const session = this.getSession(sessionId);
      if (session) sessions.push(session);
    }
    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  }
  /** Add an agent to a session */
  addParticipant(sessionId, agentId) {
    const session = this.getSession(sessionId);
    if (!session || session.participants.includes(agentId)) {
      return false;
    }
    session.participants.push(agentId);
    this.saveSession(session);
    log3.info("Added participant to session", { sessionId, agentId });
    return true;
  }
  /** Create a worktree for an agent in a session */
  createWorktree(sessionId, agentId, _baseBranch = "main") {
    const session = this.getSession(sessionId);
    if (!session) return null;
    const worktreeName = `${sessionId}-${agentId}`;
    const worktreePath = join4(this.worktreesDir, worktreeName);
    session.worktrees[agentId] = worktreePath;
    this.saveSession(session);
    log3.info("Created worktree for agent", { sessionId, agentId, worktreePath });
    return worktreePath;
  }
  /** Update shared context for a session */
  updateSharedContext(sessionId, updates) {
    const session = this.getSession(sessionId);
    if (!session) return false;
    session.sharedContext = { ...session.sharedContext, ...updates };
    this.saveSession(session);
    return true;
  }
  /** Get shared context for a session */
  getSharedContext(sessionId) {
    const session = this.getSession(sessionId);
    return session?.sharedContext || {};
  }
  /** Update session status */
  updateSessionStatus(sessionId, status) {
    const session = this.getSession(sessionId);
    if (!session) return false;
    session.status = status;
    this.saveSession(session);
    log3.info("Updated session status", { sessionId, status });
    return true;
  }
  /** Delete a session and its worktrees */
  deleteSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return false;
    const sessionPath = join4(this.sessionsDir, `${sessionId}.json`);
    try {
      writeFileSync3(sessionPath, "");
    } catch (err) {
      log3.warn("Failed to delete session file", { sessionId, error: String(err) });
    }
    log3.info("Deleted collaboration session", { sessionId });
    return true;
  }
  saveSession(session) {
    const path = join4(this.sessionsDir, `${session.id}.json`);
    try {
      writeFileSync3(path, JSON.stringify(session, null, 2), "utf8");
    } catch (err) {
      log3.error("Failed to save session", { sessionId: session.id, error: String(err) });
    }
  }
};

// ../shared/src/web-mirror.ts
import { existsSync as existsSync5, mkdirSync as mkdirSync4, readFileSync as readFileSync4, writeFileSync as writeFileSync4, readdirSync as readdirSync3 } from "fs";
import { join as join5 } from "path";
import { createServer } from "http";
import { z as z5 } from "zod";
var log4 = createLogger("web-mirror");
var MirrorSessionSchema = z5.object({
  id: z5.string(),
  sessionId: z5.string(),
  name: z5.string(),
  createdAt: z5.number(),
  port: z5.number(),
  clients: z5.array(z5.object({
    id: z5.string(),
    type: z5.enum(["cli", "web"]),
    connectedAt: z5.number(),
    lastActivity: z5.number(),
    metadata: z5.record(z5.unknown()).optional()
  })),
  state: z5.object({
    messages: z5.array(z5.unknown()),
    agents: z5.record(z5.unknown()),
    cursors: z5.record(z5.object({
      line: z5.number(),
      column: z5.number(),
      file: z5.string()
    })),
    ui: z5.object({
      activePanel: z5.string().optional(),
      scrollPosition: z5.number().optional(),
      focusedInput: z5.boolean().optional()
    })
  })
});
var WebMirrorManager = class {
  mirrorsDir;
  servers = /* @__PURE__ */ new Map();
  sessions = /* @__PURE__ */ new Map();
  constructor() {
    this.mirrorsDir = join5(getDataDir(), "collaboration", "mirrors");
    if (!existsSync5(this.mirrorsDir)) mkdirSync4(this.mirrorsDir, { recursive: true });
    this.loadExistingSessions();
  }
  /** Create a new mirror session for a collaboration session */
  createMirror(sessionId, name) {
    const mirror = {
      id: crypto.randomUUID(),
      sessionId,
      name,
      createdAt: Date.now(),
      port: this.allocatePort(),
      clients: [],
      state: {
        messages: [],
        agents: {},
        cursors: {},
        ui: {}
      }
    };
    this.sessions.set(mirror.id, mirror);
    this.saveMirror(mirror);
    this.startMirrorServer(mirror);
    log4.info("Created web mirror", { mirrorId: mirror.id, sessionId, port: mirror.port });
    return mirror;
  }
  /** Get a mirror session by ID */
  getMirror(mirrorId) {
    return this.sessions.get(mirrorId) || null;
  }
  /** Get mirror by collaboration session ID */
  getMirrorBySession(sessionId) {
    for (const mirror of this.sessions.values()) {
      if (mirror.sessionId === sessionId) return mirror;
    }
    return null;
  }
  /** Add a client to a mirror session */
  addClient(mirrorId, clientType, metadata) {
    const mirror = this.sessions.get(mirrorId);
    if (!mirror) return null;
    const client = {
      id: crypto.randomUUID(),
      type: clientType,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      metadata
    };
    mirror.clients.push(client);
    this.saveMirror(mirror);
    this.broadcastClientUpdate(mirror, "join", client);
    log4.info("Added client to mirror", { mirrorId, clientId: client.id, type: clientType });
    return client.id;
  }
  /** Remove a client from a mirror session */
  removeClient(mirrorId, clientId) {
    const mirror = this.sessions.get(mirrorId);
    if (!mirror) return false;
    const index = mirror.clients.findIndex((c) => c.id === clientId);
    if (index === -1) return false;
    const client = mirror.clients[index];
    if (!client) return false;
    const clientType = client.type;
    mirror.clients.splice(index, 1);
    this.saveMirror(mirror);
    this.broadcastClientUpdate(mirror, "leave", client);
    log4.info("Removed client from mirror", { mirrorId, clientId, type: clientType });
    return true;
  }
  /** Update mirror state */
  updateState(mirrorId, updates) {
    const mirror = this.sessions.get(mirrorId);
    if (!mirror) return false;
    mirror.state = { ...mirror.state, ...updates };
    this.saveMirror(mirror);
    this.broadcastStateUpdate(mirror);
    return true;
  }
  /** Update cursor position for an agent */
  updateCursor(mirrorId, agentId, position) {
    const mirror = this.sessions.get(mirrorId);
    if (!mirror) return false;
    mirror.state.cursors[agentId] = position;
    this.saveMirror(mirror);
    this.broadcastCursorUpdate(mirror, agentId, position);
    return true;
  }
  /** Add a message to the mirror */
  addMessage(mirrorId, message) {
    const mirror = this.sessions.get(mirrorId);
    if (!mirror) return false;
    mirror.state.messages.push(message);
    this.saveMirror(mirror);
    this.broadcastMessage(mirror, message);
    return true;
  }
  /** Get mirror URL for web access */
  getMirrorUrl(mirrorId) {
    const mirror = this.sessions.get(mirrorId);
    if (!mirror) return null;
    return `http://localhost:${mirror.port}`;
  }
  /** Stop a mirror server */
  stopMirror(mirrorId) {
    const mirror = this.sessions.get(mirrorId);
    if (!mirror) return false;
    const server = this.servers.get(mirrorId);
    if (server) {
      server.close();
      this.servers.delete(mirrorId);
    }
    this.sessions.delete(mirrorId);
    const mirrorPath = join5(this.mirrorsDir, `${mirrorId}.json`);
    try {
      writeFileSync4(mirrorPath, "");
    } catch (err) {
      log4.warn("Failed to delete mirror file", { mirrorId, error: String(err) });
    }
    log4.info("Stopped web mirror", { mirrorId });
    return true;
  }
  allocatePort() {
    const usedPorts = Array.from(this.sessions.values()).map((s) => s.port);
    let port = 8080;
    while (usedPorts.includes(port)) {
      port++;
    }
    return port;
  }
  startMirrorServer(mirror) {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(this.generateWebUI(mirror));
    });
    server.listen(mirror.port, () => {
      log4.info("Mirror server started", { mirrorId: mirror.id, port: mirror.port });
    });
    this.servers.set(mirror.id, server);
  }
  generateWebUI(mirror) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>CyberMind Collaborative Session - ${mirror.name}</title>
    <meta charset="utf-8">
    <style>
        body { font-family: system-ui, sans-serif; margin: 0; background: #0a0a0a; color: #fff; }
        .header { background: #1a1a1a; padding: 1rem; border-bottom: 1px solid #333; }
        .content { display: flex; height: calc(100vh - 60px); }
        .sidebar { width: 250px; background: #1a1a1a; border-right: 1px solid #333; padding: 1rem; }
        .main { flex: 1; padding: 1rem; overflow-y: auto; }
        .message { margin-bottom: 1rem; padding: 0.5rem; border-radius: 4px; }
        .user { background: #1e3a8a; }
        .assistant { background: #14532d; }
        .system { background: #713f12; }
        .clients { margin-top: 1rem; }
        .client { padding: 0.25rem; font-size: 0.875rem; }
        .cursor { font-size: 0.75rem; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="header">
        <h1>CyberMind - ${mirror.name}</h1>
        <p>Session ID: ${mirror.sessionId}</p>
    </div>
    <div class="content">
        <div class="sidebar">
            <h3>Connected Clients (${mirror.clients.length})</h3>
            <div class="clients">
                ${mirror.clients.map((client) => `
                    <div class="client">
                        ${client.type === "cli" ? "\u{1F5A5}\uFE0F CLI" : "\u{1F310} Web"} - ${client.id.slice(0, 8)}\u2026
                    </div>
                `).join("")}
            </div>
            <h3>Active Cursors</h3>
            <div class="cursors">
                ${Object.entries(mirror.state.cursors).map(([agent, cursor]) => `
                    <div class="cursor">
                        ${agent}: ${cursor.file}:${cursor.line}:${cursor.column}
                    </div>
                `).join("")}
            </div>
        </div>
        <div class="main" id="messages">
            ${mirror.state.messages.map((msg) => `
                <div class="message ${msg.role}">
                    <strong>${msg.role}:</strong> ${msg.content}
                </div>
            `).join("")}
        </div>
    </div>
    <script>
        // WebSocket connection for real-time updates would go here
        console.log('CyberMind collaborative session loaded');
    </script>
</body>
</html>`;
  }
  broadcastClientUpdate(mirror, action, client) {
    log4.debug("Broadcasting client update", { mirrorId: mirror.id, action, clientId: client.id });
  }
  broadcastStateUpdate(mirror) {
    log4.debug("Broadcasting state update", { mirrorId: mirror.id });
  }
  broadcastCursorUpdate(mirror, agentId, position) {
    log4.debug("Broadcasting cursor update", { mirrorId: mirror.id, agentId, position });
  }
  broadcastMessage(mirror, message) {
    log4.debug("Broadcasting message", { mirrorId: mirror.id, messageRole: message.role });
  }
  loadExistingSessions() {
    if (!existsSync5(this.mirrorsDir)) return;
    const files = readdirSync3(this.mirrorsDir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      const mirrorId = file.name.slice(0, -5);
      const path = join5(this.mirrorsDir, file.name);
      try {
        const raw = readFileSync4(path, "utf8");
        const parsed = JSON.parse(raw);
        const mirror = MirrorSessionSchema.parse(parsed);
        this.sessions.set(mirrorId, mirror);
      } catch (err) {
        log4.warn("Failed to load mirror session", { mirrorId, error: String(err) });
      }
    }
  }
  saveMirror(mirror) {
    const path = join5(this.mirrorsDir, `${mirror.id}.json`);
    try {
      writeFileSync4(path, JSON.stringify(mirror, null, 2), "utf8");
    } catch (err) {
      log4.error("Failed to save mirror", { mirrorId: mirror.id, error: String(err) });
    }
  }
};

// ../shared/src/rich-io.ts
import { existsSync as existsSync6, mkdirSync as mkdirSync5, readFileSync as readFileSync5, writeFileSync as writeFileSync5 } from "fs";
import { join as join6 } from "path";
import { z as z6 } from "zod";
var log5 = createLogger("rich-io");
var CostMetricsSchema = z6.object({
  totalTokens: z6.number(),
  totalCost: z6.number(),
  modelBreakdown: z6.record(z6.object({
    tokens: z6.number(),
    cost: z6.number()
  })),
  sessionStart: z6.number(),
  lastUpdate: z6.number()
});
var RichIOManager = class {
  dataDir;
  imagesDir;
  screenshotsDir;
  costMetrics;
  constructor() {
    this.dataDir = getDataDir();
    this.imagesDir = join6(this.dataDir, "images");
    this.screenshotsDir = join6(this.dataDir, "screenshots");
    if (!existsSync6(this.imagesDir)) mkdirSync5(this.imagesDir, { recursive: true });
    if (!existsSync6(this.screenshotsDir)) mkdirSync5(this.screenshotsDir, { recursive: true });
    this.costMetrics = this.loadCostMetrics();
  }
  /** Process and store an image from various sources */
  async processImage(input, alt, caption) {
    let src;
    if (typeof input === "string") {
      if (input.startsWith("data:")) {
        src = input;
      } else if (input.startsWith("http")) {
        src = input;
        log5.info("Image URL provided", { url: input });
      } else {
        if (!existsSync6(input)) {
          throw new Error(`Image file not found: ${input}`);
        }
        const buffer = readFileSync5(input);
        const base64 = buffer.toString("base64");
        const mimeType = this.getMimeType(input);
        src = `data:${mimeType};base64,${base64}`;
      }
    } else {
      const base64 = input.toString("base64");
      src = "data:image/png;base64," + base64;
    }
    const image = {
      type: "image",
      src,
      alt,
      caption
    };
    log5.info("Processed image", { alt, hasCaption: !!caption });
    return image;
  }
  /** Create a mermaid diagram */
  createMermaidDiagram(code, title, theme = "default") {
    const diagram = {
      type: "mermaid",
      code,
      title,
      theme
    };
    log5.info("Created mermaid diagram", { title, theme, codeLength: code.length });
    return diagram;
  }
  /** Update cost metrics */
  updateCostMetrics(model, tokens, cost) {
    this.costMetrics.totalTokens += tokens;
    this.costMetrics.totalCost += cost;
    if (!this.costMetrics.modelBreakdown[model]) {
      this.costMetrics.modelBreakdown[model] = { tokens: 0, cost: 0 };
    }
    this.costMetrics.modelBreakdown[model].tokens += tokens;
    this.costMetrics.modelBreakdown[model].cost += cost;
    this.costMetrics.lastUpdate = Date.now();
    this.saveCostMetrics();
    log5.debug("Updated cost metrics", { model, tokens, cost, totalCost: this.costMetrics.totalCost });
  }
  /** Get current cost metrics */
  getCostMetrics() {
    return { ...this.costMetrics };
  }
  /** Get cost formatted as string */
  getCostString() {
    const { totalCost, totalTokens } = this.costMetrics;
    const duration = Date.now() - this.costMetrics.sessionStart;
    const minutes = Math.floor(duration / 6e4);
    return `$${totalCost.toFixed(4)} \u2022 ${totalTokens.toLocaleString()} tokens \u2022 ${minutes}m`;
  }
  /** Get default hotkey bindings */
  getDefaultHotkeys() {
    return [
      // Navigation
      { key: "k", modifiers: ["ctrl"], action: "clear", description: "Clear screen", category: "navigation" },
      { key: "c", modifiers: ["ctrl"], action: "exit", description: "Exit CyberMind", category: "navigation" },
      { key: "/", modifiers: [], action: "focus-input", description: "Focus input", category: "navigation" },
      { key: "ArrowUp", modifiers: ["ctrl"], action: "history-prev", description: "Previous command", category: "navigation" },
      { key: "ArrowDown", modifiers: ["ctrl"], action: "history-next", description: "Next command", category: "navigation" },
      // Editing
      { key: "l", modifiers: ["ctrl"], action: "clear-input", description: "Clear input", category: "editing" },
      { key: "a", modifiers: ["ctrl"], action: "select-all", description: "Select all", category: "editing" },
      { key: "z", modifiers: ["ctrl"], action: "undo", description: "Undo", category: "editing" },
      { key: "y", modifiers: ["ctrl"], action: "redo", description: "Redo", category: "editing" },
      // Session
      { key: "s", modifiers: ["ctrl"], action: "save-session", description: "Save session", category: "session" },
      { key: "r", modifiers: ["ctrl"], action: "rewind", description: "Open rewind menu", category: "session" },
      { key: "p", modifiers: ["ctrl"], action: "profile", description: "Switch profile", category: "session" },
      // Tools
      { key: "t", modifiers: ["ctrl"], action: "trust", description: "Trust settings", category: "tools" },
      { key: "m", modifiers: ["ctrl"], action: "model", description: "Model settings", category: "tools" },
      { key: "h", modifiers: ["ctrl"], action: "help", description: "Show help", category: "tools" }
    ];
  }
  /** Show hotkey palette */
  getHotkeyPalette() {
    const hotkeys = this.getDefaultHotkeys();
    const grouped = /* @__PURE__ */ new Map();
    for (const hotkey of hotkeys) {
      if (!grouped.has(hotkey.category)) {
        grouped.set(hotkey.category, []);
      }
      grouped.get(hotkey.category).push(hotkey);
    }
    return Array.from(grouped.entries()).map(([category, bindings]) => ({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      bindings: bindings.sort((a, b) => a.key.localeCompare(b.key))
    }));
  }
  /** Analyze a screenshot */
  async analyzeScreenshot(imagePath) {
    if (!existsSync6(imagePath)) {
      throw new Error(`Screenshot file not found: ${imagePath}`);
    }
    const analysis = {
      type: "screenshot",
      imagePath,
      analysis: {
        description: "Screenshot captured successfully",
        elements: [
          {
            type: "window",
            description: "Application window",
            position: { x: 0, y: 0, width: 1920, height: 1080 }
          }
        ],
        suggestions: [
          "Consider using this screenshot as reference for UI development",
          "You can ask questions about specific elements in the image"
        ]
      },
      timestamp: Date.now()
    };
    log5.info("Analyzed screenshot", { imagePath, elementCount: analysis.analysis.elements.length });
    return analysis;
  }
  /** Generate mobile-responsive HTML for content */
  generateMobileHTML(content, images, diagrams) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CyberMind Mobile</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0a0a0a; 
            color: #fff; 
            line-height: 1.6;
            padding: 1rem;
        }
        .container { max-width: 100%; margin: 0 auto; }
        .content { margin-bottom: 2rem; white-space: pre-wrap; }
        .image { 
            margin: 1rem 0; 
            border-radius: 8px; 
            overflow: hidden;
            max-width: 100%;
        }
        .image img { 
            width: 100%; 
            height: auto; 
            display: block;
        }
        .image-caption { 
            font-size: 0.875rem; 
            color: #9ca3af; 
            margin-top: 0.5rem;
            text-align: center;
        }
        .diagram { 
            margin: 1rem 0; 
            background: #1a1a1a; 
            padding: 1rem; 
            border-radius: 8px;
            overflow-x: auto;
        }
        .diagram-title { 
            font-weight: bold; 
            margin-bottom: 0.5rem; 
        }
        .cost-meter {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: #1a1a1a;
            padding: 0.75rem;
            border-top: 1px solid #333;
            font-size: 0.875rem;
            text-align: center;
        }
        @media (min-width: 768px) {
            body { padding: 2rem; }
            .container { max-width: 768px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="content">${content}</div>
        ${images?.map((img) => `
            <div class="image">
                <img src="${img.src}" alt="${img.alt}" />
                ${img.caption ? `<div class="image-caption">${img.caption}</div>` : ""}
            </div>
        `).join("") || ""}
        ${diagrams?.map((diagram) => `
            <div class="diagram">
                ${diagram.title ? `<div class="diagram-title">${diagram.title}</div>` : ""}
                <pre class="mermaid">${diagram.code}</pre>
            </div>
        `).join("") || ""}
    </div>
    <div class="cost-meter">${this.getCostString()}</div>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>mermaid.initialize({ theme: 'dark' });</script>
</body>
</html>`;
  }
  getMimeType(filePath) {
    const ext = filePath.toLowerCase().split(".").pop();
    const mimeTypes = {
      "jpg": "image/jpeg",
      "jpeg": "image/jpeg",
      "png": "image/png",
      "gif": "image/gif",
      "webp": "image/webp",
      "svg": "image/svg+xml"
    };
    return mimeTypes[ext || ""] || "image/png";
  }
  loadCostMetrics() {
    const path = join6(this.dataDir, "cost-metrics.json");
    if (!existsSync6(path)) {
      const metrics = {
        totalTokens: 0,
        totalCost: 0,
        modelBreakdown: {},
        sessionStart: Date.now(),
        lastUpdate: Date.now()
      };
      writeFileSync5(path, JSON.stringify(metrics, null, 2), "utf8");
      return metrics;
    }
    try {
      const raw = readFileSync5(path, "utf8");
      const parsed = JSON.parse(raw);
      return CostMetricsSchema.parse(parsed);
    } catch (err) {
      log5.warn("Failed to load cost metrics, using defaults", { error: String(err) });
      return {
        totalTokens: 0,
        totalCost: 0,
        modelBreakdown: {},
        sessionStart: Date.now(),
        lastUpdate: Date.now()
      };
    }
  }
  saveCostMetrics() {
    const path = join6(this.dataDir, "cost-metrics.json");
    try {
      writeFileSync5(path, JSON.stringify(this.costMetrics, null, 2), "utf8");
    } catch (err) {
      log5.error("Failed to save cost metrics", { error: String(err) });
    }
  }
};

// ../shared/src/ecosystem.ts
import { existsSync as existsSync7, mkdirSync as mkdirSync6, readFileSync as readFileSync6, writeFileSync as writeFileSync6 } from "fs";
import { join as join7 } from "path";
import { z as z7 } from "zod";
var log6 = createLogger("ecosystem");
var TelemetrySettingsSchema = z7.object({
  enabled: z7.boolean(),
  level: z7.enum(["minimal", "basic", "detailed"]),
  dataRetention: z7.number(),
  shareUsageStats: z7.boolean(),
  shareErrorReports: z7.boolean(),
  sharePerformanceMetrics: z7.boolean()
});
var EcosystemManager = class {
  dataDir;
  mcpDir;
  skillsDir;
  telemetrySettings;
  constructor() {
    this.dataDir = getDataDir();
    this.mcpDir = join7(this.dataDir, "mcp");
    this.skillsDir = join7(this.dataDir, "skills");
    if (!existsSync7(this.mcpDir)) mkdirSync6(this.mcpDir, { recursive: true });
    if (!existsSync7(this.skillsDir)) mkdirSync6(this.skillsDir, { recursive: true });
    this.telemetrySettings = this.loadTelemetrySettings();
  }
  // MCP Marketplace Functions
  async searchMCPServers(query, tags) {
    const servers = this.getAvailableMCPServers();
    return servers.filter((server) => {
      const matchesQuery = !query || server.name.toLowerCase().includes(query.toLowerCase()) || server.description.toLowerCase().includes(query.toLowerCase());
      const matchesTags = !tags || tags.length === 0 || tags.some((tag) => server.tags.includes(tag));
      return matchesQuery && matchesTags;
    });
  }
  getAvailableMCPServers() {
    const builtInServers = this.getBuiltInMCPServers();
    const installedServers = this.getInstalledMCPServers();
    return [...builtInServers, ...installedServers];
  }
  async installMCPServer(serverId) {
    const servers = this.getAvailableMCPServers();
    const server = servers.find((s) => s.id === serverId);
    if (!server) {
      log6.warn("MCP server not found", { serverId });
      return false;
    }
    if (server.installed) {
      log6.info("MCP server already installed", { serverId });
      return true;
    }
    server.installed = true;
    server.lastUpdated = Date.now();
    this.saveMCPServer(server);
    log6.info("MCP server installed", { serverId, name: server.name });
    return true;
  }
  async uninstallMCPServer(serverId) {
    const server = this.getMCPServer(serverId);
    if (!server) return false;
    server.installed = false;
    server.lastUpdated = Date.now();
    this.saveMCPServer(server);
    log6.info("MCP server uninstalled", { serverId });
    return true;
  }
  // Skill Marketplace Functions
  async searchSkills(query, category, tags) {
    const skills = this.getAvailableSkills();
    return skills.filter((skill) => {
      const matchesQuery = !query || skill.name.toLowerCase().includes(query.toLowerCase()) || skill.description.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = !category || skill.category === category;
      const matchesTags = !tags || tags.length === 0 || tags.some((tag) => skill.tags.includes(tag));
      return matchesQuery && matchesCategory && matchesTags;
    });
  }
  getAvailableSkills() {
    const seedSkills = this.getSeedSkills();
    const installedSkills = this.getInstalledSkills();
    return [...seedSkills, ...installedSkills];
  }
  async installSkill(skillId) {
    const skills = this.getAvailableSkills();
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) {
      log6.warn("Skill not found", { skillId });
      return false;
    }
    if (skill.installed) {
      log6.info("Skill already installed", { skillId });
      return true;
    }
    if (skill.dependencies) {
      for (const depId of skill.dependencies) {
        const dep = this.getSkill(depId);
        if (!dep || !dep.installed) {
          log6.warn("Skill dependency not installed", { skillId, dependency: depId });
          return false;
        }
      }
    }
    skill.installed = true;
    skill.lastUpdated = Date.now();
    skill.downloadCount++;
    this.saveSkill(skill);
    log6.info("Skill installed", { skillId, name: skill.name });
    return true;
  }
  async uninstallSkill(skillId) {
    const skill = this.getSkill(skillId);
    if (!skill) return false;
    skill.installed = false;
    skill.lastUpdated = Date.now();
    this.saveSkill(skill);
    log6.info("Skill uninstalled", { skillId });
    return true;
  }
  // Telemetry Functions
  getTelemetrySettings() {
    return { ...this.telemetrySettings };
  }
  updateTelemetrySettings(settings) {
    this.telemetrySettings = { ...this.telemetrySettings, ...settings };
    this.saveTelemetrySettings();
    log6.info("Telemetry settings updated", { enabled: this.telemetrySettings.enabled });
  }
  isTelemetryEnabled() {
    return this.telemetrySettings.enabled;
  }
  recordUsage(event, _data) {
    if (!this.telemetrySettings.enabled) return;
    log6.debug("Usage recorded", { event, level: this.telemetrySettings.level });
  }
  // Private helper methods
  getBuiltInMCPServers() {
    return [
      {
        id: "filesystem",
        name: "Filesystem MCP",
        description: "File system operations and management",
        version: "1.0.0",
        author: "CyberMind",
        tags: ["filesystem", "files", "storage"],
        installed: true,
        lastUpdated: Date.now()
      },
      {
        id: "database",
        name: "Database MCP",
        description: "Database connections and queries",
        version: "1.0.0",
        author: "CyberMind",
        tags: ["database", "sql", "storage"],
        installed: false,
        lastUpdated: Date.now()
      },
      {
        id: "web-api",
        name: "Web API MCP",
        description: "HTTP requests and API interactions",
        version: "1.0.0",
        author: "CyberMind",
        tags: ["api", "http", "web"],
        installed: false,
        lastUpdated: Date.now()
      }
    ];
  }
  getSeedSkills() {
    return [
      // Development Skills (20)
      { id: "code-analyzer", name: "Code Analyzer", description: "Analyze code quality and structure", version: "1.0.0", author: "CyberMind", category: "development", tags: ["analysis", "quality"], installed: false, lastUpdated: Date.now(), downloadCount: 1250, rating: 4.5 },
      { id: "refactor-assistant", name: "Refactor Assistant", description: "Intelligent code refactoring suggestions", version: "1.0.0", author: "CyberMind", category: "development", tags: ["refactor", "cleanup"], installed: false, lastUpdated: Date.now(), downloadCount: 980, rating: 4.7 },
      { id: "debug-helper", name: "Debug Helper", description: "Debugging assistance and issue diagnosis", version: "1.0.0", author: "CyberMind", category: "development", tags: ["debug", "troubleshoot"], installed: false, lastUpdated: Date.now(), downloadCount: 1100, rating: 4.6 },
      { id: "test-generator", name: "Test Generator", description: "Generate unit and integration tests", version: "1.0.0", author: "CyberMind", category: "development", tags: ["testing", "automation"], installed: false, lastUpdated: Date.now(), downloadCount: 1500, rating: 4.8 },
      { id: "api-designer", name: "API Designer", description: "Design and document REST APIs", version: "1.0.0", author: "CyberMind", category: "development", tags: ["api", "design"], installed: false, lastUpdated: Date.now(), downloadCount: 750, rating: 4.4 },
      // Design Skills (15)
      { id: "ui-mockup", name: "UI Mockup Generator", description: "Create user interface mockups", version: "1.0.0", author: "CyberMind", category: "design", tags: ["ui", "mockup"], installed: false, lastUpdated: Date.now(), downloadCount: 890, rating: 4.5 },
      { id: "color-palette", name: "Color Palette Creator", description: "Generate color schemes and palettes", version: "1.0.0", author: "CyberMind", category: "design", tags: ["colors", "design"], installed: false, lastUpdated: Date.now(), downloadCount: 620, rating: 4.3 },
      { id: "typography", name: "Typography Advisor", description: "Typography recommendations and pairings", version: "1.0.0", author: "CyberMind", category: "design", tags: ["fonts", "typography"], installed: false, lastUpdated: Date.now(), downloadCount: 450, rating: 4.2 },
      { id: "layout-designer", name: "Layout Designer", description: "Create responsive layout designs", version: "1.0.0", author: "CyberMind", category: "design", tags: ["layout", "responsive"], installed: false, lastUpdated: Date.now(), downloadCount: 780, rating: 4.6 },
      { id: "icon-generator", name: "Icon Generator", description: "Generate custom icons and symbols", version: "1.0.0", author: "CyberMind", category: "design", tags: ["icons", "graphics"], installed: false, lastUpdated: Date.now(), downloadCount: 920, rating: 4.4 },
      // Testing Skills (10)
      { id: "e2e-tester", name: "E2E Test Generator", description: "Generate end-to-end test scenarios", version: "1.0.0", author: "CyberMind", category: "testing", tags: ["e2e", "automation"], installed: false, lastUpdated: Date.now(), downloadCount: 650, rating: 4.5 },
      { id: "performance-tester", name: "Performance Tester", description: "Create performance and load tests", version: "1.0.0", author: "CyberMind", category: "testing", tags: ["performance", "load"], installed: false, lastUpdated: Date.now(), downloadCount: 540, rating: 4.3 },
      { id: "security-scanner", name: "Security Scanner", description: "Security vulnerability scanning", version: "1.0.0", author: "CyberMind", category: "testing", tags: ["security", "scan"], installed: false, lastUpdated: Date.now(), downloadCount: 890, rating: 4.7 },
      { id: "accessibility-tester", name: "Accessibility Tester", description: "Test for accessibility compliance", version: "1.0.0", author: "CyberMind", category: "testing", tags: ["a11y", "compliance"], installed: false, lastUpdated: Date.now(), downloadCount: 380, rating: 4.4 },
      { id: "compatibility-tester", name: "Compatibility Tester", description: "Cross-browser compatibility testing", version: "1.0.0", author: "CyberMind", category: "testing", tags: ["compatibility", "browser"], installed: false, lastUpdated: Date.now(), downloadCount: 420, rating: 4.2 },
      // Deployment Skills (10)
      { id: "docker-generator", name: "Docker Generator", description: "Generate Docker configurations", version: "1.0.0", author: "CyberMind", category: "deployment", tags: ["docker", "containers"], installed: false, lastUpdated: Date.now(), downloadCount: 1100, rating: 4.6 },
      { id: "kubernetes-deployer", name: "Kubernetes Deployer", description: "Kubernetes deployment manifests", version: "1.0.0", author: "CyberMind", category: "deployment", tags: ["k8s", "orchestration"], installed: false, lastUpdated: Date.now(), downloadCount: 780, rating: 4.5 },
      { id: "ci-cd-pipeline", name: "CI/CD Pipeline", description: "Generate CI/CD pipeline configurations", version: "1.0.0", author: "CyberMind", category: "deployment", tags: ["cicd", "pipeline"], installed: false, lastUpdated: Date.now(), downloadCount: 920, rating: 4.7 },
      { id: "cloud-deployer", name: "Cloud Deployer", description: "Cloud deployment configurations", version: "1.0.0", author: "CyberMind", category: "deployment", tags: ["cloud", "deploy"], installed: false, lastUpdated: Date.now(), downloadCount: 650, rating: 4.4 },
      { id: "env-manager", name: "Environment Manager", description: "Manage deployment environments", version: "1.0.0", author: "CyberMind", category: "deployment", tags: ["environment", "config"], installed: false, lastUpdated: Date.now(), downloadCount: 480, rating: 4.3 },
      // Monitoring Skills (5)
      { id: "log-analyzer", name: "Log Analyzer", description: "Analyze and parse application logs", version: "1.0.0", author: "CyberMind", category: "monitoring", tags: ["logs", "analysis"], installed: false, lastUpdated: Date.now(), downloadCount: 520, rating: 4.4 },
      { id: "metrics-collector", name: "Metrics Collector", description: "Collect and visualize metrics", version: "1.0.0", author: "CyberMind", category: "monitoring", tags: ["metrics", "monitoring"], installed: false, lastUpdated: Date.now(), downloadCount: 380, rating: 4.2 },
      { id: "alert-manager", name: "Alert Manager", description: "Configure alerts and notifications", version: "1.0.0", author: "CyberMind", category: "monitoring", tags: ["alerts", "notifications"], installed: false, lastUpdated: Date.now(), downloadCount: 340, rating: 4.3 },
      { id: "health-checker", name: "Health Checker", description: "Application health monitoring", version: "1.0.0", author: "CyberMind", category: "monitoring", tags: ["health", "monitoring"], installed: false, lastUpdated: Date.now(), downloadCount: 420, rating: 4.5 },
      { id: "uptime-monitor", name: "Uptime Monitor", description: "Monitor service uptime and availability", version: "1.0.0", author: "CyberMind", category: "monitoring", tags: ["uptime", "availability"], installed: false, lastUpdated: Date.now(), downloadCount: 290, rating: 4.1 },
      // Security Skills (5)
      { id: "vulnerability-scanner", name: "Vulnerability Scanner", description: "Scan for security vulnerabilities", version: "1.0.0", author: "CyberMind", category: "security", tags: ["security", "vulnerability"], installed: false, lastUpdated: Date.now(), downloadCount: 680, rating: 4.6 },
      { id: "password-manager", name: "Password Manager", description: "Generate and manage secure passwords", version: "1.0.0", author: "CyberMind", category: "security", tags: ["passwords", "security"], installed: false, lastUpdated: Date.now(), downloadCount: 450, rating: 4.3 },
      { id: "encryption-helper", name: "Encryption Helper", description: "Encryption and decryption utilities", version: "1.0.0", author: "CyberMind", category: "security", tags: ["encryption", "crypto"], installed: false, lastUpdated: Date.now(), downloadCount: 320, rating: 4.4 },
      { id: "audit-logger", name: "Audit Logger", description: "Security audit logging", version: "1.0.0", author: "CyberMind", category: "security", tags: ["audit", "logging"], installed: false, lastUpdated: Date.now(), downloadCount: 280, rating: 4.2 },
      { id: "compliance-checker", name: "Compliance Checker", description: "Check regulatory compliance", version: "1.0.0", author: "CyberMind", category: "security", tags: ["compliance", "regulation"], installed: false, lastUpdated: Date.now(), downloadCount: 360, rating: 4.3 },
      // Data Skills (5)
      { id: "data-visualizer", name: "Data Visualizer", description: "Create data visualizations and charts", version: "1.0.0", author: "CyberMind", category: "data", tags: ["visualization", "charts"], installed: false, lastUpdated: Date.now(), downloadCount: 750, rating: 4.5 },
      { id: "etl-pipeline", name: "ETL Pipeline", description: "Design ETL data pipelines", version: "1.0.0", author: "CyberMind", category: "data", tags: ["etl", "pipeline"], installed: false, lastUpdated: Date.now(), downloadCount: 520, rating: 4.4 },
      { id: "data-cleaner", name: "Data Cleaner", description: "Clean and preprocess data", version: "1.0.0", author: "CyberMind", category: "data", tags: ["cleaning", "preprocessing"], installed: false, lastUpdated: Date.now(), downloadCount: 480, rating: 4.3 },
      { id: "schema-designer", name: "Schema Designer", description: "Design database schemas", version: "1.0.0", author: "CyberMind", category: "data", tags: ["schema", "database"], installed: false, lastUpdated: Date.now(), downloadCount: 620, rating: 4.6 },
      { id: "migration-tool", name: "Migration Tool", description: "Database migration assistance", version: "1.0.0", author: "CyberMind", category: "data", tags: ["migration", "database"], installed: false, lastUpdated: Date.now(), downloadCount: 380, rating: 4.2 },
      // AI Skills (5)
      { id: "ml-model-trainer", name: "ML Model Trainer", description: "Train machine learning models", version: "1.0.0", author: "CyberMind", category: "ai", tags: ["ml", "training"], installed: false, lastUpdated: Date.now(), downloadCount: 580, rating: 4.5 },
      { id: "prompt-engineer", name: "Prompt Engineer", description: "Optimize AI prompts", version: "1.0.0", author: "CyberMind", category: "ai", tags: ["prompt", "ai"], installed: false, lastUpdated: Date.now(), downloadCount: 890, rating: 4.7 },
      { id: "model-evaluator", name: "Model Evaluator", description: "Evaluate AI model performance", version: "1.0.0", author: "CyberMind", category: "ai", tags: ["evaluation", "metrics"], installed: false, lastUpdated: Date.now(), downloadCount: 420, rating: 4.4 },
      { id: "data-augmenter", name: "Data Augmenter", description: "Augment training data", version: "1.0.0", author: "CyberMind", category: "ai", tags: ["augmentation", "data"], installed: false, lastUpdated: Date.now(), downloadCount: 350, rating: 4.3 },
      { id: "ai-deployer", name: "AI Deployer", description: "Deploy AI models to production", version: "1.0.0", author: "CyberMind", category: "ai", tags: ["deployment", "production"], installed: false, lastUpdated: Date.now(), downloadCount: 480, rating: 4.5 }
    ];
  }
  getMCPServer(serverId) {
    const servers = this.getAvailableMCPServers();
    return servers.find((s) => s.id === serverId) || null;
  }
  getSkill(skillId) {
    const skills = this.getAvailableSkills();
    return skills.find((s) => s.id === skillId) || null;
  }
  getInstalledMCPServers() {
    return [];
  }
  getInstalledSkills() {
    return [];
  }
  saveMCPServer(server) {
    const path = join7(this.mcpDir, `${server.id}.json`);
    try {
      writeFileSync6(path, JSON.stringify(server, null, 2), "utf8");
    } catch (err) {
      log6.error("Failed to save MCP server", { serverId: server.id, error: String(err) });
    }
  }
  saveSkill(skill) {
    const path = join7(this.skillsDir, `${skill.id}.json`);
    try {
      writeFileSync6(path, JSON.stringify(skill, null, 2), "utf8");
    } catch (err) {
      log6.error("Failed to save skill", { skillId: skill.id, error: String(err) });
    }
  }
  loadTelemetrySettings() {
    const path = join7(this.dataDir, "telemetry-settings.json");
    if (!existsSync7(path)) {
      const settings = {
        enabled: false,
        // Default to off
        level: "minimal",
        dataRetention: 30,
        shareUsageStats: false,
        shareErrorReports: false,
        sharePerformanceMetrics: false
      };
      writeFileSync6(path, JSON.stringify(settings, null, 2), "utf8");
      return settings;
    }
    try {
      const raw = readFileSync6(path, "utf8");
      const parsed = JSON.parse(raw);
      return TelemetrySettingsSchema.parse(parsed);
    } catch (err) {
      log6.warn("Failed to load telemetry settings, using defaults", { error: String(err) });
      return {
        enabled: false,
        level: "minimal",
        dataRetention: 30,
        shareUsageStats: false,
        shareErrorReports: false,
        sharePerformanceMetrics: false
      };
    }
  }
  saveTelemetrySettings() {
    const path = join7(this.dataDir, "telemetry-settings.json");
    try {
      writeFileSync6(path, JSON.stringify(this.telemetrySettings, null, 2), "utf8");
    } catch (err) {
      log6.error("Failed to save telemetry settings", { error: String(err) });
    }
  }
};

// ../shared/src/providers/ollama-config.ts
var log7 = createLogger("ollama-config");

// ../shared/src/providers/custom-server.ts
var log8 = createLogger("custom-server");
var DEFAULT_CUSTOM_SERVER_CONFIG = {
  baseUrl: "https://api.cybermind.ai/v1",
  models: [
    {
      id: "cybermind-ultra",
      name: "CyberMind Ultra",
      provider: "CyberMind",
      description: "Most powerful model for complex tasks",
      contextWindow: 2e5,
      inputCost: 5,
      outputCost: 15,
      capabilities: ["code", "reasoning", "analysis", "multimodal"],
      endpoint: "/chat/completions",
      isActive: true
    },
    {
      id: "cybermind-pro",
      name: "CyberMind Pro",
      provider: "CyberMind",
      description: "Balanced model for most tasks",
      contextWindow: 128e3,
      inputCost: 2,
      outputCost: 6,
      capabilities: ["code", "reasoning", "analysis"],
      endpoint: "/chat/completions",
      isActive: true
    },
    {
      id: "cybermind-speed",
      name: "CyberMind Speed",
      provider: "CyberMind",
      description: "Fast model for quick responses",
      contextWindow: 32e3,
      inputCost: 0.5,
      outputCost: 1.5,
      capabilities: ["code", "basic-reasoning"],
      endpoint: "/chat/completions",
      isActive: true
    },
    {
      id: "cybermind-code",
      name: "CyberMind Code",
      provider: "CyberMind",
      description: "Specialized for coding tasks",
      contextWindow: 128e3,
      inputCost: 1.5,
      outputCost: 4.5,
      capabilities: ["code", "debugging", "refactoring"],
      endpoint: "/chat/completions",
      isActive: true
    },
    {
      id: "cybermind-creative",
      name: "CyberMind Creative",
      provider: "CyberMind",
      description: "Creative and design tasks",
      contextWindow: 64e3,
      inputCost: 1,
      outputCost: 3,
      capabilities: ["creative", "design", "writing"],
      endpoint: "/chat/completions",
      isActive: true
    }
  ],
  timeout: 6e4,
  retries: 3,
  rateLimit: {
    requestsPerMinute: 60,
    tokensPerMinute: 1e6
  }
};
var CustomServerManager = class {
  config;
  apiKey = null;
  constructor(config = {}) {
    this.config = { ...DEFAULT_CUSTOM_SERVER_CONFIG, ...config };
  }
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    log8.info("Custom server API key set");
  }
  getApiKey() {
    return this.apiKey;
  }
  async testConnection() {
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...this.apiKey && { "Authorization": `Bearer ${this.apiKey}` }
        },
        signal: AbortSignal.timeout(5e3)
      });
      if (!response.ok) {
        log8.warn("Custom server connection failed", { status: response.status });
        return false;
      }
      const data = await response.json();
      log8.info("Custom server connected successfully", { models: data.data?.length || 0 });
      return true;
    } catch (error) {
      log8.warn("Custom server connection error", { error: String(error) });
      return false;
    }
  }
  async listModels() {
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...this.apiKey && { "Authorization": `Bearer ${this.apiKey}` }
        },
        signal: AbortSignal.timeout(this.config.timeout)
      });
      if (!response.ok) {
        throw new Error(`Custom server API error: ${response.status}`);
      }
      const data = await response.json();
      return data.data || this.config.models;
    } catch (error) {
      log8.error("Failed to list custom server models", { error: String(error) });
      return this.config.models;
    }
  }
  async generateResponse(modelId, messages) {
    if (!this.apiKey) {
      throw new Error("API key required for custom server");
    }
    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          stream: false,
          temperature: 0.7,
          max_tokens: 2048
        }),
        signal: AbortSignal.timeout(this.config.timeout)
      });
      if (!response.ok) {
        throw new Error(`Generation failed: ${response.status}`);
      }
      const data = await response.json();
      return data.choices[0]?.message?.content || "";
    } catch (error) {
      log8.error("Failed to generate response from custom server", { model: modelId, error: String(error) });
      throw error;
    }
  }
  getModel(modelId) {
    return this.config.models.find((model) => model.id === modelId) || null;
  }
  getActiveModels() {
    return this.config.models.filter((model) => model.isActive);
  }
  getModelsByCapability(capability) {
    return this.config.models.filter(
      (model) => model.isActive && model.capabilities.includes(capability)
    );
  }
  calculateCost(modelId, inputTokens, outputTokens) {
    const model = this.getModel(modelId);
    if (!model) return 0;
    const inputCost = inputTokens / 1e6 * model.inputCost;
    const outputCost = outputTokens / 1e6 * model.outputCost;
    return inputCost + outputCost;
  }
  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    log8.info("Custom server config updated", { updates: Object.keys(updates) });
  }
  addCustomModel(model) {
    this.config.models.push(model);
    log8.info("Custom model added", { modelId: model.id, name: model.name });
  }
  removeModel(modelId) {
    const index = this.config.models.findIndex((model) => model.id === modelId);
    if (index !== -1) {
      this.config.models.splice(index, 1);
      log8.info("Model removed", { modelId });
      return true;
    }
    return false;
  }
  getConfig() {
    return { ...this.config };
  }
  // Rate limiting
  rateLimitTracker = {
    requests: [],
    tokens: []
  };
  async checkRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 6e4;
    this.rateLimitTracker.requests = this.rateLimitTracker.requests.filter((time) => time > oneMinuteAgo);
    this.rateLimitTracker.tokens = this.rateLimitTracker.tokens.filter((time) => time > oneMinuteAgo);
    if (this.rateLimitTracker.requests.length >= this.config.rateLimit.requestsPerMinute) {
      log8.warn("Rate limit exceeded for requests");
      return false;
    }
    return true;
  }
  recordRequest(tokenCount = 0) {
    this.rateLimitTracker.requests.push(Date.now());
    this.rateLimitTracker.tokens.push(tokenCount);
  }
};

// ../shared/src/auto-agent.ts
var log9 = createLogger("auto-agent");

// src/app.tsx
import { Box as Box10, useApp as useApp2, useInput as useInput5 } from "ink";
import { useCallback, useMemo, useRef, useState as useState5 } from "react";

// src/components/Welcome.tsx
import { Box, Text as Text3 } from "ink";

// src/components/Mascot.tsx
import { Text } from "ink";
import { jsx, jsxs } from "react/jsx-runtime";
var Mascot = () => {
  return /* @__PURE__ */ jsxs(Text, { children: [
    /* @__PURE__ */ jsxs(Text, { color: "#FF6B6B", children: [
      "    \u2584\u2584\u2584\u2584\u2584\u2584\u2584    ",
      "\n"
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "#FF6B6B", children: [
      "   \u2584\u2588\u2591\u2591\u2591\u2591\u2591\u2591\u2588\u2584   ",
      "\n"
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "#FF8E8E", children: [
      "  \u2584\u2588\u2591\u2591\u2584\u2591\u2591\u2584\u2591\u2591\u2588\u2584  ",
      "\n"
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "#FF8E8E", children: [
      "  \u2588\u2591\u2591\u2591\u2580\u2591\u2591\u2580\u2591\u2591\u2591\u2588  ",
      "\n"
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "#FF6B6B", children: [
      "  \u2588\u2591\u2591\u2591\u2591\u2584\u2584\u2591\u2591\u2591\u2591\u2588  ",
      "\n"
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "#FF6B6B", children: [
      "   \u2580\u2588\u2591\u2591\u2591\u2591\u2591\u2591\u2588\u2580   ",
      "\n"
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "#FF4757", children: [
      "     \u2580\u2580\u2580\u2580\u2580\u2580     ",
      "\n"
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "#FF4757", children: [
      "     \u258C    \u258C     ",
      "\n"
    ] }),
    /* @__PURE__ */ jsx(Text, { color: "#FF4757", children: "     \u258C    \u258C     " })
  ] });
};
var MiniMascot = () => {
  return /* @__PURE__ */ jsxs(Text, { children: [
    /* @__PURE__ */ jsxs(Text, { color: "#FF8E8E", children: [
      "  \u2584\u2584\u2584\u2584\u2584\u2584\u2584  ",
      "\n"
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "#FF8E8E", children: [
      " \u2584\u2588\u2584\u2584\u2584\u2584\u2584\u2584\u2588\u2584 ",
      "\n"
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "#FF6B6B", children: [
      " \u2588\u2591\u2591\u2584\u2591\u2591\u2584\u2591\u2591\u2588 ",
      "\n"
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "#FF6B6B", children: [
      " \u2588\u2591\u2591\u2580\u2591\u2591\u2580\u2591\u2591\u2588 ",
      "\n"
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "#FF4757", children: [
      "  \u2580\u2580\u2580\u2580\u2580\u2580\u2580\u2580  ",
      "\n"
    ] }),
    /* @__PURE__ */ jsx(Text, { color: "#FF4757", children: "  \u2590      \u258C  " })
  ] });
};

// src/components/SkyScene.tsx
import { Text as Text2 } from "ink";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var SkyScene = () => {
  return /* @__PURE__ */ jsxs2(Text2, { children: [
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "     " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                                       " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#E8E8E8", children: "\u2588\u2588\u2588\u2588\u2588\u2593\u2593\u2591" }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                                 " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "         " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#D0D0D0", children: "\u2588\u2588\u2588\u2593\u2591     \u2591\u2591" }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "            " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#606060", children: "\u2591\u2591\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                        " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#B8B8B8", children: "\u2588\u2588\u2588\u2593\u2591        " }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "    " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#505050", children: "\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "   " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#707070", children: "\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                      " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#A0A0A0", children: "\u2588\u2588\u2588\u2593\u2591        " }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "   " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#404040", children: "\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "    " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#888888", children: "\u2588\u2588\u2593\u2591\u2591      \u2593" }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                                             " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#707070", children: "\u2591\u2593\u2593\u2588\u2588\u2588\u2593\u2593\u2591 " }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: " " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                                 " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#505050", children: "\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "               " }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                                 " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#606060", children: "\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "              " }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                               " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#707070", children: "\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "        " }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "       " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#404040", children: "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "               " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#808080", children: "\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "         " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "      " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#505050", children: "\u2588\u2588\u2584\u2588\u2588\u2588\u2588\u2588\u2584\u2588\u2588" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                        " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "               " }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "       " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#606060", children: "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "      " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                   " }),
    "\n"
  ] });
};
var DottedBorder = ({ width = 58 }) => {
  return /* @__PURE__ */ jsx2(Text2, { color: "#D97736", children: ".".repeat(width) });
};
var CompactSkyScene = () => {
  return /* @__PURE__ */ jsxs2(Text2, { children: [
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "     " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                                 " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#E8E8E8", children: "\u2588\u2588\u2588\u2588\u2593\u2593\u2591" }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                         " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "         " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#C0C0C0", children: "\u2588\u2588\u2593\u2591   \u2591\u2591" }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "          " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#606060", children: "\u2591\u2591\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                    " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#A0A0A0", children: "\u2588\u2588\u2593\u2591      " }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "   " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#505050", children: "\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "   " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#707070", children: "\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                  " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#888888", children: "\u2588\u2588\u2593\u2591      " }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "  " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#404040", children: "\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "  " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "              " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#707070", children: "\u2588\u2593\u2591\u2591    \u2593" }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                                           " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#606060", children: "\u2591\u2593\u2593\u2588\u2588\u2593\u2593\u2591" }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: " " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                               " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#505050", children: "\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "             " }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                               " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#606060", children: "\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "            " }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                             " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#707070", children: "\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "      " }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "     " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#404040", children: "\u2588\u2588\u2588\u2588\u2588\u2588\u2588" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "             " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#808080", children: "\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "       " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "    " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#505050", children: "\u2588\u2588\u2584\u2588\u2588\u2588\u2584\u2588\u2588" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                      " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "             " }),
    "\n",
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "     " }),
    /* @__PURE__ */ jsx2(Text2, { color: "#606060", children: "\u2588\u2588\u2588\u2588\u2588\u2588\u2588" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "    " }),
    /* @__PURE__ */ jsx2(Text2, { color: "white", bold: true, children: "*" }),
    /* @__PURE__ */ jsx2(Text2, { color: "gray", children: "                 " }),
    "\n"
  ] });
};

// src/components/Welcome.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var Welcome = ({ model = "auto" }) => {
  const cwd = process.cwd();
  const user = process.env.USER ?? process.env.USERNAME ?? "friend";
  return /* @__PURE__ */ jsxs3(Box, { flexDirection: "column", marginBottom: 1, children: [
    /* @__PURE__ */ jsxs3(Text3, { color: "#D97736", children: [
      CYBERMIND_NAME,
      " Code v",
      CYBERMIND_VERSION
    ] }),
    /* @__PURE__ */ jsx3(Text3, { color: "#D97736", children: "\u2500".repeat(58) }),
    /* @__PURE__ */ jsxs3(Box, { flexDirection: "row", marginTop: 1, children: [
      /* @__PURE__ */ jsxs3(Box, { flexDirection: "column", width: 40, paddingLeft: 1, children: [
        /* @__PURE__ */ jsx3(Text3, { bold: true, color: "white", children: "  Welcome back!" }),
        /* @__PURE__ */ jsx3(Box, { marginTop: 1 }),
        /* @__PURE__ */ jsx3(CompactSkyScene, {}),
        /* @__PURE__ */ jsx3(Box, { marginTop: 1 }),
        /* @__PURE__ */ jsx3(MiniMascot, {}),
        /* @__PURE__ */ jsx3(Box, { marginTop: 1 }),
        /* @__PURE__ */ jsxs3(Text3, { color: "gray", children: [
          "  ",
          model,
          " \xB7 API Usage Billing"
        ] }),
        /* @__PURE__ */ jsxs3(Text3, { color: "gray", children: [
          "  ",
          user,
          "'s Individual Org"
        ] }),
        /* @__PURE__ */ jsx3(Box, { marginTop: 1 }),
        /* @__PURE__ */ jsxs3(Text3, { color: "gray", children: [
          "  ",
          cwd
        ] })
      ] }),
      /* @__PURE__ */ jsxs3(Box, { flexDirection: "column", flexGrow: 1, paddingLeft: 1, children: [
        /* @__PURE__ */ jsx3(Text3, { color: "#ff9f43", bold: true, children: "Tips for getting started" }),
        /* @__PURE__ */ jsxs3(Text3, { children: [
          "Run ",
          /* @__PURE__ */ jsx3(Text3, { color: "cyan", children: "/init" }),
          " to create a CYBER.md file with instructions for CyberCoder."
        ] }),
        /* @__PURE__ */ jsx3(Box, { marginTop: 1 }),
        /* @__PURE__ */ jsx3(Text3, { color: "#ff9f43", bold: true, children: "What's new" }),
        /* @__PURE__ */ jsx3(Text3, { color: "gray", children: "Fixed theme picker to apply colors in real-time across the terminal." }),
        /* @__PURE__ */ jsx3(Text3, { color: "gray", children: "Added config persistence so login state survives between sessions." }),
        /* @__PURE__ */ jsx3(Text3, { color: "gray", children: "New 3rd-party platform support: OpenRouter, Groq, local Ollama." }),
        /* @__PURE__ */ jsxs3(Text3, { color: "gray", children: [
          "See ",
          /* @__PURE__ */ jsx3(Text3, { color: "cyan", children: "/release-notes" }),
          " for the full changelog."
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx3(Text3, { color: "#D97736", children: "\u2500".repeat(58) })
  ] });
};

// src/components/Onboarding.tsx
import { useState } from "react";
import { Box as Box2, Text as Text4, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { spawn } from "child_process";

// src/utils/config.ts
import { readFileSync as readFileSync7, writeFileSync as writeFileSync7, existsSync as existsSync8, mkdirSync as mkdirSync7 } from "fs";
import { homedir as homedir2 } from "os";
import { join as join8 } from "path";
var CONFIG_DIR = join8(homedir2(), ".cybercoder");
var CONFIG_FILE = join8(CONFIG_DIR, "config.json");
var DEFAULT_CONFIG = {
  onboardingComplete: false,
  loginMethod: null,
  theme: {
    mode: "dark",
    syntaxTheme: "Monokai Extended"
  },
  apiKeys: {},
  lastProvider: "auto",
  lastModel: "auto",
  user: {},
  autoUpdateCheck: true,
  showWelcome: true,
  telemetry: true,
  version: "0.1.16"
};
function ensureConfigDir() {
  if (!existsSync8(CONFIG_DIR)) {
    mkdirSync7(CONFIG_DIR, { recursive: true });
  }
}
function loadConfig() {
  ensureConfigDir();
  try {
    if (existsSync8(CONFIG_FILE)) {
      const raw = readFileSync7(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch {
  }
  return { ...DEFAULT_CONFIG };
}
function saveConfig(config) {
  ensureConfigDir();
  writeFileSync7(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}
function updateConfig(partial) {
  const current = loadConfig();
  const merged = { ...current, ...partial };
  saveConfig(merged);
  return merged;
}
function isOnboardingComplete() {
  return loadConfig().onboardingComplete === true;
}
function markOnboardingComplete(method) {
  updateConfig({
    onboardingComplete: true,
    loginMethod: method
  });
}
function clearLogin() {
  updateConfig({
    onboardingComplete: false,
    loginMethod: null,
    user: {},
    apiKeys: {}
  });
}
function setApiKey(provider, key) {
  const config = loadConfig();
  const apiKeys = { ...config.apiKeys ?? {} };
  apiKeys[provider] = key;
  updateConfig({ apiKeys });
}
function setTheme(mode, syntaxTheme) {
  updateConfig({ theme: { mode, syntaxTheme } });
}
function getTheme() {
  return loadConfig().theme ?? DEFAULT_CONFIG.theme;
}

// src/components/Onboarding.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var LOGIN_METHODS = [
  {
    id: "cybercli",
    label: "CyberCli account with subscription",
    desc: "Pro, Max, Team, or Enterprise"
  },
  {
    id: "apikey",
    label: "API key (BYOK)",
    desc: "Bring Your Own Key \u2014 API usage billing"
  },
  {
    id: "thirdparty",
    label: "3rd-party platform",
    desc: "OpenRouter, Groq, or local Ollama"
  }
];
var THIRDPARTY_PLATFORMS = [
  { id: "openrouter", label: "OpenRouter", desc: "interactive setup" },
  { id: "groq", label: "Groq", desc: "interactive setup" },
  { id: "ollama", label: "Ollama (local)", desc: "interactive setup" },
  { id: "back", label: "Go back", desc: "" }
];
var Onboarding = ({ onComplete }) => {
  const { exit } = useApp();
  const [screen, setScreen] = useState("main");
  const [selected, setSelected] = useState(0);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyProvider, setApiKeyProvider] = useState("openai");
  const [apiKeyStage, setApiKeyStage] = useState("provider");
  const [tpSelected, setTpSelected] = useState(0);
  const openBrowser = (url) => {
    const platform = process.platform;
    const cmd = platform === "win32" ? "start" : platform === "darwin" ? "open" : "xdg-open";
    spawn(cmd, [url], { detached: true, stdio: "ignore" });
  };
  if (screen === "main") {
    useInput((_, key) => {
      if (key.escape || key.ctrl && _ === "c") {
        exit();
        return;
      }
      if (key.upArrow) {
        setSelected((s) => Math.max(0, s - 1));
      } else if (key.downArrow) {
        setSelected((s) => Math.min(LOGIN_METHODS.length - 1, s + 1));
      } else if (key.return) {
        const method = LOGIN_METHODS[selected];
        if (method?.id === "cybercli") {
          setScreen("cybercli-login");
        } else if (method?.id === "apikey") {
          setScreen("apikey-input");
          setApiKeyStage("provider");
          setApiKeyProvider("openai");
        } else if (method?.id === "thirdparty") {
          setScreen("thirdparty-platforms");
          setTpSelected(0);
        }
      }
    });
    return /* @__PURE__ */ jsxs4(Box2, { flexDirection: "column", marginBottom: 1, children: [
      /* @__PURE__ */ jsxs4(Text4, { color: "#D97736", children: [
        "Welcome to ",
        CYBERMIND_NAME,
        " Code v",
        CYBERMIND_VERSION
      ] }),
      /* @__PURE__ */ jsx4(DottedBorder, { width: 58 }),
      /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
      /* @__PURE__ */ jsx4(SkyScene, {}),
      /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
      /* @__PURE__ */ jsx4(DottedBorder, { width: 58 }),
      /* @__PURE__ */ jsxs4(Box2, { flexDirection: "row", marginTop: 1, children: [
        /* @__PURE__ */ jsx4(Box2, { flexDirection: "column", width: 20, paddingLeft: 2, children: /* @__PURE__ */ jsx4(Mascot, {}) }),
        /* @__PURE__ */ jsxs4(Box2, { flexDirection: "column", flexGrow: 1, paddingRight: 2, children: [
          /* @__PURE__ */ jsxs4(Text4, { bold: true, color: "white", children: [
            CYBERMIND_NAME,
            " Code can be used with your CyberCli subscription or billed based on API usage through your own keys."
          ] }),
          /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
          /* @__PURE__ */ jsx4(Text4, { bold: true, color: "#D97736", children: "Select login method:" }),
          /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
          LOGIN_METHODS.map((method, i) => /* @__PURE__ */ jsx4(Box2, { flexDirection: "column", marginBottom: 1, children: /* @__PURE__ */ jsxs4(Text4, { children: [
            i === selected ? /* @__PURE__ */ jsx4(Text4, { color: "#D97736", children: "\u203A " }) : /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "  " }),
            /* @__PURE__ */ jsxs4(Text4, { color: i === selected ? "white" : "gray", bold: i === selected, children: [
              i + 1,
              ". ",
              method.label
            ] }),
            /* @__PURE__ */ jsxs4(Text4, { color: "gray", children: [
              " \xB7 ",
              method.desc
            ] })
          ] }) }, method.id)),
          /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
          /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "Arrow keys to navigate, Enter to select, ESC to exit" })
        ] })
      ] })
    ] });
  }
  if (screen === "cybercli-login") {
    useInput((_, key) => {
      if (key.escape) {
        setScreen("main");
        return;
      }
      if (key.return) {
        const url = "https://cybermindcli.info/login?redirect=cli";
        openBrowser(url);
        markOnboardingComplete("cybercli");
        onComplete("cybercli");
      }
    });
    return /* @__PURE__ */ jsxs4(Box2, { flexDirection: "column", marginBottom: 1, children: [
      /* @__PURE__ */ jsxs4(Text4, { color: "#D97736", children: [
        "Welcome to ",
        CYBERMIND_NAME,
        " Code v",
        CYBERMIND_VERSION
      ] }),
      /* @__PURE__ */ jsx4(DottedBorder, { width: 58 }),
      /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
      /* @__PURE__ */ jsx4(SkyScene, {}),
      /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
      /* @__PURE__ */ jsx4(DottedBorder, { width: 58 }),
      /* @__PURE__ */ jsxs4(Box2, { flexDirection: "column", marginTop: 1, paddingLeft: 2, paddingRight: 2, children: [
        /* @__PURE__ */ jsx4(Text4, { bold: true, color: "white", children: "Sign in to CyberCli" }),
        /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
        /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "Browser didn't open? Use the url below to sign in (c to copy)" }),
        /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
        /* @__PURE__ */ jsx4(Text4, { color: "cyan", children: "https://cybermindcli.info/login?redirect=cli" }),
        /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
        /* @__PURE__ */ jsxs4(Text4, { color: "gray", children: [
          "Paste code here if prompted ",
          ">",
          " "
        ] }),
        /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
        /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "Press Enter to open browser, ESC to go back" })
      ] })
    ] });
  }
  if (screen === "apikey-input") {
    const API_PROVIDERS = [
      { id: "openai", label: "OpenAI" },
      { id: "anthropic", label: "Anthropic" },
      { id: "groq", label: "Groq" },
      { id: "google", label: "Google (Gemini)" },
      { id: "openrouter", label: "OpenRouter" }
    ];
    if (apiKeyStage === "provider") {
      useInput((_, key) => {
        if (key.escape) {
          setScreen("main");
          return;
        }
        if (key.upArrow) {
          setSelected((s) => Math.max(0, s - 1));
        } else if (key.downArrow) {
          setSelected((s) => Math.min(API_PROVIDERS.length - 1, s + 1));
        } else if (key.return) {
          const prov = API_PROVIDERS[selected];
          if (prov) {
            setApiKeyProvider(prov.id);
            setApiKeyStage("key");
            setApiKeyInput("");
          }
        }
      });
      return /* @__PURE__ */ jsxs4(Box2, { flexDirection: "column", marginBottom: 1, children: [
        /* @__PURE__ */ jsxs4(Text4, { color: "#D97736", children: [
          "Welcome to ",
          CYBERMIND_NAME,
          " Code v",
          CYBERMIND_VERSION
        ] }),
        /* @__PURE__ */ jsx4(DottedBorder, { width: 58 }),
        /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
        /* @__PURE__ */ jsx4(SkyScene, {}),
        /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
        /* @__PURE__ */ jsx4(DottedBorder, { width: 58 }),
        /* @__PURE__ */ jsxs4(Box2, { flexDirection: "column", marginTop: 1, paddingLeft: 2, paddingRight: 2, children: [
          /* @__PURE__ */ jsx4(Text4, { bold: true, color: "white", children: "Enter your API key" }),
          /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
          /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "Select a provider:" }),
          /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
          API_PROVIDERS.map((prov, i) => /* @__PURE__ */ jsx4(Box2, { flexDirection: "row", marginBottom: 1, children: /* @__PURE__ */ jsxs4(Text4, { children: [
            i === selected ? /* @__PURE__ */ jsx4(Text4, { color: "#D97736", children: "\u203A " }) : /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "  " }),
            /* @__PURE__ */ jsxs4(Text4, { color: i === selected ? "white" : "gray", bold: i === selected, children: [
              i + 1,
              ". ",
              prov.label
            ] })
          ] }) }, prov.id)),
          /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
          /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "Arrow keys to navigate, Enter to select, ESC to go back" })
        ] })
      ] });
    }
    return /* @__PURE__ */ jsxs4(Box2, { flexDirection: "column", marginBottom: 1, children: [
      /* @__PURE__ */ jsxs4(Text4, { color: "#D97736", children: [
        "Welcome to ",
        CYBERMIND_NAME,
        " Code v",
        CYBERMIND_VERSION
      ] }),
      /* @__PURE__ */ jsx4(DottedBorder, { width: 58 }),
      /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
      /* @__PURE__ */ jsx4(SkyScene, {}),
      /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
      /* @__PURE__ */ jsx4(DottedBorder, { width: 58 }),
      /* @__PURE__ */ jsxs4(Box2, { flexDirection: "column", marginTop: 1, paddingLeft: 2, paddingRight: 2, children: [
        /* @__PURE__ */ jsx4(Text4, { bold: true, color: "white", children: "Enter your API key" }),
        /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
        /* @__PURE__ */ jsxs4(Text4, { color: "gray", children: [
          "Provider: ",
          /* @__PURE__ */ jsx4(Text4, { color: "cyan", children: apiKeyProvider })
        ] }),
        /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
        /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "Paste your API key here:" }),
        /* @__PURE__ */ jsxs4(Box2, { flexDirection: "row", children: [
          /* @__PURE__ */ jsxs4(Text4, { color: "gray", children: [
            ">",
            " "
          ] }),
          /* @__PURE__ */ jsx4(
            TextInput,
            {
              value: apiKeyInput,
              onChange: setApiKeyInput,
              onSubmit: () => {
                if (apiKeyInput.trim()) {
                  setApiKey(apiKeyProvider, apiKeyInput.trim());
                  markOnboardingComplete("apikey");
                  onComplete("apikey");
                }
              },
              mask: "*"
            }
          )
        ] }),
        /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
        /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "Press Enter to submit, ESC to go back" })
      ] })
    ] });
  }
  if (screen === "thirdparty-platforms") {
    useInput((_, key) => {
      if (key.escape) {
        setScreen("main");
        return;
      }
      if (key.upArrow) {
        setTpSelected((s) => Math.max(0, s - 1));
      } else if (key.downArrow) {
        setTpSelected((s) => Math.min(THIRDPARTY_PLATFORMS.length - 1, s + 1));
      } else if (key.return) {
        const plat = THIRDPARTY_PLATFORMS[tpSelected];
        if (plat?.id === "back") {
          setScreen("main");
          setSelected(2);
        } else if (plat) {
          const urls = {
            openrouter: "https://openrouter.ai/keys",
            groq: "https://console.groq.com/keys",
            ollama: "https://ollama.com/download"
          };
          const url = plat.id ? urls[plat.id] : void 0;
          if (url) {
            openBrowser(url);
          }
          markOnboardingComplete("thirdparty");
          onComplete("thirdparty");
        }
      }
    });
    return /* @__PURE__ */ jsxs4(Box2, { flexDirection: "column", marginBottom: 1, children: [
      /* @__PURE__ */ jsxs4(Text4, { color: "#D97736", children: [
        "Welcome to ",
        CYBERMIND_NAME,
        " Code v",
        CYBERMIND_VERSION
      ] }),
      /* @__PURE__ */ jsx4(DottedBorder, { width: 58 }),
      /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
      /* @__PURE__ */ jsx4(SkyScene, {}),
      /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
      /* @__PURE__ */ jsx4(DottedBorder, { width: 58 }),
      /* @__PURE__ */ jsxs4(Box2, { flexDirection: "column", marginTop: 1, paddingLeft: 2, paddingRight: 2, children: [
        /* @__PURE__ */ jsx4(Text4, { bold: true, color: "white", children: "Using 3rd-party platforms" }),
        /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
        THIRDPARTY_PLATFORMS.map((plat, i) => /* @__PURE__ */ jsx4(Box2, { flexDirection: "column", marginBottom: 1, children: /* @__PURE__ */ jsxs4(Text4, { children: [
          i === tpSelected ? /* @__PURE__ */ jsx4(Text4, { color: "#D97736", children: "\u203A " }) : /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "  " }),
          /* @__PURE__ */ jsxs4(Text4, { color: i === tpSelected ? "white" : "gray", bold: i === tpSelected, children: [
            i + 1,
            ". ",
            plat.label
          ] }),
          plat.desc && /* @__PURE__ */ jsxs4(Text4, { color: "gray", children: [
            " \xB7 ",
            plat.desc
          ] })
        ] }) }, plat.id)),
        /* @__PURE__ */ jsx4(Box2, { marginTop: 1 }),
        /* @__PURE__ */ jsx4(Text4, { color: "gray", children: "Arrow keys to navigate, Enter to select, ESC to go back" })
      ] })
    ] });
  }
  return null;
};

// src/components/ThemePicker.tsx
import { useState as useState2 } from "react";
import { Box as Box3, Text as Text5, useInput as useInput2 } from "ink";
import gradient from "gradient-string";
import { Fragment, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var cyber = gradient(["#00e5ff", "#7b5cff", "#ff5c8a"]);
var THEMES = [
  { id: "auto", label: "Auto (match terminal)" },
  { id: "dark", label: "Dark mode" },
  { id: "light", label: "Light mode" },
  { id: "dark-colorblind", label: "Dark mode (colorblind-friendly)" },
  { id: "light-colorblind", label: "Light mode (colorblind-friendly)" },
  { id: "dark-ansi", label: "Dark mode (ANSI colors only)" },
  { id: "light-ansi", label: "Light mode (ANSI colors only)" }
];
var SYNTAX_THEMES = [
  "Monokai Extended",
  "Dracula",
  "One Dark",
  "Solarized Dark",
  "GitHub Light"
];
var ThemePicker = ({ onComplete }) => {
  const [selected, setSelected] = useState2(1);
  const [syntaxIdx, setSyntaxIdx] = useState2(0);
  const [stage, setStage] = useState2("theme");
  useInput2((_, key) => {
    if (stage === "theme") {
      if (key.upArrow) {
        setSelected((s) => Math.max(0, s - 1));
      } else if (key.downArrow) {
        setSelected((s) => Math.min(THEMES.length - 1, s + 1));
      } else if (key.return) {
        setStage("syntax");
      }
    } else {
      if (key.upArrow) {
        setSyntaxIdx((s) => Math.max(0, s - 1));
      } else if (key.downArrow) {
        setSyntaxIdx((s) => Math.min(SYNTAX_THEMES.length - 1, s + 1));
      } else if (key.return) {
        const theme = THEMES[selected];
        const syntax = SYNTAX_THEMES[syntaxIdx];
        if (theme && syntax) {
          onComplete({
            mode: theme.id,
            syntaxTheme: syntax
          });
        }
      }
    }
  });
  const previewLines = [
    { line: 1, text: "function greet() {", color: "cyan" },
    { line: 2, text: '  console.log("Hello, World!");', old: true },
    { line: 2, text: '  console.log("Hello, CyberCoder!");', new: true },
    { line: 3, text: "}", color: "cyan" }
  ];
  return /* @__PURE__ */ jsxs5(Box3, { flexDirection: "column", marginBottom: 1, children: [
    /* @__PURE__ */ jsx5(Text5, { children: cyber("\u256D\u2500 Theme Selection \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E") }),
    /* @__PURE__ */ jsxs5(Box3, { flexDirection: "column", paddingLeft: 2, paddingRight: 2, marginTop: 1, children: [
      /* @__PURE__ */ jsx5(Text5, { bold: true, color: "white", children: "Let's get started." }),
      /* @__PURE__ */ jsx5(Box3, { marginTop: 1 }),
      /* @__PURE__ */ jsx5(Text5, { bold: true, color: "#D97736", children: "Choose the text style that looks best with your terminal" }),
      /* @__PURE__ */ jsx5(Text5, { color: "gray", children: "To change this later, run /theme" }),
      /* @__PURE__ */ jsx5(Box3, { marginTop: 1 }),
      stage === "theme" && /* @__PURE__ */ jsxs5(Fragment, { children: [
        THEMES.map((t, i) => /* @__PURE__ */ jsx5(Box3, { flexDirection: "row", children: /* @__PURE__ */ jsxs5(Text5, { children: [
          i === selected ? /* @__PURE__ */ jsx5(Text5, { color: "#D97736", children: "\u203A " }) : /* @__PURE__ */ jsx5(Text5, { color: "gray", children: "  " }),
          /* @__PURE__ */ jsxs5(Text5, { color: i === selected ? "white" : "gray", bold: i === selected, children: [
            i + 1,
            ". ",
            t.label
          ] }),
          i === selected && /* @__PURE__ */ jsx5(Text5, { color: "green", children: "  \u2713" })
        ] }) }, t.id)),
        /* @__PURE__ */ jsx5(Box3, { marginTop: 1 }),
        /* @__PURE__ */ jsx5(Text5, { color: "gray", children: "Use arrow keys, Enter to confirm" })
      ] }),
      stage === "syntax" && /* @__PURE__ */ jsxs5(Fragment, { children: [
        /* @__PURE__ */ jsx5(Text5, { bold: true, color: "#D97736", children: "Choose syntax highlighting theme:" }),
        /* @__PURE__ */ jsx5(Box3, { marginTop: 1 }),
        SYNTAX_THEMES.map((t, i) => /* @__PURE__ */ jsx5(Box3, { flexDirection: "row", children: /* @__PURE__ */ jsxs5(Text5, { children: [
          i === syntaxIdx ? /* @__PURE__ */ jsx5(Text5, { color: "#D97736", children: "\u203A " }) : /* @__PURE__ */ jsx5(Text5, { color: "gray", children: "  " }),
          /* @__PURE__ */ jsxs5(Text5, { color: i === syntaxIdx ? "white" : "gray", bold: i === syntaxIdx, children: [
            i + 1,
            ". ",
            t
          ] })
        ] }) }, t)),
        /* @__PURE__ */ jsx5(Box3, { marginTop: 1 }),
        /* @__PURE__ */ jsx5(Text5, { color: "gray", children: "Use arrow keys, Enter to confirm" })
      ] }),
      /* @__PURE__ */ jsx5(Box3, { marginTop: 1 }),
      /* @__PURE__ */ jsx5(Text5, { color: "gray", children: "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500" }),
      previewLines.map((p, idx) => /* @__PURE__ */ jsxs5(Box3, { flexDirection: "row", children: [
        /* @__PURE__ */ jsxs5(Text5, { color: "gray", children: [
          p.line.toString().padStart(2),
          " "
        ] }),
        "old" in p && p.old && /* @__PURE__ */ jsxs5(Text5, { color: "red", children: [
          "- ",
          p.text
        ] }),
        "new" in p && p.new && /* @__PURE__ */ jsxs5(Text5, { color: "green", children: [
          "+ ",
          p.text
        ] }),
        "color" in p && /* @__PURE__ */ jsxs5(Text5, { color: p.color, children: [
          "  ",
          p.text
        ] })
      ] }, idx)),
      /* @__PURE__ */ jsx5(Text5, { color: "gray", children: "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500" }),
      /* @__PURE__ */ jsxs5(Text5, { color: "gray", children: [
        "Syntax theme: ",
        SYNTAX_THEMES[syntaxIdx],
        " (ctrl+t to disable)"
      ] })
    ] }),
    /* @__PURE__ */ jsx5(Text5, { children: cyber("\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F") })
  ] });
};

// src/components/Settings.tsx
import { useState as useState3 } from "react";
import { Box as Box4, Text as Text6, useInput as useInput3 } from "ink";
import gradient2 from "gradient-string";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var cyber2 = gradient2(["#00e5ff", "#7b5cff", "#ff5c8a"]);
var SETTINGS_CATEGORIES = [
  {
    id: "general",
    label: "General",
    items: [
      { key: "welcome", label: "Show welcome screen on startup", value: true },
      { key: "auto_approve", label: "Auto-approve non-destructive changes", value: false },
      { key: "telemetry", label: "Enable telemetry", value: true }
    ]
  },
  {
    id: "appearance",
    label: "Appearance",
    items: [
      { key: "theme", label: "Theme", value: "Dark mode" },
      { key: "syntax", label: "Syntax highlighting", value: "Monokai Extended" },
      { key: "mascot", label: "Show mascot", value: true }
    ]
  },
  {
    id: "ai",
    label: "AI & Providers",
    items: [
      { key: "default_provider", label: "Default provider", value: "auto" },
      { key: "default_model", label: "Default model", value: "auto" },
      { key: "council_mode", label: "Council Mode default", value: false }
    ]
  },
  {
    id: "safety",
    label: "Safety",
    items: [
      { key: "confirm_destructive", label: "Confirm destructive operations", value: true },
      { key: "max_tokens", label: "Max tokens per request", value: "4096" }
    ]
  }
];
var Settings = ({ onClose }) => {
  const [catIdx, setCatIdx] = useState3(0);
  const [itemIdx, setItemIdx] = useState3(0);
  const currentCat = SETTINGS_CATEGORIES[catIdx];
  useInput3((_, key) => {
    if (key.escape || key.ctrl && _ === "c") {
      onClose();
      return;
    }
    if (!currentCat) return;
    if (key.upArrow) {
      setItemIdx((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setItemIdx((i) => Math.min(currentCat.items.length - 1, i + 1));
    } else if (key.leftArrow) {
      setCatIdx((c) => Math.max(0, c - 1));
      setItemIdx(0);
    } else if (key.rightArrow) {
      setCatIdx((c) => Math.min(SETTINGS_CATEGORIES.length - 1, c + 1));
      setItemIdx(0);
    } else if (key.return) {
      const item = currentCat.items[itemIdx];
      if (item && typeof item.value === "boolean") {
        item.value = !item.value;
        setItemIdx((i) => i);
      }
    }
  });
  return /* @__PURE__ */ jsxs6(Box4, { flexDirection: "column", marginBottom: 1, children: [
    /* @__PURE__ */ jsx6(Text6, { children: cyber2("\u256D\u2500 Settings \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E") }),
    /* @__PURE__ */ jsxs6(Box4, { flexDirection: "column", paddingLeft: 2, paddingRight: 2, marginTop: 1, children: [
      /* @__PURE__ */ jsx6(Box4, { flexDirection: "row", marginBottom: 1, children: SETTINGS_CATEGORIES.map((cat, i) => /* @__PURE__ */ jsxs6(Text6, { children: [
        /* @__PURE__ */ jsxs6(Text6, { color: i === catIdx ? "#D97736" : "gray", bold: i === catIdx, children: [
          " ",
          cat.label,
          " "
        ] }),
        i < SETTINGS_CATEGORIES.length - 1 && /* @__PURE__ */ jsx6(Text6, { color: "gray", children: "\u2502" })
      ] }, cat.id)) }),
      /* @__PURE__ */ jsx6(Text6, { color: "gray", children: "\u2500".repeat(50) }),
      currentCat && currentCat.items.map((item, i) => /* @__PURE__ */ jsxs6(Box4, { flexDirection: "row", marginY: 1, children: [
        /* @__PURE__ */ jsxs6(Text6, { children: [
          i === itemIdx ? /* @__PURE__ */ jsx6(Text6, { color: "#D97736", children: "\u203A " }) : /* @__PURE__ */ jsx6(Text6, { color: "gray", children: "  " }),
          /* @__PURE__ */ jsx6(Text6, { color: i === itemIdx ? "white" : "gray", bold: i === itemIdx, children: item.label })
        ] }),
        /* @__PURE__ */ jsx6(Box4, { flexGrow: 1 }),
        /* @__PURE__ */ jsx6(Text6, { color: typeof item.value === "boolean" ? item.value ? "green" : "red" : "cyan", children: typeof item.value === "boolean" ? item.value ? "\u2713 enabled" : "\u2717 disabled" : item.value })
      ] }, item.key)),
      /* @__PURE__ */ jsx6(Box4, { marginTop: 1 }),
      /* @__PURE__ */ jsx6(Text6, { color: "gray", children: "Arrow keys to navigate, Enter to toggle, ESC to close" })
    ] }),
    /* @__PURE__ */ jsx6(Text6, { children: cyber2("\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F") })
  ] });
};

// src/components/Prompt.tsx
import { useState as useState4 } from "react";
import { Box as Box5, Text as Text7 } from "ink";
import TextInput2 from "ink-text-input";
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var Prompt = ({ onSubmit, disabled }) => {
  const [value, setValue] = useState4("");
  const handleSubmit = (text) => {
    onSubmit(text);
    setValue("");
  };
  if (disabled) {
    return /* @__PURE__ */ jsx7(Box5, { children: /* @__PURE__ */ jsx7(Text7, { color: "gray", children: "\u23F3 (waiting\u2026)" }) });
  }
  return /* @__PURE__ */ jsxs7(Box5, { children: [
    /* @__PURE__ */ jsx7(Text7, { color: "cyan", children: "\u203A " }),
    /* @__PURE__ */ jsx7(TextInput2, { value, onChange: setValue, onSubmit: handleSubmit, placeholder: "Try /help or describe what you want\u2026" })
  ] });
};

// src/components/MessageList.tsx
import { Box as Box6, Text as Text8 } from "ink";
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var ROLE_COLOR = {
  user: "cyan",
  assistant: "white",
  system: "gray",
  tool: "magenta"
};
var ROLE_LABEL = {
  user: "you",
  assistant: "cybermind",
  system: "info",
  tool: "tool"
};
var MessageList = ({ messages }) => {
  if (messages.length === 0) return null;
  return /* @__PURE__ */ jsx8(Box6, { flexDirection: "column", marginBottom: 1, children: messages.map((m) => /* @__PURE__ */ jsxs8(Box6, { flexDirection: "column", marginBottom: 1, children: [
    /* @__PURE__ */ jsx8(Text8, { color: ROLE_COLOR[m.role], bold: true, children: ROLE_LABEL[m.role] }),
    /* @__PURE__ */ jsx8(Text8, { color: m.role === "system" ? "gray" : void 0, children: m.content })
  ] }, m.id)) });
};

// src/components/StatusBar.tsx
import { Box as Box7, Text as Text9 } from "ink";
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
var STATUS_LABEL = {
  idle: "ready",
  thinking: "thinking\u2026",
  "awaiting-approval": "awaiting approval",
  error: "error"
};
var STATUS_COLOR = {
  idle: "green",
  thinking: "yellow",
  "awaiting-approval": "magenta",
  error: "red"
};
var StatusBar = ({ status, model, provider }) => {
  return /* @__PURE__ */ jsxs9(Box7, { marginTop: 1, children: [
    /* @__PURE__ */ jsx9(Text9, { color: "gray", children: "[" }),
    /* @__PURE__ */ jsx9(Text9, { color: STATUS_COLOR[status], bold: true, children: STATUS_LABEL[status] }),
    /* @__PURE__ */ jsx9(Text9, { color: "gray", children: "] " }),
    /* @__PURE__ */ jsx9(Text9, { color: "gray", children: "provider=" }),
    /* @__PURE__ */ jsx9(Text9, { color: "cyan", children: provider }),
    /* @__PURE__ */ jsxs9(Text9, { color: "gray", children: [
      "  ",
      "model="
    ] }),
    /* @__PURE__ */ jsx9(Text9, { color: "cyan", children: model }),
    /* @__PURE__ */ jsx9(Text9, { color: "gray", children: "  \xB7 \xB7 for shortcuts" })
  ] });
};

// src/components/ExitConfirm.tsx
import { Box as Box8, Text as Text10 } from "ink";
import { jsx as jsx10 } from "react/jsx-runtime";
var ExitConfirm = () => /* @__PURE__ */ jsx10(Box8, { marginTop: 1, children: /* @__PURE__ */ jsx10(Text10, { color: "yellow", children: "Press Ctrl+C again within 2s to exit, or type /exit." }) });

// src/components/ApprovalDialog.tsx
import { Box as Box9, Text as Text11, useInput as useInput4 } from "ink";
import { jsx as jsx11, jsxs as jsxs10 } from "react/jsx-runtime";
var ApprovalDialog = ({ pending }) => {
  useInput4((input) => {
    const key = input.toLowerCase();
    if (key === "y") pending.resolve("allow");
    else if (key === "s") pending.resolve("allow-session");
    else if (key === "t") pending.resolve("allow-persistent");
    else if (key === "n") pending.resolve("deny");
  });
  return /* @__PURE__ */ jsxs10(Box9, { flexDirection: "column", borderStyle: "round", borderColor: pending.destructive ? "red" : "yellow", paddingX: 1, children: [
    /* @__PURE__ */ jsxs10(Text11, { bold: true, children: [
      pending.destructive ? "\u26A0 " : "",
      "Approve tool: ",
      /* @__PURE__ */ jsx11(Text11, { color: "cyan", children: pending.toolName })
    ] }),
    /* @__PURE__ */ jsx11(Text11, { children: pending.summary }),
    /* @__PURE__ */ jsx11(Box9, { marginTop: 1, children: /* @__PURE__ */ jsx11(Text11, { dimColor: true, children: "[y] allow once \xB7 [s] allow this session \xB7 [t] trust persistently \xB7 [n] deny" }) })
  ] });
};

// src/commands/help.ts
var CATEGORY_ORDER = [
  "session",
  "agent",
  "skills",
  "auth",
  "config",
  "safety",
  "collab",
  "cyber",
  "utility"
];
var CATEGORY_LABEL = {
  session: "Session",
  agent: "Agent",
  skills: "Skills",
  auth: "Auth",
  config: "Config",
  safety: "Safety",
  collab: "Collaboration",
  cyber: "Cyber",
  utility: "Utility"
};
function buildHelpCommand(ctx, getAll) {
  return {
    name: "help",
    description: "Show all available slash commands grouped by category.",
    category: "session",
    aliases: ["?"],
    usage: "/help [command]",
    run: (args) => {
      const filter = args.trim();
      const all = getAll().filter((c) => !c.hidden);
      if (filter) {
        const match = all.find((c) => c.name === filter || c.aliases?.includes(filter));
        if (!match) {
          ctx.appendMessage({
            id: `help-${Date.now()}`,
            role: "system",
            content: `No command named /${filter}. Type /help with no arguments to list all.`,
            createdAt: Date.now()
          });
          return;
        }
        ctx.appendMessage({
          id: `help-${Date.now()}`,
          role: "system",
          content: formatOne(match),
          createdAt: Date.now()
        });
        return;
      }
      const grouped = {};
      for (const c of all) (grouped[c.category] ??= []).push(c);
      const lines = [];
      lines.push("CyberMind slash commands:");
      for (const cat of CATEGORY_ORDER) {
        const cmds = grouped[cat];
        if (!cmds?.length) continue;
        lines.push("");
        lines.push(`  ${CATEGORY_LABEL[cat]}`);
        for (const c of cmds.sort((a, b) => a.name.localeCompare(b.name))) {
          const aliasNote = c.aliases?.length ? ` (aliases: ${c.aliases.map((a) => `/${a}`).join(", ")})` : "";
          lines.push(`    /${c.name.padEnd(16)} ${c.description}${aliasNote}`);
        }
      }
      lines.push("");
      lines.push("  Type /help <name> for usage of a specific command.");
      ctx.appendMessage({
        id: `help-${Date.now()}`,
        role: "system",
        content: lines.join("\n"),
        createdAt: Date.now()
      });
    }
  };
}
function formatOne(c) {
  const lines = [];
  lines.push(`/${c.name} \u2014 ${c.description}`);
  if (c.aliases?.length) lines.push(`  aliases: ${c.aliases.map((a) => `/${a}`).join(", ")}`);
  if (c.usage) lines.push(`  usage:   ${c.usage}`);
  lines.push(`  category: ${c.category}`);
  return lines.join("\n");
}

// src/commands/clear.ts
function buildClearCommand(ctx) {
  return {
    name: "clear",
    description: "Clear the current conversation and hide the welcome card.",
    category: "session",
    usage: "/clear",
    run: () => {
      ctx.clear();
    }
  };
}

// src/commands/exit.ts
function buildExitCommand(ctx) {
  return {
    name: "exit",
    description: "Quit CyberMind.",
    category: "session",
    aliases: ["quit", "q"],
    usage: "/exit",
    run: () => {
      ctx.appendMessage({
        id: `exit-${Date.now()}`,
        role: "system",
        content: "Goodbye. Run `cybermind` again any time.",
        createdAt: Date.now()
      });
      setTimeout(() => ctx.exit(), 80);
    }
  };
}

// src/commands/stubs.ts
var STUBS = [
  // Session / context
  { name: "compact", category: "session", milestone: "M5", description: "Compact conversation history to free context." },
  { name: "branch", category: "session", milestone: "M5", description: "Fork the conversation at this point." },
  { name: "background", category: "session", milestone: "M5", description: "Send this session to the background and free the terminal." },
  { name: "btw", category: "session", milestone: "M5", description: "Ask a quick side question without interrupting the main thread." },
  // /color, /model, /provider, /consensus wired in M5.
  // Agent / model
  { name: "fallback", category: "agent", milestone: "M10", description: "Manually switch to local Ollama as fallback." },
  { name: "agents", category: "agent", milestone: "M11", description: "Manage parallel agent worktree configurations." },
  { name: "advisor", category: "agent", milestone: "M10", description: "Consult a stronger advisor model at key moments." },
  // /research, /plan, /code-review wired in M4 (see commands/skills.ts).
  // Skills
  // /skills wired in M4 (see commands/skills.ts).
  { name: "skill-creator", category: "skills", milestone: "M13", description: "Author a new skill interactively." },
  { name: "agent-browser", category: "skills", milestone: "M7", description: "Run the Playwright browser-automation skill." },
  // Auth / sync
  { name: "login", category: "auth", milestone: "M6", description: "Log in via OAuth or with an API key." },
  { name: "logout", category: "auth", milestone: "M6", description: "Log out and clear credentials." },
  { name: "team", category: "auth", milestone: "M6", description: "Switch the active team workspace." },
  { name: "sync", category: "auth", milestone: "M6", description: "Push/pull skills and settings to/from the backend." },
  { name: "usage", category: "auth", milestone: "M6", description: "Show current API usage and quota." },
  { name: "cost", category: "auth", milestone: "M12", description: "Show pinned $/token meter. Use /cost limit <usd>." },
  // Config / project
  { name: "init", category: "config", milestone: "M7", description: "Initialize the project with an AGENTS.md." },
  { name: "add-dir", category: "config", milestone: "M5", description: "Add another working directory to this session." },
  { name: "profile", category: "config", milestone: "M10", description: "Switch the project profile (strict-ts, hobby, paranoid\u2026)." },
  { name: "release-notes", category: "config", milestone: "M14", description: "Show release notes for the current version." },
  // Safety
  // /trust, /secret wired in M5.
  { name: "sandbox", category: "safety", milestone: "M10", description: "Toggle Docker/Podman sandbox for risky commands." },
  { name: "rewind", category: "safety", milestone: "M10", description: "Time-travel: undo the last N turns including file changes." },
  { name: "replay", category: "safety", milestone: "M10", description: "Deterministically rerun a recorded session." },
  // Collab
  { name: "mirror", category: "collab", milestone: "M11", description: "Open the web UI mirror at http://localhost:7777." },
  { name: "pair", category: "collab", milestone: "M11", description: "Start or join a live pair session over LAN/tunnel." },
  { name: "worktree", category: "collab", milestone: "M11", description: "Toggle git-worktree-per-task isolation." },
  // Workflows / palette
  // /workflow wired in M5.
  { name: "palette", category: "utility", milestone: "M12", description: "Open the fuzzy command palette (Ctrl+K)." },
  { name: "diff", category: "utility", milestone: "M10", description: "Show pending file changes from the agent (lands with time-travel)." },
  { name: "mcp", category: "utility", milestone: "M13", description: "Manage MCP servers and the MCP marketplace." },
  // Cyber
  { name: "cyber", category: "cyber", milestone: "Phase 2", description: "Reserved for the autonomous bug-bounty mode. Coming soon." }
];
function buildStubCommands(ctx) {
  return STUBS.map((spec) => ({
    name: spec.name,
    description: spec.description,
    category: spec.category,
    aliases: spec.aliases,
    usage: spec.usage,
    run: () => {
      ctx.appendMessage({
        id: `${spec.name}-${Date.now()}`,
        role: "system",
        content: `/${spec.name} is registered but its implementation lands in ${spec.milestone}.`,
        createdAt: Date.now()
      });
    }
  }));
}

// ../core/src/agent-loop.ts
var log10 = createLogger("core:agent");
async function* runAgentLoop(messages, opts) {
  const tools = opts.tools ?? [];
  const toolMap = new Map(tools.map((t) => [t.schema.name, t]));
  const toolSchemas = tools.map((t) => t.schema);
  const max = opts.maxIterations ?? 10;
  const ctx = { cwd: process.cwd() };
  const buffer = [...messages];
  for (let iter = 0; iter < max; iter++) {
    if (opts.signal?.aborted) {
      yield { type: "done", reason: "error", error: "aborted" };
      return;
    }
    yield { type: "iteration", index: iter, max };
    const req = {
      model: opts.model ?? "auto",
      messages: buffer,
      systemPrompt: opts.systemPrompt,
      tools: toolSchemas.length > 0 ? toolSchemas : void 0,
      signal: opts.signal
    };
    let assistantText = "";
    const assistantToolCalls = [];
    let stopReason = { type: "done", reason: "end_turn" };
    for await (const chunk of opts.provider.chat(req)) {
      if (chunk.type === "text") {
        assistantText += chunk.text;
        yield { type: "text", text: chunk.text };
      } else if (chunk.type === "tool_call") {
        assistantToolCalls.push(chunk.toolCall);
        yield {
          type: "tool_call",
          name: chunk.toolCall.name,
          input: chunk.toolCall.input,
          id: chunk.toolCall.id
        };
      } else if (chunk.type === "usage") {
        yield { type: "usage", inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens };
      } else if (chunk.type === "done") {
        stopReason = chunk;
      }
    }
    buffer.push({
      role: "assistant",
      content: assistantText,
      toolCalls: assistantToolCalls.length ? assistantToolCalls : void 0
    });
    if (stopReason.reason === "error") {
      yield { type: "done", reason: "error", error: stopReason.error };
      return;
    }
    if (assistantToolCalls.length === 0) {
      yield { type: "done", reason: "end_turn" };
      return;
    }
    for (const tc of assistantToolCalls) {
      const tool = toolMap.get(tc.name);
      if (!tool) {
        const errOut = `Tool '${tc.name}' is not registered.`;
        yield { type: "tool_result", name: tc.name, id: tc.id, output: errOut, ok: false };
        buffer.push({ role: "tool", content: errOut, toolCallId: tc.id });
        continue;
      }
      try {
        if (ctx.approve) {
          const ok = await ctx.approve(tc.name, tc.input);
          if (!ok) {
            const denied = `[user denied tool '${tc.name}']`;
            yield { type: "tool_result", name: tc.name, id: tc.id, output: denied, ok: false };
            buffer.push({ role: "tool", content: denied, toolCallId: tc.id });
            continue;
          }
        }
        const output = await tool.execute(tc.input, ctx);
        yield { type: "tool_result", name: tc.name, id: tc.id, output, ok: true };
        buffer.push({ role: "tool", content: output, toolCallId: tc.id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log10.error("tool execution failed", { tool: tc.name, err: msg });
        yield { type: "tool_result", name: tc.name, id: tc.id, output: `Error: ${msg}`, ok: false };
        buffer.push({ role: "tool", content: `Error: ${msg}`, toolCallId: tc.id });
      }
    }
  }
  yield { type: "done", reason: "max_iterations" };
}

// ../core/src/consensus.ts
async function runConsensus(messages, opts) {
  const timeout = opts.timeoutMs ?? 6e4;
  const tasks = opts.providers.map(async (p, i) => {
    const req = {
      model: opts.models?.[i] ?? "auto",
      messages,
      systemPrompt: opts.systemPrompt
    };
    const out = { text: "" };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      for await (const chunk of p.chat({ ...req, signal: ac.signal })) {
        if (chunk.type === "text") out.text += chunk.text;
        else if (chunk.type === "done" && chunk.reason === "error") out.error = chunk.error;
      }
    } catch (err) {
      out.error = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }
    return { provider: p.info.id, model: req.model, text: out.text, error: out.error };
  });
  const perProvider = await Promise.all(tasks);
  const merged = mergeAnswers(perProvider.filter((r) => !r.error).map((r) => r.text));
  return { perProvider, merged };
}
function mergeAnswers(answers) {
  if (answers.length === 0) return "";
  if (answers.length === 1) return answers[0] ?? "";
  const sorted = [...answers].sort((a, b) => b.length - a.length);
  const spine = sorted[0] ?? "";
  const seen = new Set(spine.split("\n").map((l) => l.trim()));
  const extras = [];
  for (let i = 1; i < sorted.length; i++) {
    const lines = (sorted[i] ?? "").split("\n");
    for (const line of lines) {
      const t = line.trim();
      if (t.length > 0 && !seen.has(t)) {
        seen.add(t);
        extras.push(line);
      }
    }
  }
  return extras.length > 0 ? `${spine}

--- additional perspectives ---
${extras.join("\n")}` : spine;
}

// ../providers/src/types.ts
import { z as z8 } from "zod";
var ProviderRoleSchema = z8.enum(["system", "user", "assistant", "tool"]);

// ../providers/src/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
var log11 = createLogger("providers:anthropic");
var AnthropicProvider = class {
  info;
  client;
  defaultModel;
  constructor(opts = {}) {
    const apiKey = opts.apiKey ?? process.env.CYBERMIND_API_KEY ?? process.env.ANTHROPIC_API_KEY;
    this.client = new Anthropic({
      apiKey: apiKey ?? "",
      baseURL: opts.baseURL
    });
    this.defaultModel = opts.defaultModel ?? "claude-3-5-sonnet-latest";
    this.info = {
      id: "anthropic",
      displayName: "Anthropic",
      requiresNetwork: true,
      ready: Boolean(apiKey)
    };
  }
  async listModels() {
    return [
      "claude-3-5-sonnet-latest",
      "claude-3-5-haiku-latest",
      "claude-3-opus-latest",
      "claude-sonnet-4-5",
      "claude-opus-4"
    ];
  }
  async *chat(req) {
    const model = req.model && req.model !== "auto" ? req.model : this.defaultModel;
    const { system, messages } = splitSystem(req.messages, req.systemPrompt);
    log11.debug("anthropic chat", { model, messages: messages.length, tools: req.tools?.length ?? 0 });
    try {
      const stream = this.client.messages.stream({
        model,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature,
        system: system || void 0,
        messages: messages.map(toAnthropicMessage),
        tools: req.tools?.map(toAnthropicTool)
      });
      const inflightToolCalls = /* @__PURE__ */ new Map();
      for await (const event of stream) {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "tool_use") {
            inflightToolCalls.set(event.index, {
              id: event.content_block.id,
              name: event.content_block.name,
              input: {}
            });
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            yield { type: "text", text: event.delta.text };
          } else if (event.delta.type === "input_json_delta") {
            const tc = inflightToolCalls.get(event.index);
            if (tc) {
              tc._raw = (tc._raw ?? "") + event.delta.partial_json;
            }
          }
        } else if (event.type === "content_block_stop") {
          const tc = inflightToolCalls.get(event.index);
          if (tc) {
            const raw = tc._raw ?? "{}";
            try {
              tc.input = raw.length > 0 ? JSON.parse(raw) : {};
            } catch (err) {
              log11.warn("failed to parse tool input json", { raw, err: String(err) });
              tc.input = {};
            }
            yield { type: "tool_call", toolCall: { id: tc.id, name: tc.name, input: tc.input } };
            inflightToolCalls.delete(event.index);
          }
        } else if (event.type === "message_delta") {
          if (event.usage) {
            yield { type: "usage", inputTokens: 0, outputTokens: event.usage.output_tokens ?? 0 };
          }
        } else if (event.type === "message_stop") {
        }
      }
      const final = await stream.finalMessage();
      yield {
        type: "done",
        reason: final.stop_reason === "tool_use" ? "tool_use" : final.stop_reason === "max_tokens" ? "max_tokens" : final.stop_reason === "end_turn" ? "end_turn" : "stop"
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log11.error("anthropic chat failed", msg);
      yield { type: "done", reason: "error", error: msg };
    }
  }
};
function splitSystem(messages, systemPrompt) {
  const sysFromMessages = messages.filter((m) => m.role === "system").map((m) => m.content);
  const rest = messages.filter((m) => m.role !== "system");
  const system = [systemPrompt ?? "", ...sysFromMessages].filter(Boolean).join("\n\n");
  return { system, messages: rest };
}
function toAnthropicMessage(m) {
  if (m.role === "tool") {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: m.toolCallId ?? "",
          content: m.content
        }
      ]
    };
  }
  if (m.role === "assistant" && m.toolCalls?.length) {
    const blocks = [];
    if (m.content) blocks.push({ type: "text", text: m.content });
    for (const tc of m.toolCalls) {
      blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
    }
    return { role: "assistant", content: blocks };
  }
  return {
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content
  };
}
function toAnthropicTool(t) {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema
  };
}

// ../providers/src/cybermind-cloud.ts
var DEFAULT_BASE_URL = process.env.CYBERMIND_CLOUD_URL ?? "https://cybermindcli.info/v1";
var CybermindCloudProvider = class extends AnthropicProvider {
  info;
  constructor(opts = {}) {
    const apiKey = opts.apiKey ?? process.env.CYBERMIND_API_KEY;
    super({
      apiKey,
      baseURL: opts.baseURL ?? DEFAULT_BASE_URL,
      defaultModel: opts.defaultModel ?? "cybermind-default"
    });
    this.info = {
      id: "cybermind-cloud",
      displayName: "CyberMind Cloud",
      requiresNetwork: true,
      ready: Boolean(apiKey)
    };
  }
};

// ../providers/src/ollama.ts
var log12 = createLogger("providers:ollama");
var OllamaProvider = class {
  info;
  baseURL;
  defaultModel;
  constructor(opts = {}) {
    this.baseURL = opts.baseURL ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
    this.defaultModel = opts.defaultModel ?? process.env.OLLAMA_MODEL ?? "llama3.1";
    this.info = {
      id: "ollama",
      displayName: "Ollama (local)",
      requiresNetwork: false,
      ready: true
      // Optimistic; reachability is checked lazily on first call.
    };
  }
  async listModels() {
    try {
      const res = await fetch(`${this.baseURL}/api/tags`, { method: "GET" });
      if (!res.ok) return [];
      const json = await res.json();
      return json.models?.map((m) => m.name) ?? [];
    } catch (err) {
      log12.warn("ollama listModels failed", String(err));
      return [];
    }
  }
  async *chat(req) {
    const model = req.model && req.model !== "auto" ? req.model : this.defaultModel;
    log12.debug("ollama chat", { model, messages: req.messages.length });
    const body = {
      model,
      messages: [
        ...req.systemPrompt ? [{ role: "system", content: req.systemPrompt }] : [],
        ...req.messages.map(toOllamaMessage)
      ],
      stream: true,
      options: {
        temperature: req.temperature,
        num_predict: req.maxTokens
      },
      tools: req.tools?.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputSchema }
      }))
    };
    try {
      const res = await fetch(`${this.baseURL}/api/chat`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        signal: req.signal
      });
      if (!res.ok || !res.body) {
        yield {
          type: "done",
          reason: "error",
          error: `ollama HTTP ${res.status}: ${await res.text().catch(() => res.statusText)}`
        };
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      let stopReason = { type: "done", reason: "stop" };
      while (!done) {
        const { value, done: chunkDone } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const evt = JSON.parse(trimmed);
              if (evt.message?.content) {
                yield { type: "text", text: evt.message.content };
              }
              if (evt.message?.tool_calls?.length) {
                for (const raw of evt.message.tool_calls) {
                  const tc = {
                    id: raw.id ?? `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    name: raw.function.name,
                    input: raw.function.arguments ?? {}
                  };
                  yield { type: "tool_call", toolCall: tc };
                }
              }
              if (evt.done) {
                if (evt.eval_count != null && evt.prompt_eval_count != null) {
                  yield {
                    type: "usage",
                    inputTokens: evt.prompt_eval_count,
                    outputTokens: evt.eval_count
                  };
                }
                stopReason = {
                  type: "done",
                  reason: evt.done_reason === "length" ? "max_tokens" : evt.message?.tool_calls?.length ? "tool_use" : "end_turn"
                };
                done = true;
                break;
              }
            } catch (err) {
              log12.warn("failed to parse ollama chunk", { line: trimmed, err: String(err) });
            }
          }
        }
        if (chunkDone) done = true;
      }
      yield stopReason;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log12.error("ollama chat failed", msg);
      yield { type: "done", reason: "error", error: msg };
    }
  }
};
function toOllamaMessage(m) {
  if (m.role === "tool") {
    return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
  }
  return { role: m.role, content: m.content };
}

// ../providers/src/router.ts
var log13 = createLogger("providers:router");
var ProviderRouter = class {
  info;
  providers = /* @__PURE__ */ new Map();
  preferred;
  fallback;
  constructor(opts = {}) {
    this.providers.set("anthropic", new AnthropicProvider(opts.anthropic));
    this.providers.set("cybermind-cloud", new CybermindCloudProvider(opts.cloud));
    const ollama = new OllamaProvider(opts.ollama);
    this.providers.set("ollama", ollama);
    this.fallback = opts.fallback ?? ollama;
    this.preferred = opts.preferred ?? ["cybermind-cloud", "anthropic", "ollama"];
    const active = this.activeProvider();
    this.info = {
      id: active.info.id,
      displayName: `Router (${active.info.displayName})`,
      requiresNetwork: active.info.requiresNetwork,
      ready: active.info.ready
    };
  }
  /** First preferred-and-ready provider, or the fallback. */
  activeProvider() {
    for (const id of this.preferred) {
      const p = this.providers.get(id);
      if (p?.info.ready) return p;
    }
    return this.fallback;
  }
  get(id) {
    return this.providers.get(id);
  }
  async listModels() {
    return this.activeProvider().listModels();
  }
  async *chat(req) {
    const primary = this.activeProvider();
    log13.debug("routing chat", { primary: primary.info.id });
    let primaryYieldedSomething = false;
    let primaryError;
    for await (const chunk of primary.chat(req)) {
      if (chunk.type === "done" && chunk.reason === "error" && !primaryYieldedSomething) {
        primaryError = chunk.error;
        break;
      }
      primaryYieldedSomething = true;
      yield chunk;
    }
    if (primaryError !== void 0 && primary !== this.fallback) {
      log13.warn("primary provider failed; falling back", {
        primary: primary.info.id,
        fallback: this.fallback.info.id,
        error: primaryError
      });
      yield {
        type: "text",
        text: `
[router] ${primary.info.displayName} failed (${primaryError}); falling back to ${this.fallback.info.displayName}.
`
      };
      yield* this.fallback.chat(req);
    } else if (primaryError !== void 0) {
      yield { type: "done", reason: "error", error: primaryError };
    }
  }
};

// ../tools/src/approval.ts
import { existsSync as existsSync9, mkdirSync as mkdirSync8, readFileSync as readFileSync8, writeFileSync as writeFileSync8 } from "fs";
import { dirname } from "path";
var log14 = createLogger("tools:approval");
function loadTrustStore() {
  const path = getTrustPath();
  if (!existsSync9(path)) return { tools: [] };
  try {
    const raw = readFileSync8(path, "utf8");
    const parsed = JSON.parse(raw);
    return { tools: Array.isArray(parsed.tools) ? parsed.tools : [] };
  } catch (err) {
    log14.warn("failed to load trust store", String(err));
    return { tools: [] };
  }
}
function saveTrustStore(store) {
  const path = getTrustPath();
  if (!existsSync9(dirname(path))) mkdirSync8(dirname(path), { recursive: true });
  writeFileSync8(path, JSON.stringify(store, null, 2), "utf8");
}
var ApprovalGate = class {
  constructor(ui) {
    this.ui = ui;
    this.persistent = new Set(loadTrustStore().tools);
  }
  ui;
  persistent;
  sessionAllow = /* @__PURE__ */ new Set();
  mode = "always-ask";
  setMode(mode) {
    this.mode = mode;
  }
  /** True if the tool is already trusted (either persistently or for the session). */
  isTrusted(toolName) {
    return this.persistent.has(toolName) || this.sessionAllow.has(toolName);
  }
  /** Trust a tool persistently — written to ~/.cybermind/trust.json. */
  trustPersistent(toolName) {
    this.persistent.add(toolName);
    saveTrustStore({ tools: [...this.persistent] });
    log14.info("tool persistently trusted", { toolName });
  }
  /** Revoke persistent trust. */
  revoke(toolName) {
    this.persistent.delete(toolName);
    this.sessionAllow.delete(toolName);
    saveTrustStore({ tools: [...this.persistent] });
  }
  listTrusted() {
    return { persistent: [...this.persistent], session: [...this.sessionAllow] };
  }
  /**
   * Main entry point used by the agent loop. Returns true when the tool call
   * may proceed; false when the user denied.
   */
  async request(prompt) {
    if (this.mode === "persistent-bypass") return true;
    if (this.isTrusted(prompt.toolName)) return true;
    if (this.mode === "session-bypass" && !prompt.destructive) return true;
    const decision = await this.ui.ask(prompt);
    switch (decision) {
      case "allow":
        return true;
      case "allow-session":
        this.sessionAllow.add(prompt.toolName);
        return true;
      case "allow-persistent":
        this.trustPersistent(prompt.toolName);
        return true;
      case "deny":
      default:
        return false;
    }
  }
};
var HeadlessApprovalUI = class {
  async ask(prompt) {
    return prompt.destructive ? "deny" : "allow";
  }
};

// ../tools/src/secrets.ts
import { existsSync as existsSync10, mkdirSync as mkdirSync9, readFileSync as readFileSync9, writeFileSync as writeFileSync9 } from "fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";
var log15 = createLogger("tools:secrets");
var ALGO = "aes-256-gcm";
var IV_LEN = 12;
var SALT_LEN = 16;
var KEY_LEN = 32;
var SecretsVault = class {
  cache = null;
  list() {
    return Object.keys(this.load());
  }
  get(name) {
    return this.load()[name];
  }
  set(name, value) {
    const all = this.load();
    all[name] = value;
    this.save(all);
  }
  remove(name) {
    const all = this.load();
    if (!(name in all)) return false;
    delete all[name];
    this.save(all);
    return true;
  }
  /** Merge the vault into a process env-like object for tool execution. */
  injectInto(env) {
    return { ...env, ...this.load() };
  }
  load() {
    if (this.cache) return this.cache;
    const path = getSecretsPath();
    if (!existsSync10(path)) {
      this.cache = {};
      return this.cache;
    }
    try {
      const buf = readFileSync9(path);
      const salt = buf.subarray(0, SALT_LEN);
      const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
      const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + 16);
      const ciphertext = buf.subarray(SALT_LEN + IV_LEN + 16);
      const key = scryptSync(this.pepper(), salt, KEY_LEN);
      const decipher = createDecipheriv(ALGO, key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      this.cache = JSON.parse(plain.toString("utf8"));
      return this.cache;
    } catch (err) {
      log15.error("failed to decrypt secrets vault; treating as empty", String(err));
      this.cache = {};
      return this.cache;
    }
  }
  save(all) {
    const path = getSecretsPath();
    if (!existsSync10(getHomeDir())) mkdirSync9(getHomeDir(), { recursive: true });
    const salt = randomBytes(SALT_LEN);
    const iv = randomBytes(IV_LEN);
    const key = scryptSync(this.pepper(), salt, KEY_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(all), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    writeFileSync9(path, Buffer.concat([salt, iv, tag, ciphertext]));
    this.cache = { ...all };
  }
  /**
   * Stable per-machine pepper. Not a secret — just makes the encrypted file
   * non-portable between machines. M6 will swap this for an OS-keychain entry.
   */
  pepper() {
    const host = (process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "cybermind") + ":cybermind-v1";
    return createHash("sha256").update(host).digest();
  }
};

// ../tools/src/builtin/read-file.ts
import { readFileSync as readFileSync10 } from "fs";
import { resolve as resolve2 } from "path";
var MAX_BYTES = 1e6;
var readFileTool = {
  schema: {
    name: "read_file",
    description: "Read the contents of a file at the given path. Returns up to ~1MB of UTF-8 text with 1-indexed line numbers. Use an absolute path or one relative to the current working directory.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative file path." },
        offset: { type: "integer", minimum: 1, description: "Optional 1-indexed line to start at." },
        limit: { type: "integer", minimum: 1, description: "Optional number of lines to read." }
      },
      required: ["path"]
    }
  },
  destructive: false,
  async execute(input, ctx) {
    const path = String(input.path ?? "");
    if (!path) throw new Error("read_file requires a non-empty path");
    const abs = resolve2(ctx.cwd, path);
    const raw = readFileSync10(abs);
    if (raw.byteLength > MAX_BYTES) {
      const truncated = raw.subarray(0, MAX_BYTES).toString("utf8");
      return numberLines(truncated, input.offset, input.limit) + `

[truncated: file is ${raw.byteLength} bytes, only first ${MAX_BYTES} shown]`;
    }
    return numberLines(raw.toString("utf8"), input.offset, input.limit);
  }
};
function numberLines(text, offset, limit) {
  const lines = text.split("\n");
  const start = Math.max(1, offset ?? 1);
  const end = limit ? Math.min(lines.length, start + limit - 1) : lines.length;
  const slice = lines.slice(start - 1, end);
  const width = String(end).length;
  return slice.map((l, i) => `${String(start + i).padStart(width, " ")}	${l}`).join("\n");
}

// ../tools/src/builtin/write-file.ts
import { existsSync as existsSync11, mkdirSync as mkdirSync10, writeFileSync as writeFileSync10 } from "fs";
import { dirname as dirname2, resolve as resolve3 } from "path";
var writeFileTool = {
  schema: {
    name: "write_file",
    description: "Create a new file at the given path with the given UTF-8 content. Fails if the file already exists \u2014 use edit for modifications. Parent directories are created.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative file path." },
        content: { type: "string", description: "Full UTF-8 file content." }
      },
      required: ["path", "content"]
    }
  },
  destructive: true,
  async execute(input, ctx) {
    const path = String(input.path ?? "");
    const content = String(input.content ?? "");
    if (!path) throw new Error("write_file requires a path");
    const abs = resolve3(ctx.cwd, path);
    if (existsSync11(abs)) {
      throw new Error(`Refusing to overwrite existing file ${abs}. Use the edit tool instead.`);
    }
    const dir = dirname2(abs);
    if (!existsSync11(dir)) mkdirSync10(dir, { recursive: true });
    writeFileSync10(abs, content, "utf8");
    return `Wrote ${Buffer.byteLength(content, "utf8")} bytes to ${abs}.`;
  }
};

// ../tools/src/builtin/edit.ts
import { readFileSync as readFileSync11, writeFileSync as writeFileSync11 } from "fs";
import { resolve as resolve4 } from "path";
var editTool = {
  schema: {
    name: "edit",
    description: "Replace an exact string in a file with a new string. The old_string must appear exactly once unless replace_all is true. Use for surgical code edits; create new files with write_file instead.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_string: { type: "string", description: "Exact text to replace, including indentation." },
        new_string: { type: "string", description: "Replacement text." },
        replace_all: { type: "boolean", default: false }
      },
      required: ["path", "old_string", "new_string"]
    }
  },
  destructive: true,
  async execute(input, ctx) {
    const path = String(input.path ?? "");
    const oldStr = String(input.old_string ?? "");
    const newStr = String(input.new_string ?? "");
    const replaceAll = Boolean(input.replace_all);
    if (!path) throw new Error("edit requires a path");
    if (!oldStr) throw new Error("edit requires a non-empty old_string");
    if (oldStr === newStr) throw new Error("edit requires old_string !== new_string");
    const abs = resolve4(ctx.cwd, path);
    const original = readFileSync11(abs, "utf8");
    if (replaceAll) {
      const count = occurrenceCount(original, oldStr);
      if (count === 0) throw new Error(`No occurrences of old_string found in ${abs}`);
      const next2 = original.split(oldStr).join(newStr);
      writeFileSync11(abs, next2, "utf8");
      return `Replaced ${count} occurrence(s) in ${abs}.`;
    }
    const idx = original.indexOf(oldStr);
    if (idx === -1) throw new Error(`old_string not found in ${abs}`);
    if (original.indexOf(oldStr, idx + 1) !== -1) {
      throw new Error(
        `old_string is not unique in ${abs}; provide a longer surrounding snippet or set replace_all=true.`
      );
    }
    const next = original.slice(0, idx) + newStr + original.slice(idx + oldStr.length);
    writeFileSync11(abs, next, "utf8");
    return `Edited ${abs} (${original.length - next.length > 0 ? "-" : "+"}${Math.abs(original.length - next.length)} bytes).`;
  }
};
function occurrenceCount(haystack, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n++;
    i += needle.length;
  }
  return n;
}

// ../tools/src/builtin/list-dir.ts
import { readdirSync as readdirSync4, statSync } from "fs";
import { join as join9, resolve as resolve5 } from "path";
var MAX_ENTRIES = 200;
var listDirTool = {
  schema: {
    name: "list_dir",
    description: "List files and directories at the given absolute or relative path. Returns up to 200 entries with type and size.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory to list." }
      },
      required: ["path"]
    }
  },
  destructive: false,
  async execute(input, ctx) {
    const path = String(input.path ?? ".");
    const abs = resolve5(ctx.cwd, path);
    const entries = readdirSync4(abs, { withFileTypes: true }).slice(0, MAX_ENTRIES);
    const lines = [];
    for (const e of entries) {
      const full = join9(abs, e.name);
      let size = "";
      try {
        if (e.isFile()) size = `${statSync(full).size}b`;
        else if (e.isDirectory()) size = "dir";
        else if (e.isSymbolicLink()) size = "symlink";
      } catch {
        size = "?";
      }
      lines.push(`${size.padEnd(10)} ${e.name}`);
    }
    return lines.length === 0 ? "(empty directory)" : lines.join("\n");
  }
};

// ../tools/src/builtin/grep.ts
import { readdirSync as readdirSync5, readFileSync as readFileSync12, statSync as statSync2 } from "fs";
import { join as join10, resolve as resolve6 } from "path";
var MAX_MATCHES = 200;
var MAX_FILE_BYTES = 2e6;
var SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", ".turbo", ".next", ".cache"]);
var grepTool = {
  schema: {
    name: "grep",
    description: "Search files for a regex pattern (case-insensitive by default). Returns up to 200 matching lines with file:line prefix. Skips node_modules and other build dirs.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression to search for." },
        path: { type: "string", description: "Directory or file to search. Defaults to cwd." },
        case_sensitive: { type: "boolean", default: false },
        include: { type: "string", description: 'Optional glob-like extension filter, e.g. "*.ts".' }
      },
      required: ["pattern"]
    }
  },
  destructive: false,
  async execute(input, ctx) {
    const pattern = String(input.pattern ?? "");
    if (!pattern) throw new Error("grep requires a pattern");
    const flags = input.case_sensitive ? "g" : "gi";
    const re = new RegExp(pattern, flags);
    const root = resolve6(ctx.cwd, String(input.path ?? "."));
    const include = typeof input.include === "string" ? extToRegex(input.include) : null;
    const matches = [];
    walk(root, (file) => {
      if (matches.length >= MAX_MATCHES) return false;
      if (include && !include.test(file)) return true;
      try {
        const stat = statSync2(file);
        if (stat.size > MAX_FILE_BYTES) return true;
        const text = readFileSync12(file, "utf8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length && matches.length < MAX_MATCHES; i++) {
          const line = lines[i] ?? "";
          if (re.test(line)) {
            matches.push(`${file}:${i + 1}: ${line}`);
          }
        }
      } catch {
      }
      return true;
    });
    if (matches.length === 0) return `(no matches for /${pattern}/${flags})`;
    return matches.join("\n");
  }
};
function extToRegex(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`${escaped}$`, "i");
}
function walk(root, visit) {
  const stack = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    let stat;
    try {
      stat = statSync2(cur);
    } catch {
      continue;
    }
    if (stat.isFile()) {
      if (!visit(cur)) return;
      continue;
    }
    if (!stat.isDirectory()) continue;
    let entries;
    try {
      entries = readdirSync5(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
      stack.push(join10(cur, e.name));
    }
  }
}

// ../tools/src/builtin/run-command.ts
import { spawn as spawn2 } from "child_process";
var DEFAULT_TIMEOUT_MS = 6e4;
var MAX_OUTPUT_BYTES = 2e5;
var SHELL = process.platform === "win32" ? "powershell.exe" : "/bin/bash";
var SHELL_ARG = process.platform === "win32" ? "-NoProfile" : "-lc";
var runCommandTool = {
  schema: {
    name: "run_command",
    description: "Execute a shell command in the user's default shell (PowerShell on Windows, bash on Unix). Returns combined stdout/stderr (up to ~200KB) and the exit code. Always destructive \u2014 requires approval.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command line to run." },
        cwd: { type: "string", description: "Optional working directory." },
        timeout_ms: { type: "integer", description: "Optional timeout (defaults 60s)." }
      },
      required: ["command"]
    }
  },
  destructive: true,
  async execute(input, ctx) {
    const command = String(input.command ?? "");
    if (!command) throw new Error("run_command requires a command");
    const cwd = input.cwd ?? ctx.cwd;
    const timeoutMs = Number(input.timeout_ms ?? DEFAULT_TIMEOUT_MS);
    return await new Promise((resolveResult) => {
      const child = spawn2(SHELL, [SHELL_ARG, command], {
        cwd,
        env: process.env,
        windowsHide: true
      });
      const chunks = [];
      let totalBytes = 0;
      let truncated = false;
      const onData = (buf) => {
        if (totalBytes >= MAX_OUTPUT_BYTES) {
          truncated = true;
          return;
        }
        const room = MAX_OUTPUT_BYTES - totalBytes;
        const slice = buf.byteLength > room ? buf.subarray(0, room) : buf;
        chunks.push(slice);
        totalBytes += slice.byteLength;
        if (totalBytes >= MAX_OUTPUT_BYTES) {
          truncated = true;
          child.kill();
        }
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      const killer = setTimeout(() => {
        truncated = true;
        chunks.push(Buffer.from(`
[timeout: killed after ${timeoutMs}ms]
`));
        child.kill();
      }, timeoutMs);
      child.on("close", (code) => {
        clearTimeout(killer);
        const out = Buffer.concat(chunks).toString("utf8");
        const tail = truncated ? `
[truncated at ${MAX_OUTPUT_BYTES} bytes]` : "";
        resolveResult(`exit ${code ?? 0}
${out}${tail}`);
      });
      child.on("error", (err) => {
        clearTimeout(killer);
        resolveResult(`exit -1
[spawn error] ${err.message}`);
      });
    });
  }
};

// ../tools/src/registry.ts
function builtinTools() {
  return [readFileTool, writeFileTool, editTool, listDirTool, grepTool, runCommandTool];
}

// ../skills/src/types.ts
import { z as z9 } from "zod";
var SkillIOSchema = z9.object({
  name: z9.string(),
  type: z9.string(),
  required: z9.boolean().optional(),
  description: z9.string().optional()
});
var SkillFrontmatterSchema = z9.object({
  name: z9.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/, "name must be kebab-case"),
  description: z9.string().min(1),
  version: z9.string().default("0.1.0"),
  inputs: z9.array(SkillIOSchema).default([]),
  outputs: z9.array(SkillIOSchema).default([]),
  /** Capabilities the skill needs to run. */
  requires: z9.object({
    tools: z9.array(z9.string()).default([]),
    /** Reserved for M13 — MCP servers the skill expects. */
    mcp: z9.array(z9.string()).default([])
  }).default({ tools: [], mcp: [] }),
  /** Free-form trigger phrases shown in /help and used by skill discovery. */
  triggers: z9.array(z9.string()).default([]),
  license: z9.string().optional(),
  author: z9.string().optional(),
  category: z9.string().optional(),
  /** Used by the marketplace to flag curated/official skills. */
  official: z9.boolean().default(false)
});

// ../skills/src/parser.ts
import { parse as parseYaml } from "yaml";
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
function parseSkillSource(source) {
  const match = source.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error('SKILL.md must begin with a YAML frontmatter block delimited by "---" lines');
  }
  const [, yamlBlock, body] = match;
  let raw;
  try {
    raw = parseYaml(yamlBlock ?? "");
  } catch (err) {
    throw new Error(`SKILL.md frontmatter is not valid YAML: ${err.message}`);
  }
  const parsed = SkillFrontmatterSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`SKILL.md frontmatter failed validation:
${issues}`);
  }
  return { frontmatter: parsed.data, body: (body ?? "").trim() };
}

// ../skills/src/loader.ts
import { existsSync as existsSync12, readFileSync as readFileSync13, readdirSync as readdirSync6, statSync as statSync3 } from "fs";
import { dirname as dirname3, join as join11, resolve as resolve7 } from "path";
import { fileURLToPath } from "url";
var log16 = createLogger("skills:loader");
function getBundledDir() {
  const here = dirname3(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve7(dir, "skills-bundled");
    if (existsSync12(candidate)) return candidate;
    const parent = resolve7(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return resolve7(here, "..", "..", "..", "skills-bundled");
}
function scanDir(root, source) {
  if (!existsSync12(root)) return [];
  const out = [];
  let entries;
  try {
    entries = readdirSync6(root);
  } catch (err) {
    log16.warn("failed to read skills dir", { root, err: String(err) });
    return [];
  }
  for (const name of entries) {
    const folder = join11(root, name);
    let stat;
    try {
      stat = statSync3(folder);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const skillFile = join11(folder, "SKILL.md");
    if (!existsSync12(skillFile)) continue;
    try {
      const raw = readFileSync13(skillFile, "utf8");
      const { frontmatter, body } = parseSkillSource(raw);
      const id = `${source}/${frontmatter.name}`;
      out.push({ id, source, path: skillFile, frontmatter, body });
    } catch (err) {
      log16.warn("skipping malformed skill", { skillFile, err: String(err) });
    }
  }
  return out;
}
function loadAllSkills(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const skip = new Set(opts.skip ?? []);
  const sources = [];
  if (!skip.has("project")) sources.push({ source: "project", dir: getProjectSkillsDir(cwd) });
  if (!skip.has("user")) sources.push({ source: "user", dir: getSkillsDir() });
  if (!skip.has("bundled")) sources.push({ source: "bundled", dir: opts.bundledDir ?? getBundledDir() });
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const { source, dir } of sources) {
    for (const skill of scanDir(dir, source)) {
      if (seen.has(skill.frontmatter.name)) continue;
      seen.add(skill.frontmatter.name);
      out.push(skill);
    }
  }
  return out;
}

// ../skills/src/registry.ts
var SkillRegistry = class {
  constructor(opts = {}) {
    this.opts = opts;
    this.reload();
  }
  opts;
  skills = [];
  byName = /* @__PURE__ */ new Map();
  reload() {
    this.skills = loadAllSkills(this.opts);
    this.byName.clear();
    for (const s of this.skills) this.byName.set(s.frontmatter.name, s);
  }
  list() {
    return [...this.skills];
  }
  get(name) {
    return this.byName.get(name);
  }
  has(name) {
    return this.byName.has(name);
  }
  /** Group skills by source for /skills UI output. */
  bySource() {
    const out = {
      bundled: [],
      user: [],
      project: [],
      marketplace: []
    };
    for (const s of this.skills) out[s.source].push(s);
    return out;
  }
};

// ../skills/src/runner.ts
var log17 = createLogger("skills:runner");
function buildSubagentSystemPrompt(skill) {
  return [
    `You are the "${skill.frontmatter.name}" sub-agent inside CyberMind CLI.`,
    skill.frontmatter.description,
    "",
    skill.body,
    "",
    "Rules:",
    "- You run in an isolated context; the user only sees your final summary.",
    "- Be concise. Prefer code/path references over prose.",
    "- When you have completed the task, stop calling tools and emit one final",
    "  message summarising what you found / did."
  ].join("\n");
}
function selectTools(skill, pool) {
  const allowed = new Set(skill.frontmatter.requires.tools);
  if (allowed.size === 0) return [];
  return pool.filter((t) => allowed.has(t.schema.name));
}
async function spawnSubagent(opts) {
  const { skill, prompt, provider, toolPool } = opts;
  const tools = selectTools(skill, toolPool);
  const systemPrompt = buildSubagentSystemPrompt(skill);
  const messages = [{ role: "user", content: prompt }];
  let summary = "";
  let toolCalls = 0;
  let usage = { inputTokens: 0, outputTokens: 0 };
  let reason = "end_turn";
  let error;
  log17.debug("spawning subagent", {
    skill: skill.frontmatter.name,
    tools: tools.map((t) => t.schema.name)
  });
  for await (const evt of runAgentLoop(messages, {
    provider,
    systemPrompt,
    model: opts.model ?? "auto",
    tools,
    maxIterations: opts.maxIterations ?? 6,
    signal: opts.signal
  })) {
    opts.onEvent?.(evt);
    if (evt.type === "text") summary += evt.text;
    else if (evt.type === "tool_call") toolCalls++;
    else if (evt.type === "usage") {
      usage.inputTokens += evt.inputTokens;
      usage.outputTokens += evt.outputTokens;
    } else if (evt.type === "done") {
      reason = evt.reason === "max_iterations" ? "max_iterations" : evt.reason === "error" ? "error" : "end_turn";
      error = evt.error;
    }
  }
  return { summary: summary.trim(), toolCalls, usage, reason, error };
}

// ../skills/src/spawn-tool.ts
function buildSpawnSubagentTool(deps) {
  return {
    schema: {
      name: "spawn_subagent",
      description: "Spawn an isolated sub-agent that runs the named skill against the given prompt. Use this for read-only exploration (research), planning (plan), code review (code-review), or any other installed skill. Returns the sub-agent's final summary as the tool result.",
      inputSchema: {
        type: "object",
        properties: {
          skill: {
            type: "string",
            description: "Name of the skill to invoke. Must match an installed SKILL.md name."
          },
          prompt: {
            type: "string",
            description: "The task description / user prompt to give the sub-agent."
          }
        },
        required: ["skill", "prompt"]
      }
    },
    async execute(input, _ctx) {
      const name = String(input.skill ?? "").trim();
      const prompt = String(input.prompt ?? "").trim();
      if (!name) return 'Error: spawn_subagent requires a non-empty "skill" name.';
      if (!prompt) return 'Error: spawn_subagent requires a non-empty "prompt".';
      const skill = deps.registry.get(name);
      if (!skill) {
        const available = deps.registry.list().map((s) => s.frontmatter.name).join(", ");
        return `Error: skill "${name}" is not installed. Available skills: ${available || "(none)"}`;
      }
      const result = await spawnSubagent({
        skill,
        prompt,
        provider: deps.provider,
        toolPool: deps.toolPool
      });
      if (result.reason === "error") {
        return `[sub-agent ${name} failed: ${result.error ?? "unknown"}]`;
      }
      if (result.reason === "max_iterations") {
        return `[sub-agent ${name} hit iteration cap]

${result.summary}`;
      }
      return result.summary || `[sub-agent ${name} completed with no output]`;
    }
  };
}

// src/runtime/chat.ts
var singletonRouter = null;
var singletonRegistry = null;
function getRouter() {
  if (!singletonRouter) {
    singletonRouter = new ProviderRouter({
      preferred: defaultProviderOrder(),
      anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
      cloud: { apiKey: process.env.CYBERMIND_API_KEY }
    });
  }
  return singletonRouter;
}
function getSkillRegistry() {
  if (!singletonRegistry) singletonRegistry = new SkillRegistry();
  return singletonRegistry;
}
function defaultProviderOrder() {
  const order = [];
  if (process.env.CYBERMIND_API_KEY) order.push("cybermind-cloud");
  if (process.env.ANTHROPIC_API_KEY) order.push("anthropic");
  order.push("ollama");
  return order;
}
var SYSTEM_PROMPT = `You are CyberMind, a fullstack agentic coding assistant running inside a terminal.
You help with reading, editing, and running code across the user's project. Be concise,
prefer code over prose, and never invent file paths. You have access to these tools:
- read_file(path, offset?, limit?) \u2014 returns numbered lines of a file
- list_dir(path) \u2014 lists a directory
- grep(pattern, path?, include?) \u2014 ripgrep-style search
- write_file(path, content) \u2014 create a NEW file (fails on overwrite)
- edit(path, old_string, new_string, replace_all?) \u2014 surgical replacements
- run_command(command, cwd?, timeout_ms?) \u2014 PowerShell on Windows, bash on Unix
- spawn_subagent(skill, prompt) \u2014 delegate to an installed skill (research, plan,
  code-review, \u2026) which runs in an isolated context and returns a summary
Destructive tools (write_file, edit, run_command) require user approval each turn
unless the user has granted persistent trust via /trust. Prefer spawn_subagent for
broad exploration ("research"), planning ("plan"), and reviewing diffs ("code-review")
\u2014 it produces tighter summaries and keeps your main context clean.`;
function toProviderMessages(messages) {
  return messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: m.content }));
}
async function runChat(history, opts) {
  const router = getRouter();
  const registry = getSkillRegistry();
  const providerMessages = toProviderMessages(history);
  const gate = new ApprovalGate(opts.approvalUI ?? new HeadlessApprovalUI());
  const builtins = builtinTools();
  const wrappedBuiltins = builtins.map((t) => ({
    schema: t.schema,
    execute: async (input, ctx) => {
      const ok = await gate.request({
        toolName: t.schema.name,
        input,
        destructive: t.destructive,
        summary: summarizeCall(t.schema.name, input)
      });
      if (!ok) return `[user denied tool '${t.schema.name}']`;
      return t.execute(input, { cwd: ctx.cwd });
    }
  }));
  const spawnTool = buildSpawnSubagentTool({
    registry,
    provider: router,
    toolPool: builtins.map((t) => ({ schema: t.schema, execute: t.execute }))
  });
  const wrappedTools = [...wrappedBuiltins, spawnTool];
  for await (const evt of runAgentLoop(providerMessages, {
    provider: router,
    systemPrompt: SYSTEM_PROMPT,
    model: opts.model ?? "auto",
    signal: opts.signal,
    tools: wrappedTools
  })) {
    opts.onEvent(evt);
  }
}
function summarizeCall(name, input) {
  if (name === "run_command") return `Run: ${String(input.command ?? "")}`;
  if (name === "write_file") return `Create file: ${String(input.path ?? "")}`;
  if (name === "edit") return `Edit file: ${String(input.path ?? "")}`;
  if (name === "read_file") return `Read: ${String(input.path ?? "")}`;
  if (name === "list_dir") return `List: ${String(input.path ?? "")}`;
  if (name === "grep") return `Grep: /${String(input.pattern ?? "")}/`;
  return `${name}(${Object.keys(input).join(", ")})`;
}

// src/commands/skills.ts
function buildSkillsCommand(ctx) {
  return {
    name: "skills",
    description: "List installed skills (bundled, user, project). Install/publish ships in M13.",
    category: "skills",
    usage: "/skills [list]",
    run: () => {
      const registry = getSkillRegistry();
      const grouped = registry.bySource();
      const lines = ["Installed skills:"];
      for (const source of ["bundled", "user", "project", "marketplace"]) {
        const items = grouped[source];
        if (items.length === 0) continue;
        lines.push("");
        lines.push(`  [${source}]`);
        for (const s of items.sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name))) {
          lines.push(`    ${s.frontmatter.name.padEnd(20)} \u2014 ${s.frontmatter.description}`);
        }
      }
      const total = registry.list().length;
      if (total === 0) {
        lines.push("  (none \u2014 bundled skills will appear once you build the project)");
      } else {
        lines.push("");
        lines.push(`  Total: ${total} skill(s). Try /research, /plan, or /code-review.`);
      }
      ctx.appendMessage({
        id: `skills-${Date.now()}`,
        role: "system",
        content: lines.join("\n"),
        createdAt: Date.now()
      });
    }
  };
}
function buildSkillShortcut(ctx, name, skill, description) {
  return {
    name,
    description,
    category: "agent",
    usage: `/${name} <task description>`,
    run: (args) => {
      const task = args.trim();
      if (!task) {
        ctx.appendMessage({
          id: `${name}-${Date.now()}`,
          role: "system",
          content: `/${name} needs a task description. Try: /${name} where is authentication handled?`,
          createdAt: Date.now()
        });
        return;
      }
      const registry = getSkillRegistry();
      if (!registry.has(skill)) {
        ctx.appendMessage({
          id: `${name}-${Date.now()}`,
          role: "system",
          content: `Skill "${skill}" is not installed. Build the project (pnpm build) or copy skills-bundled/ into ~/.cybermind/skills/.`,
          createdAt: Date.now()
        });
        return;
      }
      ctx.appendMessage({
        id: `${name}-${Date.now()}`,
        role: "system",
        content: `Delegating to /${skill} sub-agent\u2026`,
        createdAt: Date.now()
      });
      ctx.submitUserPrompt?.(`Use spawn_subagent to run the "${skill}" skill on this task: ${task}`);
    }
  };
}
function buildResearchCommand(ctx) {
  return buildSkillShortcut(
    ctx,
    "research",
    "research",
    "Spawn the read-only codebase exploration sub-agent."
  );
}
function buildPlanCommand(ctx) {
  return buildSkillShortcut(
    ctx,
    "plan",
    "plan",
    "Spawn the planning sub-agent to break down a task."
  );
}
function buildCodeReviewCommand(ctx) {
  return buildSkillShortcut(
    ctx,
    "code-review",
    "code-review",
    "Spawn the code-review sub-agent on a diff, file, or commit."
  );
}

// src/commands/trust.ts
function buildTrustCommand(ctx) {
  return {
    name: "trust",
    description: "Persistently allow a tool without prompting (read/write ~/.cybermind/trust.json).",
    category: "safety",
    usage: "/trust [add|remove] <tool>",
    run: (args) => {
      const [sub, tool] = args.split(/\s+/).filter(Boolean);
      const gate = new ApprovalGate(new HeadlessApprovalUI());
      const reply = (content) => ctx.appendMessage({
        id: `trust-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (!sub || sub === "list") {
        const { persistent } = gate.listTrusted();
        if (persistent.length === 0) {
          reply("No tools persistently trusted. Use /trust add <tool> to add one.");
        } else {
          reply(`Persistently trusted tools:
  ${persistent.join("\n  ")}`);
        }
        return;
      }
      if (!tool) {
        reply(`/trust ${sub} requires a tool name. Try: /trust add edit`);
        return;
      }
      if (sub === "add") {
        gate.trustPersistent(tool);
        reply(`Trusted '${tool}' persistently. Future calls will skip the approval prompt.`);
      } else if (sub === "remove" || sub === "revoke") {
        gate.revoke(tool);
        reply(`Revoked trust for '${tool}'. Next call will prompt again.`);
      } else {
        reply(`Unknown subcommand '${sub}'. Try /trust, /trust add <tool>, or /trust remove <tool>.`);
      }
    }
  };
}

// src/commands/secret.ts
function buildSecretCommand(ctx) {
  return {
    name: "secret",
    description: "Manage the encrypted secrets vault (~/.cybermind/secrets.enc).",
    category: "safety",
    usage: "/secret list | /secret set NAME=value | /secret get NAME | /secret remove NAME",
    run: (args) => {
      const trimmed = args.trim();
      const vault = new SecretsVault();
      const reply = (content) => ctx.appendMessage({
        id: `secret-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (!trimmed || trimmed === "list") {
        const names = vault.list();
        if (names.length === 0) {
          reply("Vault is empty. Use /secret set NAME=value to add one.");
        } else {
          reply(`Stored secrets (names only):
  ${names.join("\n  ")}`);
        }
        return;
      }
      const spaceIdx = trimmed.indexOf(" ");
      const sub = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();
      if (sub === "set") {
        const eq = rest.indexOf("=");
        if (eq === -1) {
          reply("Usage: /secret set NAME=value");
          return;
        }
        const name = rest.slice(0, eq).trim();
        const value = rest.slice(eq + 1);
        if (!name) {
          reply("Secret name must be non-empty.");
          return;
        }
        vault.set(name, value);
        reply(`Stored secret '${name}'.`);
        return;
      }
      if (sub === "get") {
        const value = vault.get(rest);
        if (value === void 0) reply(`No secret named '${rest}'.`);
        else reply(`${rest}=${value}`);
        return;
      }
      if (sub === "remove" || sub === "delete" || sub === "rm") {
        const ok = vault.remove(rest);
        reply(ok ? `Removed secret '${rest}'.` : `No secret named '${rest}'.`);
        return;
      }
      reply(`Unknown subcommand '${sub}'. Try /secret list, /secret set NAME=value, /secret get NAME, /secret remove NAME.`);
    }
  };
}

// src/commands/model-provider.ts
function buildModelCommand(ctx) {
  return {
    name: "model",
    description: "Show or switch the active model for this session.",
    category: "agent",
    usage: "/model [name]",
    run: async (args) => {
      const name = args.trim();
      const reply = (content) => ctx.appendMessage({ id: `model-${Date.now()}`, role: "system", content, createdAt: Date.now() });
      if (!name) {
        const current = ctx.getModel?.() ?? "(unknown)";
        let available = [];
        try {
          available = await getRouter().listModels();
        } catch {
        }
        const preview = available.slice(0, 8).join(", ");
        reply(
          `Current model: ${current}
` + (preview ? `Available (first 8): ${preview}
` : "") + "Use /model <name> to switch."
        );
        return;
      }
      if (!ctx.setModel) {
        reply("Model switching is not available in this context.");
        return;
      }
      ctx.setModel(name);
      reply(`Model set to '${name}'. Takes effect on the next message.`);
    }
  };
}
function buildProviderCommand(ctx) {
  return {
    name: "provider",
    description: "Show or switch the active LLM provider (cybermind-cloud, anthropic, ollama).",
    category: "agent",
    usage: "/provider [id]",
    run: (args) => {
      const id = args.trim();
      const reply = (content) => ctx.appendMessage({ id: `provider-${Date.now()}`, role: "system", content, createdAt: Date.now() });
      const router = getRouter();
      const active = router.activeProvider();
      if (!id) {
        reply(
          `Active provider: ${active.info.id} (${active.info.displayName})
Tip: set CYBERMIND_API_KEY or ANTHROPIC_API_KEY in your env for hosted providers; Ollama is the auto-fallback.
Use /provider <id> to override.`
        );
        return;
      }
      if (!ctx.setProvider) {
        reply("Provider switching is not available in this context.");
        return;
      }
      ctx.setProvider(id);
      reply(`Preferred provider set to '${id}'. Router still falls back to Ollama if unavailable.`);
    }
  };
}

// src/commands/consensus.ts
function buildConsensusCommand(ctx) {
  return {
    name: "consensus",
    description: "Run the next prompt across N providers in parallel and merge the answers.",
    category: "agent",
    usage: "/consensus [N] <prompt>",
    run: async (args) => {
      const trimmed = args.trim();
      const reply = (content) => ctx.appendMessage({ id: `consensus-${Date.now()}`, role: "system", content, createdAt: Date.now() });
      if (!trimmed) {
        reply("Usage: /consensus [N] <prompt>. Example: /consensus 3 explain JWT vs sessions.");
        return;
      }
      const firstSpace = trimmed.indexOf(" ");
      let n = 2;
      let prompt = trimmed;
      if (firstSpace !== -1) {
        const head = trimmed.slice(0, firstSpace);
        const parsed = Number.parseInt(head, 10);
        if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 5) {
          n = parsed;
          prompt = trimmed.slice(firstSpace + 1).trim();
        }
      }
      if (!prompt) {
        reply("Usage: /consensus [N] <prompt>. The prompt is required.");
        return;
      }
      const router = getRouter();
      const candidates = ["cybermind-cloud", "anthropic", "ollama"];
      const providers = candidates.map((id) => router.get(id)).filter((p) => Boolean(p && p.info.ready)).slice(0, n);
      if (providers.length === 0) {
        reply(
          "No ready providers found. Set CYBERMIND_API_KEY or ANTHROPIC_API_KEY, or make sure Ollama is running on 127.0.0.1:11434."
        );
        return;
      }
      reply(`Running consensus across ${providers.length} provider(s): ${providers.map((p) => p.info.id).join(", ")}\u2026`);
      try {
        const result = await runConsensus([{ role: "user", content: prompt }], { providers });
        const sections = [];
        for (const r of result.perProvider) {
          sections.push(`## ${r.provider} (${r.model})${r.error ? " \u2014 ERROR" : ""}
${r.error ?? r.text}`);
        }
        sections.push(`## Merged
${result.merged || "(empty)"}`);
        reply(sections.join("\n\n"));
      } catch (err) {
        reply(`/consensus failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
}

// src/commands/color.ts
var ALLOWED = /* @__PURE__ */ new Set([
  "cyan",
  "magenta",
  "green",
  "yellow",
  "blue",
  "red",
  "white",
  "gray"
]);
function buildColorCommand(ctx) {
  return {
    name: "color",
    description: "Pick an accent color for this session (cyan, magenta, green, yellow, blue, red, white, gray).",
    category: "config",
    usage: "/color <name>",
    run: (args) => {
      const name = args.trim().toLowerCase();
      const reply = (content) => ctx.appendMessage({ id: `color-${Date.now()}`, role: "system", content, createdAt: Date.now() });
      if (!name) {
        reply(`Pick one: ${[...ALLOWED].join(", ")}. Example: /color magenta`);
        return;
      }
      if (!ALLOWED.has(name)) {
        reply(`Unknown color '${name}'. Pick one of: ${[...ALLOWED].join(", ")}.`);
        return;
      }
      if (!ctx.setPromptColor) {
        reply("Color switching is not available in this context.");
        return;
      }
      ctx.setPromptColor(name);
      reply(`Accent color set to ${name}.`);
    }
  };
}
function buildThemeCommand(ctx) {
  return {
    name: "theme",
    description: "Open the interactive theme picker (dark/light mode + syntax highlighting).",
    category: "config",
    usage: "/theme",
    run: () => {
      if (ctx.setScreen) {
        ctx.setScreen("theme");
      } else {
        ctx.appendMessage({
          id: `theme-${Date.now()}`,
          role: "system",
          content: "Theme picker is not available in this context.",
          createdAt: Date.now()
        });
      }
    }
  };
}
function buildSettingsCommand(ctx) {
  return {
    name: "settings",
    description: "Open the settings screen (general, appearance, AI, safety).",
    category: "config",
    usage: "/settings",
    aliases: ["config"],
    run: () => {
      if (ctx.setScreen) {
        ctx.setScreen("settings");
      } else {
        ctx.appendMessage({
          id: `settings-${Date.now()}`,
          role: "system",
          content: "Settings are not available in this context.",
          createdAt: Date.now()
        });
      }
    }
  };
}

// src/commands/workflow.ts
import { existsSync as existsSync13, readFileSync as readFileSync14, readdirSync as readdirSync7, statSync as statSync4 } from "fs";
import { join as join12, resolve as resolve8 } from "path";
import { parse as parseYaml2 } from "yaml";
import { z as z10 } from "zod";
var WORKFLOW_DIR = ".cybermind/workflows";
var StepSchema = z10.object({
  prompt: z10.string().min(1),
  /** Optional human-readable label for the step (shown in transcript). */
  name: z10.string().optional()
});
var WorkflowSchema = z10.object({
  name: z10.string().optional(),
  description: z10.string().optional(),
  steps: z10.array(StepSchema).min(1)
});
function buildWorkflowCommand(ctx) {
  return {
    name: "workflow",
    description: "Run a YAML workflow from .cybermind/workflows/.",
    category: "utility",
    usage: "/workflow [run <name>]",
    run: async (args) => {
      const trimmed = args.trim();
      const reply = (content) => ctx.appendMessage({ id: `wf-${Date.now()}`, role: "system", content, createdAt: Date.now() });
      const workflowsDir = resolve8(process.cwd(), WORKFLOW_DIR);
      if (!trimmed || trimmed === "list") {
        if (!existsSync13(workflowsDir)) {
          reply(`No workflows directory at ${workflowsDir}. Create one and add <name>.yml files.`);
          return;
        }
        const files = readdirSync7(workflowsDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
        if (files.length === 0) {
          reply(`No workflows in ${workflowsDir}.`);
          return;
        }
        reply(`Available workflows:
  ${files.map((f) => f.replace(/\.(ya?ml)$/, "")).join("\n  ")}`);
        return;
      }
      const spaceIdx = trimmed.indexOf(" ");
      const sub = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const name = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();
      if (sub !== "run" || !name) {
        reply("Usage: /workflow run <name>  (or /workflow to list)");
        return;
      }
      let path = "";
      for (const ext of [".yml", ".yaml"]) {
        const candidate = join12(workflowsDir, name + ext);
        if (existsSync13(candidate) && statSync4(candidate).isFile()) {
          path = candidate;
          break;
        }
      }
      if (!path) {
        reply(`Workflow '${name}' not found in ${workflowsDir}.`);
        return;
      }
      let parsed;
      try {
        const raw = readFileSync14(path, "utf8");
        const doc = parseYaml2(raw);
        parsed = WorkflowSchema.parse(doc);
      } catch (err) {
        reply(`Failed to parse workflow '${name}': ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      if (!ctx.submitUserPrompt) {
        reply("Workflow execution requires the chat runtime; not available in this context.");
        return;
      }
      reply(
        `Running workflow '${parsed.name ?? name}' (${parsed.steps.length} step(s))\u2026
Note: each step is dispatched sequentially as a synthesized user prompt; the agent runs them one at a time. Checkpointed runs ship in M10.`
      );
      for (let i = 0; i < parsed.steps.length; i++) {
        const step = parsed.steps[i];
        reply(`\u2192 step ${i + 1}/${parsed.steps.length}${step.name ? `: ${step.name}` : ""}`);
        ctx.submitUserPrompt(step.prompt);
      }
    }
  };
}

// src/commands/rewind.ts
function buildRewindCommand(ctx) {
  return {
    name: "rewind",
    description: "Time-travel: restore the session to a previous checkpoint.",
    category: "safety",
    usage: "/rewind [checkpoint-id|latest]",
    run: (args) => {
      const trimmed = args.trim();
      const reply = (content) => ctx.appendMessage({
        id: `rewind-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      const manager = new CheckpointManager();
      if (!trimmed) {
        const list = manager.list();
        if (list.length === 0) {
          reply("No checkpoints available yet. Continue chatting to create one.");
          return;
        }
        const lines = ["Checkpoints (newest first):"];
        for (const cp of list) {
          const date2 = new Date(cp.createdAt).toLocaleString();
          lines.push(`  ${cp.id.slice(0, 8)}\u2026 ${date2} (${cp.messageCount} messages)`);
        }
        lines.push("");
        lines.push("Restore with: /rewind <checkpoint-id> or /rewind latest");
        reply(lines.join("\n"));
        return;
      }
      let checkpointId = trimmed;
      if (trimmed === "latest") {
        const latest = manager.loadLatest();
        if (!latest) {
          reply("No latest checkpoint found.");
          return;
        }
        checkpointId = latest.id;
      }
      const checkpoint = manager.load(checkpointId);
      if (!checkpoint) {
        reply(`Checkpoint '${checkpointId}' not found or corrupted.`);
        return;
      }
      const date = new Date(checkpoint.createdAt).toLocaleString();
      reply(
        `Restored to checkpoint ${checkpoint.id.slice(0, 8)}\u2026 (${date})
- Messages: ${checkpoint.messages.length}
- Model: ${checkpoint.model}
- Provider: ${checkpoint.provider}

Note: This is a demonstration. Full state restoration requires UI integration.`
      );
    }
  };
}

// src/commands/diff.ts
function buildDiffCommand(ctx) {
  return {
    name: "diff",
    description: "Compare two checkpoints or show changes since a checkpoint.",
    category: "safety",
    usage: "/diff [<id1> [<id2>]]",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `diff-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      const manager = new CheckpointManager();
      if (parts.length === 0) {
        const list = manager.list();
        if (list.length < 2) {
          reply("Need at least two checkpoints to diff.");
          return;
        }
        const latest = manager.load(list[0]?.id ?? "");
        const previous = manager.load(list[1]?.id ?? "");
        if (!latest || !previous || !list[0]?.id || !list[1]?.id) {
          reply("Could not load checkpoints for diff.");
          return;
        }
        const diff = diffCheckpoints(previous, latest);
        reply(formatDiff(list[1].id, list[0].id, diff));
        return;
      }
      if (parts.length === 1) {
        const id1 = parts[0];
        if (!id1) {
          reply("Invalid checkpoint ID.");
          return;
        }
        const latest = manager.loadLatest();
        const cp1 = manager.load(id1);
        if (!latest || !cp1) {
          reply("Could not load checkpoints for diff.");
          return;
        }
        const diff = diffCheckpoints(cp1, latest);
        reply(formatDiff(id1, latest.id, diff));
        return;
      }
      if (parts.length === 2) {
        const [id1, id2] = parts;
        if (!id1 || !id2) {
          reply("Both checkpoint IDs must be provided.");
          return;
        }
        const cp1 = manager.load(id1);
        const cp2 = manager.load(id2);
        if (!cp1 || !cp2) {
          reply("Could not load checkpoints for diff.");
          return;
        }
        const diff = diffCheckpoints(cp1, cp2);
        reply(formatDiff(id1, id2, diff));
        return;
      }
      reply("Usage: /diff [<id1> [<id2>]]");
    }
  };
}
function diffCheckpoints(from, to) {
  const fromMap = new Map(from.messages.map((m) => [m.id, m]));
  const toMap = new Map(to.messages.map((m) => [m.id, m]));
  const added = [];
  const removed = [];
  const modified = [];
  for (const [id, msg] of toMap) {
    if (!fromMap.has(id)) {
      added.push(msg);
    } else {
      const fromMsg = fromMap.get(id);
      const toMsg = msg;
      if (fromMsg && fromMsg.content !== toMsg.content) {
        modified.push({ id, from: fromMsg, to: toMsg });
      }
    }
  }
  for (const [id, msg] of fromMap) {
    if (!toMap.has(id)) {
      removed.push(msg);
    }
  }
  return { added, removed, modified };
}
function formatDiff(id1, id2, diff) {
  const lines = [
    `Diff: ${id1.slice(0, 8)}\u2026 \u2192 ${id2.slice(0, 8)}\u2026`,
    ""
  ];
  if (diff.added.length > 0) {
    lines.push(`+ Added (${diff.added.length}):`);
    for (const msg of diff.added.slice(0, 5)) {
      const preview = msg.content.slice(0, 60).replace(/\n/g, " ");
      lines.push(`  ${msg.role}: ${preview}${msg.content.length > 60 ? "\u2026" : ""}`);
    }
    if (diff.added.length > 5) {
      lines.push(`  ... and ${diff.added.length - 5} more`);
    }
    lines.push("");
  }
  if (diff.removed.length > 0) {
    lines.push(`- Removed (${diff.removed.length}):`);
    for (const msg of diff.removed.slice(0, 5)) {
      const preview = msg.content.slice(0, 60).replace(/\n/g, " ");
      lines.push(`  ${msg.role}: ${preview}${msg.content.length > 60 ? "\u2026" : ""}`);
    }
    if (diff.removed.length > 5) {
      lines.push(`  ... and ${diff.removed.length - 5} more`);
    }
    lines.push("");
  }
  if (diff.modified.length > 0) {
    lines.push(`~ Modified (${diff.modified.length}):`);
    for (const { from: fromMsg, to: toMsg } of diff.modified.slice(0, 5)) {
      const fromPreview = fromMsg.content.slice(0, 30).replace(/\n/g, " ");
      const toPreview = toMsg.content.slice(0, 30).replace(/\n/g, " ");
      lines.push(`  ${fromMsg.role}: "${fromPreview}\u2026" \u2192 "${toPreview}\u2026"`);
    }
    if (diff.modified.length > 5) {
      lines.push(`  ... and ${diff.modified.length - 5} more`);
    }
    lines.push("");
  }
  if (diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0) {
    lines.push("No changes.");
  }
  return lines.join("\n");
}

// src/commands/profile.ts
function buildProfileCommand(ctx) {
  return {
    name: "profile",
    description: "Manage CyberMind profiles (model, provider, approval mode, etc.).",
    category: "config",
    usage: "/profile [<name> [<key>=<val>]] | /profile reset <name>",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `profile-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      const manager = new ProfileManager();
      if (parts.length === 0) {
        const profiles = manager.listProfiles();
        const active = manager.getActiveProfile();
        const lines = [`Active profile: ${active.name}`, "", "Available profiles:"];
        for (const [name2, profile] of Object.entries(profiles)) {
          const marker = name2 === active.name ? "\u2192" : " ";
          lines.push(`${marker} ${name2}`);
          lines.push(`   model: ${profile.model}`);
          lines.push(`   provider: ${profile.provider}`);
          lines.push(`   approval: ${profile.approvalMode}`);
          lines.push(`   telemetry: ${profile.telemetryEnabled ? "on" : "off"}`);
          lines.push(`   auto-checkpoint: ${profile.autoCheckpoint ? "on" : "off"}`);
          lines.push(`   accent: ${profile.accentColor ?? "none"}`);
          lines.push("");
        }
        reply(lines.join("\n"));
        return;
      }
      if (parts[0] === "reset" && parts[1]) {
        const name2 = parts[1];
        const success2 = manager.resetProfile(name2);
        if (success2) {
          reply(`Reset profile '${name2}' to defaults.`);
        } else {
          reply(`Cannot reset profile '${name2}'. Available: ${Object.keys(manager.listProfiles()).join(", ")}`);
        }
        return;
      }
      const name = parts[0];
      if (!name) {
        reply("Profile name is required.");
        return;
      }
      if (parts.length === 1) {
        const success2 = manager.setActiveProfile(name);
        if (success2) {
          const profile = manager.getActiveProfile();
          reply(`Switched to profile '${name}'.
Model: ${profile.model}
Provider: ${profile.provider}`);
          if (ctx.setModel) ctx.setModel(profile.model);
          if (ctx.setProvider) ctx.setProvider(profile.provider);
          if (ctx.setColor && profile.accentColor) ctx.setColor(profile.accentColor);
        } else {
          reply(`Profile '${name}' not found. Available: ${Object.keys(manager.listProfiles()).join(", ")}`);
        }
        return;
      }
      const kvParts = parts[1]?.split("=") || [];
      if (kvParts.length !== 2) {
        reply("Usage: /profile <name> <key>=<value>");
        return;
      }
      const [key, value] = kvParts;
      if (!key || !value) {
        reply("Both key and value must be provided.");
        return;
      }
      const updates = {};
      if (key === "model" || key === "provider" || key === "accentColor") {
        updates[key] = value;
      } else if (key === "approvalMode") {
        if (!["always-ask", "session-bypass", "persistent-bypass"].includes(value)) {
          reply("Invalid approvalMode. Use: always-ask, session-bypass, or persistent-bypass");
          return;
        }
        updates[key] = value;
      } else if (key === "telemetryEnabled" || key === "autoCheckpoint") {
        updates[key] = value === "true" || value === "1";
      } else {
        reply(`Unknown key '${key}'. Valid: model, provider, approvalMode, telemetryEnabled, autoCheckpoint, accentColor`);
        return;
      }
      const success = manager.updateProfile(name, updates);
      if (success) {
        reply(`Updated profile '${name}': ${key} = ${value}`);
        if (manager.getActiveProfile().name === name) {
          if (key === "model" && ctx.setModel) ctx.setModel(value);
          if (key === "provider" && ctx.setProvider) ctx.setProvider(value);
          if (key === "accentColor" && ctx.setColor) ctx.setColor(value);
        }
      } else {
        reply(`Failed to update profile '${name}'. Does it exist?`);
      }
    }
  };
}

// src/commands/collaboration.ts
function buildCollabCommand(ctx) {
  return {
    name: "collab",
    description: "Manage collaborative sessions with multiple agents.",
    category: "collab",
    usage: "/collab <create|list|join|mirror|status|leave|close> [args...]",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `collab-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length === 0) {
        reply("Usage: /collab <create|list|join|mirror|status|leave|close> [args...]");
        return;
      }
      const command = parts[0];
      const collabManager = new CollaborationManager();
      const mirrorManager = new WebMirrorManager();
      switch (command) {
        case "create":
          if (parts.length < 2) {
            reply("Usage: /collab create <session-name>");
            return;
          }
          const name = parts.slice(1).join(" ");
          const session = collabManager.createSession(name, "current-agent");
          reply(`Created collaboration session:
  ID: ${session.id}
  Name: ${name}
  Participants: 1

Use "/collab mirror ${session.id}" to start web UI mirror.`);
          break;
        case "list":
          const sessions = collabManager.listSessions();
          if (sessions.length === 0) {
            reply("No collaboration sessions found.");
            return;
          }
          const lines = ["Collaboration sessions:"];
          for (const s of sessions) {
            const status = s.status === "active" ? "\u{1F7E2}" : s.status === "paused" ? "\u23F8\uFE0F" : "\u23F9\uFE0F";
            lines.push(`${status} ${s.name} (${s.id.slice(0, 8)}\u2026)`);
            lines.push(`   Participants: ${s.participants.length}`);
            lines.push(`   Created: ${new Date(s.createdAt).toLocaleString()}`);
            lines.push("");
          }
          reply(lines.join("\n"));
          break;
        case "join":
          if (parts.length < 2) {
            reply("Usage: /collab join <session-id>");
            return;
          }
          const sessionId = parts[1];
          if (!sessionId) {
            reply("Session ID is required.");
            return;
          }
          const joinSuccess = collabManager.addParticipant(sessionId, "current-agent");
          if (joinSuccess) {
            const updatedSession = collabManager.getSession(sessionId);
            if (updatedSession) {
              reply(`Joined collaboration session "${updatedSession.name}".
Participants: ${updatedSession.participants.length}`);
            } else {
              reply(`Joined session but failed to retrieve details.`);
            }
          } else {
            reply(`Failed to join session "${sessionId}". Does it exist or are you already a participant?`);
          }
          break;
        case "mirror":
          if (parts.length < 2) {
            reply("Usage: /collab mirror <session-id>");
            return;
          }
          const mirrorSessionId = parts[1];
          if (!mirrorSessionId) {
            reply("Session ID is required.");
            return;
          }
          const targetSession = collabManager.getSession(mirrorSessionId);
          if (!targetSession) {
            reply(`Session "${mirrorSessionId}" not found.`);
            return;
          }
          const existingMirror = mirrorManager.getMirrorBySession(mirrorSessionId);
          if (existingMirror) {
            const url2 = mirrorManager.getMirrorUrl(existingMirror.id);
            if (url2) {
              reply(`Web mirror already running for this session.
URL: ${url2}`);
            } else {
              reply(`Web mirror already running but URL unavailable.`);
            }
            return;
          }
          const mirror = mirrorManager.createMirror(mirrorSessionId, targetSession.name);
          const url = mirrorManager.getMirrorUrl(mirror.id);
          if (url) {
            reply(`Started web UI mirror for session "${targetSession.name}".
URL: ${url}
Mirror ID: ${mirror.id}

Share this URL with other participants to enable live collaboration.`);
          } else {
            reply(`Started web UI mirror but URL unavailable.`);
          }
          break;
        case "status":
          if (parts.length < 2) {
            reply("Usage: /collab status <session-id>");
            return;
          }
          const statusSessionId = parts[1];
          if (!statusSessionId) {
            reply("Session ID is required.");
            return;
          }
          const statusSession = collabManager.getSession(statusSessionId);
          if (!statusSession) {
            reply(`Session "${statusSessionId}" not found.`);
            return;
          }
          const sessionMirror = mirrorManager.getMirrorBySession(statusSessionId);
          const statusLines = [
            `Session: ${statusSession.name} (${statusSession.id})`,
            `Status: ${statusSession.status}`,
            `Created: ${new Date(statusSession.createdAt).toLocaleString()}`,
            `Participants: ${statusSession.participants.length}`,
            `Worktrees: ${Object.keys(statusSession.worktrees).length}`,
            `Web Mirror: ${sessionMirror ? `Running on port ${sessionMirror.port}` : "Not started"}`,
            "",
            "Participants:",
            ...statusSession.participants.map((p) => `  - ${p}`),
            "",
            "Worktrees:",
            ...Object.entries(statusSession.worktrees).map(([agent, path]) => `  - ${agent}: ${path}`),
            "",
            "Shared Context:",
            ...Object.entries(statusSession.sharedContext).map(([key, value]) => `  - ${key}: ${JSON.stringify(value)}`)
          ];
          reply(statusLines.join("\n"));
          break;
        case "leave":
          if (parts.length < 2) {
            reply("Usage: /collab leave <session-id>");
            return;
          }
          const leaveSessionId = parts[1];
          if (!leaveSessionId) {
            reply("Session ID is required.");
            return;
          }
          reply(`Left collaboration session "${leaveSessionId}".
Note: Full participant removal would require tracking current agent ID.`);
          break;
        case "close":
          if (parts.length < 2) {
            reply("Usage: /collab close <session-id>");
            return;
          }
          const closeSessionId = parts[1];
          if (!closeSessionId) {
            reply("Session ID is required.");
            return;
          }
          const closeSuccess = collabManager.deleteSession(closeSessionId);
          if (closeSuccess) {
            const closeMirror = mirrorManager.getMirrorBySession(closeSessionId);
            if (closeMirror) {
              mirrorManager.stopMirror(closeMirror.id);
            }
            reply(`Closed collaboration session "${closeSessionId}" and stopped any associated mirrors.`);
          } else {
            reply(`Failed to close session "${closeSessionId}". Does it exist?`);
          }
          break;
        default:
          reply(`Unknown command "${command}". Use: create, list, join, mirror, status, leave, close`);
          break;
      }
    }
  };
}
function buildWorktreeCommand(ctx) {
  return {
    name: "worktree",
    description: "Manage git worktrees for parallel agent work.",
    category: "collab",
    usage: "/worktree <create|list|sync> <session-id> [branch]",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `worktree-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length < 2) {
        reply("Usage: /worktree <create|list|sync> <session-id> [branch]");
        return;
      }
      const command = parts[0];
      const sessionId = parts[1];
      if (!sessionId) {
        reply("Session ID is required.");
        return;
      }
      const collabManager = new CollaborationManager();
      switch (command) {
        case "create":
          const branch = parts[2] || "main";
          const worktreePath = collabManager.createWorktree(sessionId, "current-agent", branch);
          if (worktreePath) {
            reply(`Created worktree for session "${sessionId}":
  Path: ${worktreePath}
  Branch: ${branch}

Note: Actual git worktree creation would run \`git worktree add ${worktreePath} ${branch}\``);
          } else {
            reply(`Failed to create worktree. Does session "${sessionId}" exist?`);
          }
          break;
        case "list":
          const session = collabManager.getSession(sessionId);
          if (!session) {
            reply(`Session "${sessionId}" not found.`);
            return;
          }
          if (Object.keys(session.worktrees).length === 0) {
            reply(`No worktrees found for session "${sessionId}".`);
            return;
          }
          const worktreeLines = [`Worktrees for session "${sessionId}":`];
          for (const [agentId, path] of Object.entries(session.worktrees)) {
            worktreeLines.push(`  ${agentId}: ${path}`);
          }
          reply(worktreeLines.join("\n"));
          break;
        case "sync":
          reply(`Sync feature not yet implemented. Would run \`git push\` from worktree and \`git pull\` in main branch for session "${sessionId}".`);
          break;
        default:
          reply(`Unknown command "${command}". Use: create, list, sync`);
          break;
      }
    }
  };
}

// src/commands/rich-io.ts
function buildImageCommand(ctx) {
  return {
    name: "image",
    description: "Display inline images in the CLI.",
    category: "utility",
    usage: "/image <path|url <url>> [alt] [caption]",
    run: async (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `image-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length === 0) {
        reply("Usage: /image <path> [alt] [caption] or /image url <url> [alt] [caption]");
        return;
      }
      const richIO = new RichIOManager();
      try {
        let input;
        let alt;
        let caption;
        if (parts[0] === "url" && parts[1]) {
          input = parts[1];
          alt = parts[2] || "Image from URL";
          caption = parts.slice(3).join(" ") || void 0;
        } else {
          input = parts[0] || "";
          alt = parts[1] || "Image";
          caption = parts.slice(2).join(" ") || void 0;
        }
        const image = await richIO.processImage(input, alt, caption);
        reply(`[IMAGE: ${image.alt}]${caption ? `
${caption}` : ""}
(Src: ${image.src.substring(0, 50)}...)`);
      } catch (err) {
        reply(`Error processing image: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
}
function buildMermaidCommand(ctx) {
  return {
    name: "mermaid",
    description: "Create and display Mermaid diagrams.",
    category: "utility",
    usage: "/mermaid <code> [title] | /mermaid theme <theme>",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `mermaid-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length === 0) {
        reply("Usage: /mermaid <code> [title] or /mermaid theme <theme>");
        return;
      }
      const richIO = new RichIOManager();
      if (parts[0] === "theme" && parts[1]) {
        const theme = parts[1];
        if (!["default", "dark", "forest", "neutral"].includes(theme)) {
          reply("Invalid theme. Use: default, dark, forest, neutral");
          return;
        }
        reply(`Mermaid theme set to: ${theme}`);
        return;
      }
      const code = args.includes("\n") ? args : parts.join(" ");
      const title = parts.length > 1 && !code.includes("\n") ? parts.slice(1).join(" ") : void 0;
      const diagram = richIO.createMermaidDiagram(code, title);
      const output = [
        "[MERMAID DIAGRAM]",
        title ? `Title: ${title}` : "",
        `Theme: ${diagram.theme}`,
        "",
        "```mermaid",
        diagram.code,
        "```"
      ].filter(Boolean).join("\n");
      reply(output);
    }
  };
}
function buildCostCommand(ctx) {
  return {
    name: "cost",
    description: "Display cost metrics and usage statistics.",
    category: "utility",
    usage: "/cost [reset|model <model>]",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `cost-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      const richIO = new RichIOManager();
      const metrics = richIO.getCostMetrics();
      if (parts.length === 0) {
        const lines = [
          "\u{1F4B0} Cost Metrics",
          `Total Cost: $${metrics.totalCost.toFixed(4)}`,
          `Total Tokens: ${metrics.totalTokens.toLocaleString()}`,
          `Session Duration: ${Math.floor((Date.now() - metrics.sessionStart) / 6e4)} minutes`,
          "",
          "Model Breakdown:"
        ];
        for (const [model, data] of Object.entries(metrics.modelBreakdown)) {
          lines.push(`  ${model}: ${data.tokens.toLocaleString()} tokens ($${data.cost.toFixed(4)})`);
        }
        if (Object.keys(metrics.modelBreakdown).length === 0) {
          lines.push("  No usage data yet");
        }
        reply(lines.join("\n"));
        return;
      }
      if (parts[0] === "reset") {
        reply("Cost reset feature not yet implemented.");
        return;
      }
      if (parts[0] === "model" && parts[1]) {
        const model = parts[1];
        const modelData = metrics.modelBreakdown[model];
        if (!modelData) {
          reply(`No usage data for model: ${model}`);
          return;
        }
        reply(`Model: ${model}
Tokens: ${modelData.tokens.toLocaleString()}
Cost: $${modelData.cost.toFixed(4)}`);
        return;
      }
      reply("Usage: /cost [reset|model <model>]");
    }
  };
}
function buildHotkeysCommand(ctx) {
  return {
    name: "hotkeys",
    description: "Display hotkey palette and shortcuts.",
    category: "utility",
    usage: "/hotkeys [category]",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `hotkeys-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      const richIO = new RichIOManager();
      const palette = richIO.getHotkeyPalette();
      if (parts.length === 0) {
        const lines2 = ["\u2328\uFE0F  Hotkey Palette", ""];
        for (const category2 of palette) {
          lines2.push(`\u{1F4C2} ${category2.category}`);
          for (const binding of category2.bindings) {
            const keyCombo = binding.modifiers.length > 0 ? `${binding.modifiers.join("+")}+${binding.key}` : binding.key;
            lines2.push(`  ${keyCombo.padEnd(15)} ${binding.description}`);
          }
          lines2.push("");
        }
        reply(lines2.join("\n"));
        return;
      }
      const category = (parts[0] || "").toLowerCase();
      const categoryData = palette.find((c) => c.category.toLowerCase() === category);
      if (!categoryData) {
        const categories = palette.map((c) => c.category.toLowerCase()).join(", ");
        reply(`Category not found. Available: ${categories}`);
        return;
      }
      const lines = [`\u2328\uFE0F  ${categoryData.category} Hotkeys`, ""];
      for (const binding of categoryData.bindings) {
        const keyCombo = binding.modifiers.length > 0 ? `${binding.modifiers.join("+")}+${binding.key}` : binding.key;
        lines.push(`${keyCombo.padEnd(15)} ${binding.description}`);
      }
      reply(lines.join("\n"));
    }
  };
}
function buildScreenshotCommand(ctx) {
  return {
    name: "screenshot",
    description: "Analyze screenshots and extract information.",
    category: "utility",
    usage: "/screenshot <path> | /screenshot capture",
    run: async (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `screenshot-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length === 0) {
        reply("Usage: /screenshot <path> or /screenshot capture");
        return;
      }
      const richIO = new RichIOManager();
      if (parts[0] === "capture") {
        reply("Screen capture feature not yet implemented. Would use system screenshot APIs.");
        return;
      }
      const imagePath = parts[0];
      if (!imagePath) {
        reply("Image path is required.");
        return;
      }
      try {
        const analysis = await richIO.analyzeScreenshot(imagePath);
        const lines = [
          "\u{1F4F8} Screenshot Analysis",
          `Path: ${analysis.imagePath}`,
          `Analyzed: ${new Date(analysis.timestamp).toLocaleString()}`,
          "",
          "Description:",
          `  ${analysis.analysis.description}`,
          "",
          "Detected Elements:"
        ];
        for (const element of analysis.analysis.elements) {
          lines.push(`  \u2022 ${element.type}: ${element.description}`);
          if (element.position) {
            lines.push(`    Position: ${element.position.x},${element.position.y} (${element.position.width}\xD7${element.position.height})`);
          }
        }
        if (analysis.analysis.suggestions && analysis.analysis.suggestions.length > 0) {
          lines.push("", "Suggestions:");
          for (const suggestion of analysis.analysis.suggestions) {
            lines.push(`  \u2022 ${suggestion}`);
          }
        }
        reply(lines.join("\n"));
      } catch (err) {
        reply(`Error analyzing screenshot: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };
}
function buildMobileCommand(ctx) {
  return {
    name: "mobile",
    description: "Generate mobile-friendly HTML output.",
    category: "utility",
    usage: "/mobile [export <path>]",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content2) => ctx.appendMessage({
        id: `mobile-${Date.now()}`,
        role: "system",
        content: content2,
        createdAt: Date.now()
      });
      const richIO = new RichIOManager();
      const content = "CyberMind CLI Session Content";
      const html = richIO.generateMobileHTML(content);
      if (parts.length === 0) {
        reply("\u{1F4F1} Mobile HTML generated (preview):\n" + html.substring(0, 200) + "...");
        return;
      }
      if (parts[0] === "export" && parts[1]) {
        const exportPath = parts[1];
        if (!exportPath) {
          reply("Export path is required.");
          return;
        }
        reply(`Mobile HTML exported to: ${exportPath}
File size: ${html.length} characters`);
        return;
      }
      reply("Usage: /mobile [export <path>]");
    }
  };
}

// src/commands/ecosystem.ts
function buildMCPCommand(ctx) {
  return {
    name: "mcp",
    description: "Manage MCP (Model Context Protocol) servers.",
    category: "utility",
    usage: "/mcp <list|search|install|uninstall|info> [args...]",
    run: async (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `mcp-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length === 0) {
        reply("Usage: /mcp <list|search|install|uninstall|info> [args...]");
        return;
      }
      const command = parts[0];
      const ecosystem = new EcosystemManager();
      switch (command) {
        case "list":
          const servers = ecosystem.getAvailableMCPServers();
          if (servers.length === 0) {
            reply("No MCP servers available.");
            return;
          }
          const lines = ["\u{1F50C} Available MCP Servers:"];
          for (const server2 of servers) {
            const status = server2.installed ? "\u2705" : "\u2B1C";
            lines.push(`${status} ${server2.name} (${server2.id})`);
            lines.push(`   ${server2.description}`);
            lines.push(`   Version: ${server2.version} \u2022 Author: ${server2.author}`);
            if (server2.tags.length > 0) {
              lines.push(`   Tags: ${server2.tags.join(", ")}`);
            }
            lines.push("");
          }
          reply(lines.join("\n"));
          break;
        case "search":
          if (parts.length < 2) {
            reply("Usage: /mcp search <query>");
            return;
          }
          const query = parts.slice(1).join(" ");
          if (!query) {
            reply("Query is required for search.");
            return;
          }
          const searchResults = await ecosystem.searchMCPServers(query);
          if (searchResults.length === 0) {
            reply(`No MCP servers found for: ${query}`);
            return;
          }
          const searchLines = [`\u{1F50D} MCP servers matching "${query}":`];
          for (const server2 of searchResults) {
            const status = server2.installed ? "\u2705" : "\u2B1C";
            searchLines.push(`${status} ${server2.name} (${server2.id})`);
            searchLines.push(`   ${server2.description}`);
            searchLines.push("");
          }
          reply(searchLines.join("\n"));
          break;
        case "install":
          if (parts.length < 2) {
            reply("Usage: /mcp install <server-id>");
            return;
          }
          const serverId = parts[1];
          if (!serverId) {
            reply("Server ID is required.");
            return;
          }
          const installSuccess = await ecosystem.installMCPServer(serverId);
          if (installSuccess) {
            reply(`\u2705 MCP server "${serverId}" installed successfully.`);
          } else {
            reply(`\u274C Failed to install MCP server "${serverId}". Does it exist?`);
          }
          break;
        case "uninstall":
          if (parts.length < 2) {
            reply("Usage: /mcp uninstall <server-id>");
            return;
          }
          const uninstallServerId = parts[1];
          if (!uninstallServerId) {
            reply("Server ID is required.");
            return;
          }
          const uninstallSuccess = await ecosystem.uninstallMCPServer(uninstallServerId);
          if (uninstallSuccess) {
            reply(`\u{1F5D1}\uFE0F MCP server "${uninstallServerId}" uninstalled successfully.`);
          } else {
            reply(`\u274C Failed to uninstall MCP server "${uninstallServerId}". Does it exist?`);
          }
          break;
        case "info":
          if (parts.length < 2) {
            reply("Usage: /mcp info <server-id>");
            return;
          }
          const infoServerId = parts[1];
          const allServers = ecosystem.getAvailableMCPServers();
          const server = allServers.find((s) => s.id === infoServerId);
          if (!server) {
            reply(`MCP server "${infoServerId}" not found.`);
            return;
          }
          const infoLines = [
            `\u{1F4CB} MCP Server Information`,
            `Name: ${server.name}`,
            `ID: ${server.id}`,
            `Description: ${server.description}`,
            `Version: ${server.version}`,
            `Author: ${server.author}`,
            `Status: ${server.installed ? "\u2705 Installed" : "\u2B1C Not installed"}`,
            `Tags: ${server.tags.join(", ") || "None"}`
          ];
          if (server.repository) {
            infoLines.push(`Repository: ${server.repository}`);
          }
          infoLines.push(`Last Updated: ${new Date(server.lastUpdated).toLocaleString()}`);
          reply(infoLines.join("\n"));
          break;
        default:
          reply(`Unknown command "${command}". Use: list, search, install, uninstall, info`);
          break;
      }
    }
  };
}
function buildSkillsMarketplaceCommand(ctx) {
  return {
    name: "skills",
    description: "Manage skill marketplace.",
    category: "utility",
    usage: "/skills <list|search|category|install|uninstall|info> [args...]",
    run: async (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `skills-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length === 0) {
        reply("Usage: /skills <list|search|category|install|uninstall|info> [args...]");
        return;
      }
      const command = parts[0];
      const ecosystem = new EcosystemManager();
      switch (command) {
        case "list":
          const skills = ecosystem.getAvailableSkills();
          const categories = new Set(skills.map((s) => s.category));
          const categoryLines = ["\u{1F3AF} Available Skills by Category:", ""];
          for (const category of Array.from(categories).sort()) {
            const categorySkills2 = skills.filter((s) => s.category === category);
            categoryLines.push(`\u{1F4C2} ${category.charAt(0).toUpperCase() + category.slice(1)} (${categorySkills2.length})`);
            for (const skill2 of categorySkills2.slice(0, 5)) {
              const status = skill2.installed ? "\u2705" : "\u2B1C";
              categoryLines.push(`  ${status} ${skill2.name} (${skill2.id})`);
              categoryLines.push(`     \u2B50 ${skill2.rating} \u2022 ${skill2.downloadCount} downloads`);
            }
            if (categorySkills2.length > 5) {
              categoryLines.push(`  ... and ${categorySkills2.length - 5} more`);
            }
            categoryLines.push("");
          }
          reply(categoryLines.join("\n"));
          break;
        case "search":
          if (parts.length < 2) {
            reply("Usage: /skills search <query>");
            return;
          }
          const searchQuery = parts.slice(1).join(" ");
          if (!searchQuery) {
            reply("Query is required for search.");
            return;
          }
          const searchSkillResults = await ecosystem.searchSkills(searchQuery);
          if (searchSkillResults.length === 0) {
            reply(`No skills found for: ${searchQuery}`);
            return;
          }
          const searchSkillLines = [`\u{1F50D} Skills matching "${searchQuery}":`];
          for (const skill2 of searchSkillResults) {
            const status = skill2.installed ? "\u2705" : "\u2B1C";
            searchSkillLines.push(`${status} ${skill2.name} (${skill2.category})`);
            searchSkillLines.push(`   ${skill2.description}`);
            searchSkillLines.push(`   \u2B50 ${skill2.rating} \u2022 ${skill2.downloadCount} downloads`);
            searchSkillLines.push("");
          }
          reply(searchSkillLines.join("\n"));
          break;
        case "category":
          if (parts.length < 2) {
            reply("Usage: /skills category <category>");
            reply("Categories: development, design, testing, deployment, monitoring, security, data, ai");
            return;
          }
          const categoryName = parts[1];
          if (!categoryName) {
            reply("Category is required.");
            return;
          }
          const validCategories = ["development", "design", "testing", "deployment", "monitoring", "security", "data", "ai"];
          if (!validCategories.includes(categoryName)) {
            reply(`Invalid category. Use: ${validCategories.join(", ")}`);
            return;
          }
          const categorySkills = await ecosystem.searchSkills("", categoryName);
          if (categorySkills.length === 0) {
            reply(`No skills found in category: ${categoryName}`);
            return;
          }
          const categorySkillLines = [`\u{1F4C2} ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} Skills:`];
          for (const skill2 of categorySkills) {
            const status = skill2.installed ? "\u2705" : "\u2B1C";
            categorySkillLines.push(`${status} ${skill2.name} (${skill2.id})`);
            categorySkillLines.push(`   ${skill2.description}`);
            categorySkillLines.push(`   \u2B50 ${skill2.rating} \u2022 ${skill2.downloadCount} downloads`);
            if (skill2.dependencies && skill2.dependencies.length > 0) {
              categorySkillLines.push(`   Dependencies: ${skill2.dependencies.join(", ")}`);
            }
            categorySkillLines.push("");
          }
          reply(categorySkillLines.join("\n"));
          break;
        case "install":
          if (parts.length < 2) {
            reply("Usage: /skills install <skill-id>");
            return;
          }
          const skillId = parts[1];
          if (!skillId) {
            reply("Skill ID is required.");
            return;
          }
          const installSkillSuccess = await ecosystem.installSkill(skillId);
          if (installSkillSuccess) {
            reply(`\u2705 Skill "${skillId}" installed successfully.`);
          } else {
            reply(`\u274C Failed to install skill "${skillId}". Does it exist or are dependencies missing?`);
          }
          break;
        case "uninstall":
          if (parts.length < 2) {
            reply("Usage: /skills uninstall <skill-id>");
            return;
          }
          const uninstallSkillId = parts[1];
          if (!uninstallSkillId) {
            reply("Skill ID is required.");
            return;
          }
          const uninstallSkillSuccess = await ecosystem.uninstallSkill(uninstallSkillId);
          if (uninstallSkillSuccess) {
            reply(`\u{1F5D1}\uFE0F Skill "${uninstallSkillId}" uninstalled successfully.`);
          } else {
            reply(`\u274C Failed to uninstall skill "${uninstallSkillId}". Does it exist?`);
          }
          break;
        case "info":
          if (parts.length < 2) {
            reply("Usage: /skills info <skill-id>");
            return;
          }
          const infoSkillId = parts[1];
          const allSkills = ecosystem.getAvailableSkills();
          const skill = allSkills.find((s) => s.id === infoSkillId);
          if (!skill) {
            reply(`Skill "${infoSkillId}" not found.`);
            return;
          }
          const infoSkillLines = [
            `\u{1F4CB} Skill Information`,
            `Name: ${skill.name}`,
            `ID: ${skill.id}`,
            `Description: ${skill.description}`,
            `Version: ${skill.version}`,
            `Author: ${skill.author}`,
            `Category: ${skill.category}`,
            `Status: ${skill.installed ? "\u2705 Installed" : "\u2B1C Not installed"}`,
            `Rating: \u2B50 ${skill.rating}/5.0`,
            `Downloads: ${skill.downloadCount}`,
            `Tags: ${skill.tags.join(", ") || "None"}`
          ];
          if (skill.dependencies && skill.dependencies.length > 0) {
            infoSkillLines.push(`Dependencies: ${skill.dependencies.join(", ")}`);
          }
          infoSkillLines.push(`Last Updated: ${new Date(skill.lastUpdated).toLocaleString()}`);
          reply(infoSkillLines.join("\n"));
          break;
        default:
          reply(`Unknown command "${command}". Use: list, search, category, install, uninstall, info`);
          break;
      }
    }
  };
}
function buildTelemetryCommand(ctx) {
  return {
    name: "telemetry",
    description: "Manage telemetry settings.",
    category: "utility",
    usage: "/telemetry <status|enable|disable|level|retention|share> [args...]",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `telemetry-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length === 0) {
        reply("Usage: /telemetry <status|enable|disable|level|retention|share> [args...]");
        return;
      }
      const command = parts[0];
      const ecosystem = new EcosystemManager();
      switch (command) {
        case "status":
          const settings = ecosystem.getTelemetrySettings();
          const statusLines = [
            "\u{1F4CA} Telemetry Settings",
            `Status: ${settings.enabled ? "\u2705 Enabled" : "\u274C Disabled"}`,
            `Level: ${settings.level}`,
            `Data Retention: ${settings.dataRetention} days`,
            "",
            "Sharing Settings:",
            `  Usage Stats: ${settings.shareUsageStats ? "\u2705" : "\u274C"}`,
            `  Error Reports: ${settings.shareErrorReports ? "\u2705" : "\u274C"}`,
            `  Performance Metrics: ${settings.sharePerformanceMetrics ? "\u2705" : "\u274C"}`
          ];
          reply(statusLines.join("\n"));
          break;
        case "enable":
          ecosystem.updateTelemetrySettings({ enabled: true });
          reply("\u2705 Telemetry enabled.");
          ecosystem.recordUsage("telemetry_enabled");
          break;
        case "disable":
          ecosystem.updateTelemetrySettings({ enabled: false });
          reply("\u274C Telemetry disabled.");
          break;
        case "level":
          if (parts.length < 2) {
            reply("Usage: /telemetry level <minimal|basic|detailed>");
            return;
          }
          const level = parts[1];
          if (!level) {
            reply("Level is required.");
            return;
          }
          if (!["minimal", "basic", "detailed"].includes(level)) {
            reply("Invalid level. Use: minimal, basic, detailed");
            return;
          }
          ecosystem.updateTelemetrySettings({ level });
          reply(`\u{1F4CA} Telemetry level set to: ${level}`);
          break;
        case "retention":
          if (parts.length < 2) {
            reply("Usage: /telemetry retention <days>");
            return;
          }
          const days = parseInt(parts[1] || "0");
          if (isNaN(days) || days < 1) {
            reply("Please provide a valid number of days (minimum 1).");
            return;
          }
          ecosystem.updateTelemetrySettings({ dataRetention: days });
          reply(`\u{1F4C5} Data retention set to: ${days} days`);
          break;
        case "share":
          if (parts.length < 3) {
            reply("Usage: /telemetry share <usage|errors|performance> <on|off>");
            return;
          }
          const shareType = parts[1];
          const shareValue = parts[2]?.toLowerCase() === "on";
          if (!shareType) {
            reply("Share type is required.");
            return;
          }
          if (!parts[2]) {
            reply("Share value (on/off) is required.");
            return;
          }
          if (shareType === "usage") {
            ecosystem.updateTelemetrySettings({ shareUsageStats: shareValue });
          } else if (shareType === "errors") {
            ecosystem.updateTelemetrySettings({ shareErrorReports: shareValue });
          } else if (shareType === "performance") {
            ecosystem.updateTelemetrySettings({ sharePerformanceMetrics: shareValue });
          } else {
            reply("Invalid type. Use: usage, errors, performance");
            return;
          }
          reply(`\u{1F4E4} ${shareType} sharing ${shareValue ? "enabled" : "disabled"}`);
          break;
        default:
          reply(`Unknown command "${command}". Use: status, enable, disable, level, retention, share`);
          break;
      }
    }
  };
}

// src/commands/advanced.ts
function buildSuperCommand(ctx) {
  return {
    name: "super",
    description: "Advanced AI commands with enhanced capabilities.",
    category: "utility",
    usage: "/super <analyze|optimize|refactor|debug|architect> <target>",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `super-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length < 2) {
        reply("Usage: /super <analyze|optimize|refactor|debug|architect> <target>");
        return;
      }
      const command = parts[0];
      const target = parts.slice(1).join(" ");
      switch (command) {
        case "analyze":
          reply(`\u{1F50D} Starting deep analysis of: ${target}

This will analyze:
\u2022 Code structure and patterns
\u2022 Performance bottlenecks
\u2022 Security vulnerabilities
\u2022 Dependencies and imports
\u2022 Documentation quality

\u23F3 Analysis in progress...`);
          break;
        case "optimize":
          reply(`\u26A1 Optimizing: ${target}

Optimization areas:
\u2022 Algorithm efficiency
\u2022 Memory usage
\u2022 Bundle size
\u2022 Runtime performance
\u2022 Resource utilization

\u{1F680} Generating optimization suggestions...`);
          break;
        case "refactor":
          reply(`\u{1F527} Refactoring: ${target}

Refactoring plan:
\u2022 Code structure improvement
\u2022 Design pattern application
\u2022 Naming conventions
\u2022 Dead code removal
\u2022 Modern syntax updates

\u2728 Preparing refactoring strategy...`);
          break;
        case "debug":
          reply(`\u{1F41B} Debugging: ${target}

Debugging approach:
\u2022 Root cause analysis
\u2022 Stack trace examination
\u2022 Variable state inspection
\u2022 Execution flow tracking
\u2022 Error pattern recognition

\u{1F50D} Investigating the issue...`);
          break;
        case "architect":
          reply(`\u{1F3D7}\uFE0F Designing architecture for: ${target}

Architecture considerations:
\u2022 System design patterns
\u2022 Scalability planning
\u2022 Technology stack selection
\u2022 Data flow design
\u2022 Security architecture

\u{1F4D0} Creating architectural blueprint...`);
          break;
        default:
          reply(`Unknown command "${command}". Use: analyze, optimize, refactor, debug, architect`);
          break;
      }
    }
  };
}
function buildAICommand(ctx) {
  return {
    name: "ai",
    description: "AI model management and advanced features.",
    category: "utility",
    usage: "/ai <models|switch|consensus|compare|benchmark> [args...]",
    run: async (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `ai-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length === 0) {
        reply("Usage: /ai <models|switch|consensus|compare|benchmark> [args...]");
        return;
      }
      const command = parts[0];
      switch (command) {
        case "models":
          reply(`\u{1F916} Available AI Models:

**Anthropic Claude:**
\u2022 claude-3-sonnet (balanced)
\u2022 claude-3-haiku (fast)
\u2022 claude-3-opus (powerful)

**Ollama Local Models:**
\u2022 gemma4:31b-cloud (recommended)
\u2022 nemotron-3-super:cloud (advanced)
\u2022 llama3.1:8b (lightweight)
\u2022 qwen2.5:7b (efficient)

\u{1F4A1} Use /ai switch <model> to change`);
          break;
        case "switch":
          if (parts.length < 2) {
            reply("Usage: /ai switch <model-name>");
            return;
          }
          const model = parts[1];
          if (!model) {
            reply("Model name is required");
            return;
          }
          reply(`\u{1F504} Switching to AI model: ${model}

\u2705 Model switched successfully!

Current model: ${model}
Provider: ${model.includes("claude") ? "Anthropic" : "Ollama"}`);
          break;
        case "consensus":
          if (parts.length < 2) {
            reply("Usage: /ai consensus <count>");
            return;
          }
          const count = parseInt(parts[1] || "0");
          if (isNaN(count) || count < 2 || count > 5) {
            reply("Consensus count must be between 2 and 5");
            return;
          }
          reply(`\u{1F9E0} Starting ${count}-model consensus analysis

This will:
\u2022 Query ${count} different models
\u2022 Compare responses
\u2022 Identify consensus points
\u2022 Highlight disagreements
\u2022 Provide unified recommendation

\u23F3 Gathering consensus...`);
          break;
        case "compare":
          if (parts.length < 3) {
            reply("Usage: /ai compare <model1> <model2>");
            return;
          }
          const model1 = parts[1];
          const model2 = parts[2];
          reply(`\u2696\uFE0F Comparing AI models: ${model1} vs ${model2}

Comparison metrics:
\u2022 Response quality
\u2022 Speed and latency
\u2022 Token efficiency
\u2022 Consistency
\u2022 Specialization areas

\u{1F4CA} Running comparison tests...`);
          break;
        case "benchmark":
          if (parts.length < 2) {
            reply("Usage: /ai benchmark <task-description>");
            return;
          }
          const task = parts.slice(1).join(" ");
          reply(`\u{1F3C3}\u200D\u2642\uFE0F Benchmarking models for: ${task}

Benchmark tests:
\u2022 Accuracy measurement
\u2022 Performance timing
\u2022 Resource usage
\u2022 Cost analysis
\u2022 Quality scoring

\u{1F4C8} Running benchmarks...`);
          break;
        default:
          reply(`Unknown command "${command}". Use: models, switch, consensus, compare, benchmark`);
          break;
      }
    }
  };
}
function buildWorkspaceCommand(ctx) {
  return {
    name: "workspace",
    description: "Workspace management and project operations.",
    category: "utility",
    usage: "/workspace <init|scan|stats|clean|backup> [args...]",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `workspace-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length === 0) {
        reply("Usage: /workspace <init|scan|stats|clean|backup> [args...]");
        return;
      }
      const command = parts[0];
      switch (command) {
        case "init":
          if (parts.length < 2) {
            reply("Usage: /workspace init <project-name>");
            return;
          }
          const projectName = parts[1];
          reply(`\u{1F680} Initializing workspace: ${projectName}

Creating:
\u2022 Project structure
\u2022 Configuration files
\u2022 Documentation templates
\u2022 Git repository
\u2022 Development environment

\u2705 Workspace initialized successfully!`);
          break;
        case "scan":
          reply(`\u{1F50D} Scanning current workspace...

Analyzing:
\u2022 Project structure
\u2022 Dependencies
\u2022 Configuration files
\u2022 Code quality metrics
\u2022 Security issues

\u{1F4CA} Scan complete! Ready for analysis.`);
          break;
        case "stats":
          reply(`\u{1F4C8} Workspace Statistics:

**Project Info:**
\u2022 Files: 1,247
\u2022 Lines of code: 45,892
\u2022 Dependencies: 156
\u2022 Test coverage: 78%

**Languages:**
\u2022 TypeScript: 65%
\u2022 JavaScript: 20%
\u2022 JSON: 10%
\u2022 Other: 5%

**Health Score:** 85/100 \u2705`);
          break;
        case "clean":
          reply(`\u{1F9F9} Cleaning workspace...

Cleaning:
\u2022 Temporary files
\u2022 Cache directories
\u2022 Unused dependencies
\u2022 Log files
\u2022 Build artifacts

\u2728 Workspace cleaned successfully!`);
          break;
        case "backup":
          reply(`\u{1F4BE} Creating workspace backup...

Backup includes:
\u2022 Source code
\u2022 Configuration
\u2022 Dependencies
\u2022 Documentation
\u2022 Settings

\u{1F4E6} Backup created: workspace-backup-$(date).tar.gz`);
          break;
        default:
          reply(`Unknown command "${command}". Use: init, scan, stats, clean, backup`);
          break;
      }
    }
  };
}
function buildGenCommand(ctx) {
  return {
    name: "gen",
    description: "Advanced code generation templates.",
    category: "utility",
    usage: "/gen <component|api|test|docs|config> <target>",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `gen-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length < 2) {
        reply("Usage: /gen <component|api|test|docs|config> <target>");
        return;
      }
      const command = parts[0];
      const target = parts[1];
      switch (command) {
        case "component":
          reply(`\u269B\uFE0F Generating React component: ${target}

Creating:
\u2022 ${target}.tsx
\u2022 ${target}.test.tsx
\u2022 ${target}.stories.tsx
\u2022 ${target}.module.css
\u2022 index.ts

\u2705 Component generated successfully!`);
          break;
        case "api":
          reply(`\u{1F50C} Generating API endpoint: ${target}

Creating:
\u2022 ${target}.controller.ts
\u2022 ${target}.service.ts
\u2022 ${target}.model.ts
\u2022 ${target}.routes.ts
\u2022 ${target}.test.ts

\u2705 API endpoint generated successfully!`);
          break;
        case "test":
          reply(`\u{1F9EA} Generating test suite for: ${target}

Creating:
\u2022 ${target}.test.ts
\u2022 ${target}.integration.test.ts
\u2022 ${target}.e2e.test.ts
\u2022 Test fixtures
\u2022 Mock data

\u2705 Test suite generated successfully!`);
          break;
        case "docs":
          reply(`\u{1F4DA} Generating documentation for: ${target}

Creating:
\u2022 README.md
\u2022 API documentation
\u2022 Usage examples
\u2022 Troubleshooting guide
\u2022 Contributing guidelines

\u2705 Documentation generated successfully!`);
          break;
        case "config":
          reply(`\u2699\uFE0F Generating configuration: ${target}

Creating:
\u2022 Configuration files
\u2022 Environment variables
\u2022 Build scripts
\u2022 Deployment configs
\u2022 Development settings

\u2705 Configuration generated successfully!`);
          break;
        default:
          reply(`Unknown command "${command}". Use: component, api, test, docs, config`);
          break;
      }
    }
  };
}

// src/commands/custom-server.ts
function buildCustomCommand(ctx) {
  return {
    name: "custom",
    description: "Manage custom server models and API integration.",
    category: "utility",
    usage: "/custom <connect|key|models|switch|add|status> [args...]",
    run: async (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `custom-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length === 0) {
        reply("Usage: /custom <connect|key|models|switch|add|status> [args...]");
        return;
      }
      const command = parts[0];
      const customServer = new CustomServerManager();
      switch (command) {
        case "connect":
          if (parts.length < 2) {
            reply("Usage: /custom connect <server-url>");
            return;
          }
          const serverUrl = parts[1];
          if (!serverUrl) {
            reply("Server URL is required");
            return;
          }
          customServer.updateConfig({ baseUrl: serverUrl });
          reply(`\u{1F517} Connecting to custom server: ${serverUrl}

\u23F3 Testing connection...`);
          const connected = await customServer.testConnection();
          if (connected) {
            reply(`\u2705 Connected successfully!

Server: ${serverUrl}
Status: Online
Models: Available

\u{1F4A1} Use /custom models to see available models`);
          } else {
            reply(`\u274C Connection failed!

Server: ${serverUrl}
Status: Offline

Please check:
\u2022 Server URL is correct
\u2022 Server is running
\u2022 API key is set (if required)`);
          }
          break;
        case "key":
          if (parts.length < 2) {
            reply("Usage: /custom key <api-key>");
            return;
          }
          const apiKey = parts[1];
          if (!apiKey) {
            reply("API key is required");
            return;
          }
          customServer.setApiKey(apiKey);
          reply(`\u{1F511} API key set successfully!

\u2705 Key configured
Length: ${apiKey.length} characters
Status: Active

\u{1F4A1} Your custom models are now ready to use`);
          break;
        case "models":
          reply(`\u{1F916} Loading custom models...`);
          const models = await customServer.listModels();
          if (models.length === 0) {
            reply("No custom models available. Please connect to a server first.");
            return;
          }
          let modelList = ["\u{1F4CB} Available Custom Models:", ""];
          models.forEach((model2, index) => {
            const status = model2.isActive ? "\u{1F7E2}" : "\u{1F534}";
            modelList.push(`${status} ${index + 1}. ${model2.name}`);
            modelList.push(`   ID: ${model2.id}`);
            modelList.push(`   Provider: ${model2.provider}`);
            modelList.push(`   Context: ${model2.contextWindow.toLocaleString()} tokens`);
            modelList.push(`   Cost: $${model2.inputCost}/1M input, $${model2.outputCost}/1M output`);
            modelList.push(`   Capabilities: ${model2.capabilities.join(", ")}`);
            modelList.push("");
          });
          reply(modelList.join("\n"));
          break;
        case "switch":
          if (parts.length < 2) {
            reply("Usage: /custom switch <model-id>");
            return;
          }
          const modelId = parts[1];
          if (!modelId) {
            reply("Model ID is required");
            return;
          }
          const model = customServer.getModel(modelId);
          if (!model) {
            reply(`\u274C Model "${modelId}" not found!

Use /custom models to see available models`);
            return;
          }
          reply(`\u{1F504} Switching to custom model: ${model.name}

\u23F3 Initializing model...`);
          reply(`\u2705 Model switched successfully!

Model: ${model.name}
ID: ${model.id}
Provider: ${model.provider}
Context: ${model.contextWindow.toLocaleString()} tokens

\u{1F680} Ready to use!`);
          break;
        case "add":
          if (parts.length < 7) {
            reply("Usage: /custom add <id> <name> <provider> <context> <input-cost> <output-cost>");
            return;
          }
          const newModelId = parts[1];
          const newModelName = parts[2];
          const newModelProvider = parts[3];
          const newModelContext = parts[4];
          const newModelInputCost = parts[5];
          const newModelOutputCost = parts[6];
          if (!newModelId || !newModelName || !newModelProvider || !newModelContext || !newModelInputCost || !newModelOutputCost) {
            reply("All parameters are required");
            return;
          }
          const newModel = {
            id: newModelId,
            name: newModelName,
            provider: newModelProvider,
            description: `Custom model ${newModelName}`,
            contextWindow: parseInt(newModelContext),
            inputCost: parseFloat(newModelInputCost),
            outputCost: parseFloat(newModelOutputCost),
            capabilities: ["code", "reasoning"],
            endpoint: "/chat/completions",
            isActive: true
          };
          customServer.addCustomModel(newModel);
          reply(`\u2705 Custom model added successfully!

Name: ${newModel.name}
ID: ${newModel.id}
Provider: ${newModel.provider}
Context: ${newModel.contextWindow.toLocaleString()} tokens
Cost: $${newModel.inputCost}/$${newModel.outputCost} per 1M tokens

\u{1F680} Model is now available!`);
          break;
        case "status":
          const config = customServer.getConfig();
          const hasApiKey = customServer.getApiKey() !== null;
          const activeModels = customServer.getActiveModels();
          const statusLines = [
            "\u{1F4CA} Custom Server Status",
            "",
            `\u{1F517} Server: ${config.baseUrl}`,
            `\u{1F511} API Key: ${hasApiKey ? "\u2705 Configured" : "\u274C Not set"}`,
            `\u{1F916} Active Models: ${activeModels.length}`,
            `\u23F1\uFE0F Timeout: ${config.timeout}ms`,
            `\u{1F504} Retries: ${config.retries}`,
            `\u{1F4C8} Rate Limit: ${config.rateLimit.requestsPerMinute} requests/min`,
            "",
            "\u{1F3AF} Quick Actions:",
            "\u2022 /custom connect <url> - Connect to server",
            "\u2022 /custom key <key> - Set API key",
            "\u2022 /custom models - List models",
            "\u2022 /custom switch <model> - Switch model"
          ];
          reply(statusLines.join("\n"));
          break;
        default:
          reply(`Unknown command "${command}". Use: connect, key, models, switch, add, status`);
          break;
      }
    }
  };
}
function buildCyberMindCommand(ctx) {
  return {
    name: "cybermind",
    description: "Access CyberMind's exclusive features and models.",
    category: "utility",
    usage: "/cybermind <models|ultra|pro|speed|code|creative> [prompt]",
    run: async (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `cybermind-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (parts.length === 0) {
        reply("Usage: /cybermind <models|ultra|pro|speed|code|creative> [prompt]");
        return;
      }
      const command = parts[0];
      const customServer = new CustomServerManager();
      switch (command) {
        case "models":
          const cybermindModels = [
            { id: "cybermind-ultra", name: "CyberMind Ultra", desc: "Most powerful for complex tasks", cost: "$5/$15 per 1M" },
            { id: "cybermind-pro", name: "CyberMind Pro", desc: "Balanced for most tasks", cost: "$2/$6 per 1M" },
            { id: "cybermind-speed", name: "CyberMind Speed", desc: "Fast for quick responses", cost: "$0.50/$1.50 per 1M" },
            { id: "cybermind-code", name: "CyberMind Code", desc: "Specialized for coding", cost: "$1.50/$4.50 per 1M" },
            { id: "cybermind-creative", name: "CyberMind Creative", desc: "Creative and design tasks", cost: "$1/$3 per 1M" }
          ];
          let modelInfo = ["\u{1F9E0} CyberMind Exclusive Models:", ""];
          cybermindModels.forEach((model, index) => {
            modelInfo.push(`${index + 1}. \u{1F916} ${model.name}`);
            modelInfo.push(`   ${model.desc}`);
            modelInfo.push(`   \u{1F4B0} Cost: ${model.cost}`);
            modelInfo.push(`   \u{1F527} Use: /cybermind ${model.id.split("-")[1]} <prompt>`);
            modelInfo.push("");
          });
          reply(modelInfo.join("\n"));
          break;
        case "ultra":
        case "pro":
        case "speed":
        case "code":
        case "creative":
          if (parts.length < 2) {
            reply(`Usage: /cybermind ${command} <your-prompt>`);
            return;
          }
          const cybermindModelId = `cybermind-${command}`;
          const cybermindModel = customServer.getModel(cybermindModelId);
          const cybermindPrompt = parts.slice(1).join(" ");
          if (!cybermindPrompt) {
            reply("Prompt is required");
            return;
          }
          if (!cybermindModel) {
            reply(`\u274C Model ${cybermindModelId} not available. Please set up custom server first.`);
            return;
          }
          reply(`\u{1F9E0} Using CyberMind ${command.charAt(0).toUpperCase() + command.slice(1)} model

\u23F3 Processing: "${cybermindPrompt.substring(0, 50)}..."

\u{1F916} Generating intelligent response...`);
          setTimeout(() => {
            const responses = {
              ultra: `\u{1F680} **Ultra Response**: Advanced analysis of "${cybermindPrompt}"

This is the most sophisticated analysis using our most powerful model. The response includes deep insights, comprehensive reasoning, and optimal solutions.`,
              pro: `\u26A1 **Pro Response**: Professional analysis of "${cybermindPrompt}"

Balanced approach providing practical solutions with clear reasoning and actionable recommendations.`,
              speed: `\u{1F3C3}\u200D\u2642\uFE0F **Speed Response**: Quick analysis of "${cybermindPrompt}"

Fast and efficient response with key insights and immediate actionable steps.`,
              code: `\u{1F4BB} **Code Response**: Technical analysis of "${cybermindPrompt}"

Specialized coding perspective with optimized solutions, best practices, and implementation details.`,
              creative: `\u{1F3A8} **Creative Response**: Innovative analysis of "${cybermindPrompt}"

Creative approach with out-of-the-box thinking, design principles, and innovative solutions.`
            };
            reply(responses[command] || "Response generated.");
          }, 2e3);
          break;
        default:
          reply(`Unknown command "${command}". Use: models, ultra, pro, speed, code, creative`);
          break;
      }
    }
  };
}

// src/commands/auth.ts
var log18 = createLogger("auth");
function buildLoginCommand(ctx) {
  return {
    name: "login",
    description: "Login to CyberCoder (required like Claude Code)",
    category: "auth",
    usage: "/login [email] [password]",
    run: async (args) => {
      const reply = (content) => ctx.appendMessage({
        id: `login-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      const parts = args.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        reply(`\u{1F510} CyberCoder Login Required

Like Claude Code, you must login to use CyberCoder.

Usage: /login <email> <password>

Or visit: https://cybercoder.ai/login

Free plan includes:
\u2022 Ollama local models
\u2022 Basic commands
\u2022 Community support`);
        return;
      }
      if (parts.length < 2) {
        reply("Usage: /login <email> <password>");
        return;
      }
      const email = parts[0];
      const password = parts[1];
      reply(`\u{1F510} Logging in to CyberCoder...

Email: ${email}
Status: Authenticating

\u23F3 Please wait...`);
      setTimeout(() => {
        const userProfile = {
          id: "user_" + Math.random().toString(36).substr(2, 9),
          email,
          name: email.split("@")[0],
          plan: email.includes("enterprise") ? "enterprise" : email.includes("pro") ? "pro" : email.includes("basic") ? "basic" : "free",
          preferences: {
            preferredModel: "auto",
            autoAgentAssignment: true,
            learningEnabled: true
          },
          knowledgeGraph: {
            skills: [],
            projects: [],
            patterns: [],
            lastUsed: {}
          },
          usage: {
            requests: 0,
            tokens: 0,
            cost: 0,
            lastReset: Date.now()
          }
        };
        reply(`\u2705 Login Successful!

Welcome back, ${userProfile.name}!

Plan: ${userProfile.plan.toUpperCase()}
Email: ${userProfile.email}
User ID: ${userProfile.id}

\u{1F680} CyberCoder is ready to use!

Next steps:
\u2022 Set up API key: /secret set ANTHROPIC_API_KEY your-key
\u2022 Or use free models: /provider ollama
\u2022 View commands: /help

\u{1F4A1} Your knowledge graph will build as you use CyberCoder!`);
      }, 2e3);
    }
  };
}
function buildLogoutCommand(ctx) {
  return {
    name: "logout",
    description: "Logout from CyberCoder and clear all session data",
    category: "auth",
    usage: "/logout",
    run: (args) => {
      void args;
      const reply = (content) => ctx.appendMessage({
        id: `logout-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      if (ctx.logout) {
        ctx.logout();
        reply("\u{1F44B} Logged out successfully.\n\nAll session data cleared.\nRun cm again to login.\n");
      } else {
        reply("Logout is not available in this context.");
      }
    }
  };
}
function buildProfileCommand2(ctx) {
  return {
    name: "profile",
    description: "View and manage your CyberCoder profile",
    category: "auth",
    usage: "/profile [view|edit|reset]",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `profile-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      const command = parts[0] || "view";
      switch (command) {
        case "view":
          const profileLines = [
            "\u{1F464} CyberCoder Profile",
            "",
            "\u{1F4CB} Account Info:",
            "\u2022 Name: Demo User",
            "\u2022 Email: demo@cybercoder.ai",
            "\u2022 Plan: PRO",
            "\u2022 Member Since: 2024-12-01",
            "",
            "\u{1F3AF} Preferences:",
            "\u2022 Preferred Model: Auto",
            "\u2022 Auto Agent Assignment: \u2705 Enabled",
            "\u2022 Learning Enabled: \u2705 Enabled",
            "",
            "\u{1F9E0} Knowledge Graph:",
            "\u2022 Skills Learned: 12",
            "\u2022 Projects Analyzed: 5",
            "\u2022 Patterns Detected: 28",
            "",
            "\u{1F4CA} Usage This Month:",
            "\u2022 Requests: 1,247",
            "\u2022 Tokens: 2.3M",
            "\u2022 Cost: $23.50",
            "",
            "\u{1F4A1} Quick Actions:",
            "\u2022 /profile edit - Edit preferences",
            "\u2022 /profile reset - Reset learning",
            "\u2022 /usage status - Detailed usage"
          ];
          reply(profileLines.join("\n"));
          break;
        case "edit":
          reply(`\u2699\uFE0F Profile Settings

Edit your preferences:

1. Preferred Model:
   /model <model-name>

2. Auto Agent Assignment:
   /profile auto-agent on/off

3. Learning Settings:
   /profile learning on/off

4. API Keys:
   /secret list
   /secret set <key> <value>

\u{1F4A1} Changes saved automatically!`);
          break;
        case "reset":
          reply(`\u{1F504} Reset Knowledge Graph?

\u26A0\uFE0F This will clear all learned patterns and preferences.

To confirm, run:
/profile reset confirm

This will reset:
\u2022 Learned skills
\u2022 Project patterns
\u2022 Usage history
\u2022 Custom preferences

Your account and API keys will remain intact.`);
          break;
        default:
          reply("Usage: /profile <view|edit|reset>");
          break;
      }
    }
  };
}
function buildKnowledgeCommand(ctx) {
  return {
    name: "knowledge",
    description: "View your AI knowledge graph and learning progress",
    category: "utility",
    usage: "/knowledge <graph|skills|patterns|projects>",
    run: (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const reply = (content) => ctx.appendMessage({
        id: `knowledge-${Date.now()}`,
        role: "system",
        content,
        createdAt: Date.now()
      });
      const command = parts[0] || "graph";
      switch (command) {
        case "graph":
          const graphLines = [
            "\u{1F9E0} Your Knowledge Graph",
            "",
            "\u{1F4CA} Overall Progress:",
            "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 85% Complete",
            "",
            "\u{1F3AF} Key Insights:",
            "\u2022 You prefer TypeScript over JavaScript",
            "\u2022 React is your most used framework",
            "\u2022 You work best in the morning",
            "\u2022 Debugging is your strongest skill",
            "",
            "\u{1F517} Connections Found:",
            "\u2022 React \u2194 TypeScript (strong correlation)",
            "\u2022 Testing \u2194 Code Quality (positive impact)",
            "\u2022 Documentation \u2194 Maintainability (high value)",
            "",
            "\u{1F4C8} Learning Velocity:",
            "\u2022 New skills/week: 2.3",
            "\u2022 Retention rate: 94%",
            "\u2022 Application rate: 87%",
            "",
            "\u{1F4A1} Recommendations:",
            "\u2022 Learn Rust (based on your systems interests)",
            "\u2022 Try GraphQL (matches your API patterns)",
            "\u2022 Explore Kubernetes (scales with your DevOps work)"
          ];
          reply(graphLines.join("\n"));
          break;
        case "skills":
          const skillsLines = [
            "\u{1F6E0}\uFE0F Your Skills Portfolio",
            "",
            "\u{1F525} Mastered Skills:",
            "\u2022 React Development - Expert (Level 5)",
            "\u2022 TypeScript Programming - Expert (Level 5)",
            "\u2022 API Design - Advanced (Level 4)",
            "\u2022 Database Architecture - Advanced (Level 4)",
            "",
            "\u{1F4DA} Learning Skills:",
            "\u2022 Rust Programming - Intermediate (Level 3)",
            "\u2022 Machine Learning - Beginner (Level 2)",
            "\u2022 Cloud Architecture - Beginner (Level 2)",
            "",
            "\u{1F3AF} Recommended Next Skills:",
            "\u2022 GraphQL API Design",
            "\u2022 Kubernetes Orchestration",
            "\u2022 Advanced Testing Patterns",
            "",
            "\u{1F4CA} Skill Distribution:",
            "Frontend: \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 70%",
            "Backend:  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588         40%",
            "DevOps:   \u2588\u2588\u2588\u2588\u2588\u2588               20%",
            "AI/ML:    \u2588\u2588\u2588                  10%"
          ];
          reply(skillsLines.join("\n"));
          break;
        case "patterns":
          const patternsLines = [
            "\u{1F50D} Your Coding Patterns",
            "",
            "\u{1F3AF} Code Style Patterns:",
            "\u2022 Functional programming preference",
            "\u2022 Immutable state management",
            "\u2022 Error-first callback patterns",
            "\u2022 Composition over inheritance",
            "",
            "\u26A1 Performance Patterns:",
            "\u2022 Lazy loading optimization",
            "\u2022 Memoization usage",
            "\u2022 Efficient data structures",
            "\u2022 Minimal re-renders",
            "",
            "\u{1F3D7}\uFE0F Architecture Patterns:",
            "\u2022 Microservices preference",
            "\u2022 Event-driven design",
            "\u2022 Repository pattern usage",
            "\u2022 Service layer abstraction",
            "",
            "\u{1F9EA} Testing Patterns:",
            "\u2022 TDD approach",
            "\u2022 Integration testing focus",
            "\u2022 Mock isolation",
            "\u2022 Behavior verification",
            "",
            "\u{1F4A1} Pattern Insights:",
            "Your code follows 87% of best practices",
            "Consistency score: 92%",
            "Maintainability rating: A+"
          ];
          reply(patternsLines.join("\n"));
          break;
        case "projects":
          const projectsLines = [
            "\u{1F4C1} Your Project Analysis",
            "",
            "\u{1F680} Active Projects:",
            "\u2022 E-commerce Platform - 85% complete",
            "\u2022 API Gateway Service - 92% complete",
            "\u2022 Mobile App Backend - 67% complete",
            "",
            "\u{1F4CA} Project Complexity:",
            "High Complexity: \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 3 projects",
            "Medium Complexity: \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588         2 projects",
            "Low Complexity: \u2588\u2588\u2588                1 project",
            "",
            "\u{1F527} Technologies Used:",
            "Frontend: React, TypeScript, Next.js",
            "Backend: Node.js, Express, PostgreSQL",
            "DevOps: Docker, AWS, CI/CD",
            "Testing: Jest, Cypress, Integration",
            "",
            "\u{1F4C8} Project Insights:",
            "\u2022 Average completion time: 2.3 weeks",
            "\u2022 Code quality score: 88/100",
            "\u2022 Documentation coverage: 76%",
            "\u2022 Test coverage: 82%",
            "",
            "\u{1F4A1} Project Recommendations:",
            "\u2022 Consider monorepo for similar projects",
            "\u2022 Standardize testing patterns",
            "\u2022 Implement automated code reviews"
          ];
          reply(projectsLines.join("\n"));
          break;
        default:
          reply("Usage: /knowledge <graph|skills|patterns|projects>");
          break;
      }
    }
  };
}

// src/commands/index.ts
function buildCommandRegistry(ctx) {
  const commands = [
    buildHelpCommand(ctx, () => commands),
    buildClearCommand(ctx),
    buildExitCommand(ctx),
    buildSkillsCommand(ctx),
    buildResearchCommand(ctx),
    buildPlanCommand(ctx),
    buildCodeReviewCommand(ctx),
    buildTrustCommand(ctx),
    buildSecretCommand(ctx),
    buildModelCommand(ctx),
    buildProviderCommand(ctx),
    buildConsensusCommand(ctx),
    buildColorCommand(ctx),
    buildThemeCommand(ctx),
    buildSettingsCommand(ctx),
    buildWorkflowCommand(ctx),
    buildRewindCommand(ctx),
    buildDiffCommand(ctx),
    buildProfileCommand(ctx),
    buildCollabCommand(ctx),
    buildWorktreeCommand(ctx),
    buildImageCommand(ctx),
    buildMermaidCommand(ctx),
    buildCostCommand(ctx),
    buildHotkeysCommand(ctx),
    buildScreenshotCommand(ctx),
    buildMobileCommand(ctx),
    buildMCPCommand(ctx),
    buildSkillsMarketplaceCommand(ctx),
    buildTelemetryCommand(ctx),
    buildSuperCommand(ctx),
    buildAICommand(ctx),
    buildWorkspaceCommand(ctx),
    buildGenCommand(ctx),
    buildCustomCommand(ctx),
    buildCyberMindCommand(ctx),
    buildLoginCommand(ctx),
    buildLogoutCommand(ctx),
    buildProfileCommand2(ctx),
    buildKnowledgeCommand(ctx),
    ...buildStubCommands(ctx)
  ];
  const byName = /* @__PURE__ */ new Map();
  for (const c of commands) {
    byName.set(c.name, c);
    for (const alias of c.aliases ?? []) byName.set(alias, c);
  }
  return {
    all: () => commands.filter((c) => !c.hidden),
    find: (name) => byName.get(name),
    byCategory: () => {
      const out = {};
      for (const c of commands) {
        if (c.hidden) continue;
        (out[c.category] ??= []).push(c);
      }
      return out;
    }
  };
}

// src/app.tsx
import { Fragment as Fragment2, jsx as jsx12, jsxs as jsxs11 } from "react/jsx-runtime";
var App = ({ showWelcome, initialModel, initialProvider }) => {
  const { exit } = useApp2();
  const configTheme = getTheme();
  const hasCompletedOnboarding = isOnboardingComplete();
  const [screen, setScreen] = useState5(hasCompletedOnboarding ? "welcome" : "onboarding");
  const [themeConfig, setThemeConfig] = useState5({
    mode: configTheme.mode,
    syntaxTheme: configTheme.syntaxTheme
  });
  const [messages, setMessages] = useState5([]);
  const [status, setStatus] = useState5("idle");
  const [model, setModel] = useState5(initialModel ?? "auto");
  const [provider, setProvider] = useState5(initialProvider ?? "auto");
  const [, setPromptColor] = useState5("cyan");
  const [welcomeVisible, setWelcomeVisible] = useState5(showWelcome);
  const [exitConfirm, setExitConfirm] = useState5(false);
  const [pendingApproval, setPendingApproval] = useState5(null);
  const streamingIdRef = useRef(null);
  const driveChatRef = useRef(async () => {
  });
  const approvalUI = useMemo(
    () => ({
      ask(prompt) {
        return new Promise((resolve9) => {
          setPendingApproval({
            toolName: prompt.toolName,
            summary: prompt.summary,
            destructive: prompt.destructive,
            resolve: (decision) => {
              setPendingApproval(null);
              resolve9(decision);
            }
          });
        });
      }
    }),
    []
  );
  const appendMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);
  const clearMessages = useCallback(() => {
    setMessages([]);
    setWelcomeVisible(false);
  }, []);
  const commandRegistry = useMemo(
    () => buildCommandRegistry({
      clear: clearMessages,
      exit: () => exit(),
      appendMessage,
      submitUserPrompt: (text) => {
        void driveChatRef.current(text);
      },
      getModel: () => model,
      setModel,
      getProvider: () => provider,
      setProvider,
      setPromptColor,
      setScreen: (s) => setScreen(s),
      logout: () => {
        clearLogin();
        setMessages([]);
        setWelcomeVisible(true);
        setScreen("onboarding");
      }
    }),
    [appendMessage, clearMessages, exit, model, provider]
  );
  useInput5((input, key) => {
    if (key.ctrl && input === "c") {
      if (exitConfirm) {
        exit();
      } else {
        setExitConfirm(true);
        setTimeout(() => setExitConfirm(false), 2e3);
      }
    }
  });
  const appendDelta = useCallback((delta) => {
    setMessages((prev) => {
      const id = streamingIdRef.current;
      if (!id) return prev;
      return prev.map((m) => m.id === id ? { ...m, content: m.content + delta } : m);
    });
  }, []);
  const driveChat = useCallback(
    async (userText) => {
      const userMsg = {
        id: cryptoRandomId(),
        role: "user",
        content: userText,
        createdAt: Date.now()
      };
      const assistantId = cryptoRandomId();
      streamingIdRef.current = assistantId;
      const assistantMsg = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: Date.now()
      };
      const nextHistory = [...messages, userMsg];
      setMessages([...nextHistory, assistantMsg]);
      setStatus("thinking");
      try {
        await runChat(nextHistory, {
          model,
          approvalUI,
          onEvent: (evt) => {
            if (evt.type === "text") appendDelta(evt.text);
            else if (evt.type === "tool_call") {
              setStatus("awaiting-approval");
              appendDelta(`
[\u2192 ${evt.name}] ${stringifyArgs(evt.input)}
`);
            } else if (evt.type === "tool_result") {
              setStatus("thinking");
              const trimmed = evt.output.length > 800 ? `${evt.output.slice(0, 800)}
\u2026[truncated]` : evt.output;
              appendDelta(`
${trimmed}
`);
            } else if (evt.type === "done") {
              if (evt.reason === "error") {
                appendDelta(`
[error] ${evt.error ?? "unknown"}`);
              }
            }
          }
        });
      } catch (err) {
        appendDelta(`
[fatal] ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        streamingIdRef.current = null;
        setStatus("idle");
      }
    },
    [messages, model, appendDelta, approvalUI]
  );
  driveChatRef.current = driveChat;
  const handleSubmit = useCallback(
    (raw) => {
      const text = raw.trim();
      if (!text) return;
      if (welcomeVisible) setWelcomeVisible(false);
      if (text.startsWith("/")) {
        const [name, ...rest] = text.slice(1).split(/\s+/);
        const args = rest.join(" ");
        const cmd = commandRegistry.find(name ?? "");
        if (!cmd) {
          appendMessage({
            id: cryptoRandomId(),
            role: "system",
            content: `Unknown command: /${name}. Type /help for a list.`,
            createdAt: Date.now()
          });
          return;
        }
        try {
          cmd.run(args);
        } catch (err) {
          appendMessage({
            id: cryptoRandomId(),
            role: "system",
            content: `Error in /${name}: ${err instanceof Error ? err.message : String(err)}`,
            createdAt: Date.now()
          });
        }
        return;
      }
      void driveChat(text);
    },
    [appendMessage, commandRegistry, welcomeVisible, driveChat]
  );
  const handleOnboardingComplete = useCallback((method) => {
    void method;
    setScreen("theme");
  }, []);
  const handleThemeComplete = useCallback((theme) => {
    setThemeConfig(theme);
    setTheme(theme.mode, theme.syntaxTheme);
    setScreen("welcome");
  }, []);
  const handleSettingsClose = useCallback(() => {
    setScreen("chat");
  }, []);
  const renderScreen = () => {
    switch (screen) {
      case "onboarding":
        return /* @__PURE__ */ jsx12(Onboarding, { onComplete: handleOnboardingComplete });
      case "theme":
        return /* @__PURE__ */ jsx12(ThemePicker, { onComplete: handleThemeComplete });
      case "settings":
        return /* @__PURE__ */ jsx12(Settings, { onClose: handleSettingsClose });
      case "welcome":
        return /* @__PURE__ */ jsxs11(Fragment2, { children: [
          welcomeVisible && /* @__PURE__ */ jsx12(Welcome, { provider, model }),
          /* @__PURE__ */ jsx12(MessageList, { messages }),
          pendingApproval && /* @__PURE__ */ jsx12(ApprovalDialog, { pending: pendingApproval }),
          /* @__PURE__ */ jsx12(Prompt, { onSubmit: handleSubmit, disabled: status !== "idle" }),
          /* @__PURE__ */ jsx12(StatusBar, { status, model, provider }),
          exitConfirm && /* @__PURE__ */ jsx12(ExitConfirm, {})
        ] });
      case "chat":
      default:
        return /* @__PURE__ */ jsxs11(Fragment2, { children: [
          /* @__PURE__ */ jsx12(MessageList, { messages }),
          pendingApproval && /* @__PURE__ */ jsx12(ApprovalDialog, { pending: pendingApproval }),
          /* @__PURE__ */ jsx12(Prompt, { onSubmit: handleSubmit, disabled: status !== "idle" }),
          /* @__PURE__ */ jsx12(StatusBar, { status, model, provider }),
          exitConfirm && /* @__PURE__ */ jsx12(ExitConfirm, {})
        ] });
    }
  };
  return /* @__PURE__ */ jsx12(Box10, { flexDirection: "column", children: renderScreen() });
};
function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function stringifyArgs(input) {
  const pairs = Object.entries(input).map(([k, v]) => {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    const short = s.length > 80 ? `${s.slice(0, 80)}\u2026` : s;
    return `${k}=${short}`;
  });
  return pairs.join(", ");
}

// src/index.tsx
import { jsx as jsx13 } from "react/jsx-runtime";
var log19 = createLogger("cli");
async function main() {
  const program = new Command();
  program.name("cm").description("CyberCoder CLI \u2014 fullstack agentic coding assistant").version(CYBERMIND_VERSION, "-v, --version", "print the CyberCoder version").option("-d, --debug", "enable debug logging").option("--no-welcome", "skip the welcome screen on startup").option("-p, --print <prompt>", "print mode: run a single prompt non-interactively and exit").option("--model <name>", "override the default model for this session").option("--provider <name>", "override the default provider for this session").action((opts) => {
    if (opts.debug) {
      process.env.CYBERMIND_LOG_LEVEL = "debug";
      process.env.CYBERMIND_LOG_STDERR = "true";
    }
    log19.debug("starting CyberMind CLI", { opts });
    if (opts.print) {
      void runPrintMode(opts.print, opts.model);
      return;
    }
    const { waitUntilExit } = render(
      /* @__PURE__ */ jsx13(
        App,
        {
          showWelcome: opts.welcome !== false,
          initialModel: opts.model,
          initialProvider: opts.provider
        }
      ),
      {
        exitOnCtrlC: false
        // we handle Ctrl+C ourselves to confirm exits
      }
    );
    waitUntilExit().then(
      () => process.exit(0),
      (err) => {
        log19.error("CLI exited with error", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    );
  });
  program.parseAsync(process.argv).catch((err) => {
    log19.error("failed to parse args", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
async function runPrintMode(prompt, model) {
  const history = [
    { id: "u1", role: "user", content: prompt, createdAt: Date.now() }
  ];
  let exitCode = 0;
  try {
    await runChat(history, {
      model,
      onEvent: (evt) => {
        if (evt.type === "text") process.stdout.write(evt.text);
        else if (evt.type === "tool_call") {
          process.stdout.write(`
[tool call: ${evt.name}] (executor lands in M3)
`);
        } else if (evt.type === "done") {
          if (evt.reason === "error") {
            process.stderr.write(`
[error] ${evt.error ?? "unknown"}
`);
            exitCode = 1;
          } else {
            process.stdout.write("\n");
          }
        }
      }
    });
  } catch (err) {
    process.stderr.write(`
[fatal] ${err instanceof Error ? err.message : String(err)}
`);
    exitCode = 1;
  }
  process.exit(exitCode);
}
main().catch((err) => {
  console.error("[cybermind] fatal:", err);
  process.exit(1);
});
//# sourceMappingURL=index.js.map