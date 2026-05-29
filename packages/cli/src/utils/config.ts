import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.cybercoder');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface UserConfig {
  onboardingComplete?: boolean;
  loginMethod?: 'cybercli' | 'apikey' | 'thirdparty' | null;
  theme?: {
    mode: 'auto' | 'dark' | 'light' | 'dark-colorblind' | 'light-colorblind' | 'dark-ansi' | 'light-ansi';
    syntaxTheme: string;
  };
  apiKeys?: Record<string, string>;
  lastProvider?: string;
  lastModel?: string;
  user?: {
    email?: string;
    name?: string;
  };
  autoUpdateCheck?: boolean;
  showWelcome?: boolean;
  telemetry?: boolean;
  version?: string;
}

const DEFAULT_CONFIG: UserConfig = {
  onboardingComplete: false,
  loginMethod: null,
  theme: {
    mode: 'dark',
    syntaxTheme: 'Monokai Extended',
  },
  apiKeys: {},
  lastProvider: 'auto',
  lastModel: 'auto',
  user: {},
  autoUpdateCheck: true,
  showWelcome: true,
  telemetry: true,
  version: '0.1.16',
};

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): UserConfig {
  ensureConfigDir();
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as UserConfig;
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch {
    // Corrupted config, fall through to default
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: UserConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function updateConfig(partial: Partial<UserConfig>): UserConfig {
  const current = loadConfig();
  const merged = { ...current, ...partial };
  saveConfig(merged);
  return merged;
}

export function isOnboardingComplete(): boolean {
  return loadConfig().onboardingComplete === true;
}

export function markOnboardingComplete(method: string): void {
  updateConfig({
    onboardingComplete: true,
    loginMethod: method as UserConfig['loginMethod'],
  });
}

export function clearLogin(): void {
  updateConfig({
    onboardingComplete: false,
    loginMethod: null,
    user: {},
    apiKeys: {},
  });
}

export function setApiKey(provider: string, key: string): void {
  const config = loadConfig();
  const apiKeys = { ...(config.apiKeys ?? {}) };
  apiKeys[provider] = key;
  updateConfig({ apiKeys });
}

export function getApiKey(provider: string): string | undefined {
  return loadConfig().apiKeys?.[provider];
}

export function setTheme(
  mode: 'auto' | 'dark' | 'light' | 'dark-colorblind' | 'light-colorblind' | 'dark-ansi' | 'light-ansi',
  syntaxTheme: string,
): void {
  updateConfig({ theme: { mode, syntaxTheme } });
}

export function getTheme(): { mode: string; syntaxTheme: string } {
  return loadConfig().theme ?? DEFAULT_CONFIG.theme!;
}
