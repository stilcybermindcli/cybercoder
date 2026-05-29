import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import gradient from 'gradient-string';
import { loadConfig, updateConfig } from '../utils/config.js';

const cyber = gradient(['#00e5ff', '#7b5cff', '#ff5c8a']);

interface SettingsProps {
  onClose: () => void;
}

const SETTINGS_CATEGORIES = [
  {
    id: 'general',
    label: 'General',
    items: [
      { key: 'welcome', label: 'Show welcome screen on startup', isBool: true },
      { key: 'telemetry', label: 'Enable telemetry', isBool: true },
    ],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    items: [
      { key: 'theme', label: 'Theme Mode', isBool: false },
      { key: 'syntax', label: 'Syntax highlighting', isBool: false },
    ],
  },
  {
    id: 'ai',
    label: 'AI & Providers',
    items: [
      { key: 'default_provider', label: 'Default provider', isBool: false },
      { key: 'default_model', label: 'Default model', isBool: false },
    ],
  },
];

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const [catIdx, setCatIdx] = useState(0);
  const [itemIdx, setItemIdx] = useState(0);
  const [config, setConfig] = useState(() => loadConfig());

  const currentCat = SETTINGS_CATEGORIES[catIdx];

  const getSettingValue = (key: string): any => {
    switch (key) {
      case 'welcome':
        return config.showWelcome ?? true;
      case 'telemetry':
        return config.telemetry ?? true;
      case 'theme':
        return config.theme?.mode ?? 'dark';
      case 'syntax':
        return config.theme?.syntaxTheme ?? 'Monokai Extended';
      case 'default_provider':
        return config.lastProvider ?? 'auto';
      case 'default_model':
        return config.lastModel ?? 'auto';
      default:
        return (config as any)[key] ?? false;
    }
  };

  const toggleSetting = (key: string) => {
    const currentValue = getSettingValue(key);
    let updatedPartial: any = {};

    if (key === 'welcome') {
      updatedPartial = { showWelcome: !currentValue };
    } else if (key === 'telemetry') {
      updatedPartial = { telemetry: !currentValue };
    } else if (key === 'theme') {
      const modes = ['dark', 'light', 'auto', 'dark-ansi', 'light-ansi'];
      const nextMode = modes[(modes.indexOf(currentValue) + 1) % modes.length];
      updatedPartial = { theme: { ...config.theme, mode: nextMode as any, syntaxTheme: config.theme?.syntaxTheme || 'Monokai Extended' } };
    } else if (key === 'default_provider') {
      const providers = ['auto', 'cybermind', 'openai', 'anthropic', 'groq', 'google', 'openrouter', 'ollama'];
      const nextProvider = providers[(providers.indexOf(currentValue) + 1) % providers.length];
      updatedPartial = { lastProvider: nextProvider };
    }

    const newConfig = updateConfig(updatedPartial);
    setConfig(newConfig);
  };

  useInput((_, key) => {
    if (key.escape || (key.ctrl && _ === 'c')) {
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
      if (item) {
        toggleSetting(item.key);
      }
    }
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>{cyber('╭─ Settings ──────────────────────────────────────────────────────╮')}</Text>

      <Box flexDirection="column" paddingLeft={2} paddingRight={2} marginTop={1}>
        {/* Category tabs */}
        <Box flexDirection="row" marginBottom={1}>
          {SETTINGS_CATEGORIES.map((cat, i) => (
            <Text key={cat.id}>
              <Text color={i === catIdx ? '#D97736' : 'gray'} bold={i === catIdx}>
                {' '}{cat.label}{' '}
              </Text>
              {i < SETTINGS_CATEGORIES.length - 1 && (
                <Text color="gray">{'│'}</Text>
              )}
            </Text>
          ))}
        </Box>

        <Text color="gray">{'─'.repeat(66)}</Text>

        {/* Settings items */}
        {currentCat && currentCat.items.map((item, i) => {
          const val = getSettingValue(item.key);
          return (
            <Box key={item.key} flexDirection="row" marginY={1}>
              <Text>
                {i === itemIdx ? (
                  <Text color="#D97736">{'› '}</Text>
                ) : (
                  <Text color="gray">{'  '}</Text>
                )}
                <Text color={i === itemIdx ? 'white' : 'gray'} bold={i === itemIdx}>
                  {item.label}
                </Text>
              </Text>
              <Box flexGrow={1} />
              <Text color={typeof val === 'boolean' ? (val ? 'green' : 'red') : 'cyan'}>
                {typeof val === 'boolean'
                  ? (val ? '✓ enabled' : '✗ disabled')
                  : val}
              </Text>
            </Box>
          );
        })}

        <Box marginTop={1} />
        <Text color="gray">Arrow keys to navigate · Enter to toggle/cycle · ESC to close</Text>
      </Box>

      <Text>{cyber('╰──────────────────────────────────────────────────────────────────╯')}</Text>
    </Box>
  );
};
