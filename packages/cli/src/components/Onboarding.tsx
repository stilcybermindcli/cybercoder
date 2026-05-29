import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { spawn } from 'node:child_process';
import { CYBERMIND_VERSION, CYBERMIND_NAME } from '@cybermind/shared';
import { Mascot } from './Mascot.js';
import { SkyScene } from './SkyScene.js';
import { DottedBorder } from './SkyScene.js';
import { markOnboardingComplete, setApiKey } from '../utils/config.js';

interface OnboardingProps {
  onComplete: (method: string) => void;
}

type SubScreen = 'main' | 'cybercli-login' | 'apikey-input' | 'thirdparty-platforms';

const LOGIN_METHODS = [
  {
    id: 'cybercli',
    label: 'CyberCli account with subscription',
    desc: 'Pro, Max, Team, or Enterprise',
  },
  {
    id: 'apikey',
    label: 'API key (BYOK)',
    desc: 'Bring Your Own Key — API usage billing',
  },
  {
    id: 'thirdparty',
    label: '3rd-party platform',
    desc: 'OpenRouter, Groq, or local Ollama',
  },
];

const THIRDPARTY_PLATFORMS = [
  { id: 'openrouter', label: 'OpenRouter', desc: 'interactive setup' },
  { id: 'groq', label: 'Groq', desc: 'interactive setup' },
  { id: 'ollama', label: 'Ollama (local)', desc: 'interactive setup' },
  { id: 'back', label: 'Go back', desc: '' },
];

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const { exit } = useApp();
  const [screen, setScreen] = useState<SubScreen>('main');
  const [selected, setSelected] = useState(0);

  // API key input state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyProvider, setApiKeyProvider] = useState('openai');
  const [apiKeyStage, setApiKeyStage] = useState<'provider' | 'key'>('provider');

  // 3rd party state
  const [tpSelected, setTpSelected] = useState(0);

  const openBrowser = (url: string) => {
    const platform = process.platform;
    const cmd = platform === 'win32' ? 'start' : platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(cmd, [url], { detached: true, stdio: 'ignore' });
  };

  // ── MAIN SCREEN ──
  if (screen === 'main') {
    useInput((_, key) => {
      if (key.escape || (key.ctrl && _ === 'c')) {
        exit();
        return;
      }
      if (key.upArrow) {
        setSelected((s) => Math.max(0, s - 1));
      } else if (key.downArrow) {
        setSelected((s) => Math.min(LOGIN_METHODS.length - 1, s + 1));
      } else if (key.return) {
        const method = LOGIN_METHODS[selected];
        if (method?.id === 'cybercli') {
          setScreen('cybercli-login');
        } else if (method?.id === 'apikey') {
          setScreen('apikey-input');
          setApiKeyStage('provider');
          setApiKeyProvider('openai');
        } else if (method?.id === 'thirdparty') {
          setScreen('thirdparty-platforms');
          setTpSelected(0);
        }
      }
    });

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="#D97736">Welcome to {CYBERMIND_NAME} Code v{CYBERMIND_VERSION}</Text>
        <DottedBorder width={58} />
        <Box marginTop={1} />
        <SkyScene />
        <Box marginTop={1} />
        <DottedBorder width={58} />

        <Box flexDirection="row" marginTop={1}>
          <Box flexDirection="column" width={20} paddingLeft={2}>
            <Mascot />
          </Box>
          <Box flexDirection="column" flexGrow={1} paddingRight={2}>
            <Text bold color="white">
              {CYBERMIND_NAME} Code can be used with your CyberCli subscription or
              billed based on API usage through your own keys.
            </Text>
            <Box marginTop={1} />
            <Text bold color="#D97736">Select login method:</Text>
            <Box marginTop={1} />

            {LOGIN_METHODS.map((method, i) => (
              <Box key={method.id} flexDirection="column" marginBottom={1}>
                <Text>
                  {i === selected ? (
                    <Text color="#D97736">{'› '}</Text>
                  ) : (
                    <Text color="gray">{'  '}</Text>
                  )}
                  <Text color={i === selected ? 'white' : 'gray'} bold={i === selected}>
                    {i + 1}. {method.label}
                  </Text>
                  <Text color="gray"> · {method.desc}</Text>
                </Text>
              </Box>
            ))}

            <Box marginTop={1} />
            <Text color="gray">Arrow keys to navigate, Enter to select, ESC to exit</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // ── CYBERCLI LOGIN SCREEN ──
  if (screen === 'cybercli-login') {
    useInput((_, key) => {
      if (key.escape) {
        setScreen('main');
        return;
      }
      if (key.return) {
        const url = 'https://cybermindcli.info/login?redirect=cli';
        openBrowser(url);
        markOnboardingComplete('cybercli');
        onComplete('cybercli');
      }
    });

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="#D97736">Welcome to {CYBERMIND_NAME} Code v{CYBERMIND_VERSION}</Text>
        <DottedBorder width={58} />
        <Box marginTop={1} />
        <SkyScene />
        <Box marginTop={1} />
        <DottedBorder width={58} />

        <Box flexDirection="column" marginTop={1} paddingLeft={2} paddingRight={2}>
          <Text bold color="white">Sign in to CyberCli</Text>
          <Box marginTop={1} />
          <Text color="gray">
            Browser didn't open? Use the url below to sign in (c to copy)
          </Text>
          <Box marginTop={1} />
          <Text color="cyan">https://cybermindcli.info/login?redirect=cli</Text>
          <Box marginTop={1} />
          <Text color="gray">Paste code here if prompted {'>'} </Text>
          <Box marginTop={1} />
          <Text color="gray">Press Enter to open browser, ESC to go back</Text>
        </Box>
      </Box>
    );
  }

  // ── API KEY INPUT SCREEN ──
  if (screen === 'apikey-input') {
    const API_PROVIDERS = [
      { id: 'openai', label: 'OpenAI' },
      { id: 'anthropic', label: 'Anthropic' },
      { id: 'groq', label: 'Groq' },
      { id: 'google', label: 'Google (Gemini)' },
      { id: 'openrouter', label: 'OpenRouter' },
    ];

    if (apiKeyStage === 'provider') {
      useInput((_, key) => {
        if (key.escape) {
          setScreen('main');
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
            setApiKeyStage('key');
            setApiKeyInput('');
          }
        }
      });

      return (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="#D97736">Welcome to {CYBERMIND_NAME} Code v{CYBERMIND_VERSION}</Text>
          <DottedBorder width={58} />
          <Box marginTop={1} />
          <SkyScene />
          <Box marginTop={1} />
          <DottedBorder width={58} />

          <Box flexDirection="column" marginTop={1} paddingLeft={2} paddingRight={2}>
            <Text bold color="white">Enter your API key</Text>
            <Box marginTop={1} />
            <Text color="gray">Select a provider:</Text>
            <Box marginTop={1} />
            {API_PROVIDERS.map((prov, i) => (
              <Box key={prov.id} flexDirection="row" marginBottom={1}>
                <Text>
                  {i === selected ? (
                    <Text color="#D97736">{'› '}</Text>
                  ) : (
                    <Text color="gray">{'  '}</Text>
                  )}
                  <Text color={i === selected ? 'white' : 'gray'} bold={i === selected}>
                    {i + 1}. {prov.label}
                  </Text>
                </Text>
              </Box>
            ))}
            <Box marginTop={1} />
            <Text color="gray">Arrow keys to navigate, Enter to select, ESC to go back</Text>
          </Box>
        </Box>
      );
    }

    // key input stage
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="#D97736">Welcome to {CYBERMIND_NAME} Code v{CYBERMIND_VERSION}</Text>
        <DottedBorder width={58} />
        <Box marginTop={1} />
        <SkyScene />
        <Box marginTop={1} />
        <DottedBorder width={58} />

        <Box flexDirection="column" marginTop={1} paddingLeft={2} paddingRight={2}>
          <Text bold color="white">Enter your API key</Text>
          <Box marginTop={1} />
          <Text color="gray">Provider: <Text color="cyan">{apiKeyProvider}</Text></Text>
          <Box marginTop={1} />
          <Text color="gray">Paste your API key here:</Text>
          <Box flexDirection="row">
            <Text color="gray">{'>'} </Text>
            <TextInput
              value={apiKeyInput}
              onChange={setApiKeyInput}
              onSubmit={() => {
                if (apiKeyInput.trim()) {
                  setApiKey(apiKeyProvider, apiKeyInput.trim());
                  markOnboardingComplete('apikey');
                  onComplete('apikey');
                }
              }}
              mask="*"
            />
          </Box>
          <Box marginTop={1} />
          <Text color="gray">Press Enter to submit, ESC to go back</Text>
        </Box>
      </Box>
    );
  }

  // ── THIRD PARTY PLATFORMS SCREEN ──
  if (screen === 'thirdparty-platforms') {
    useInput((_, key) => {
      if (key.escape) {
        setScreen('main');
        return;
      }
      if (key.upArrow) {
        setTpSelected((s) => Math.max(0, s - 1));
      } else if (key.downArrow) {
        setTpSelected((s) => Math.min(THIRDPARTY_PLATFORMS.length - 1, s + 1));
      } else if (key.return) {
        const plat = THIRDPARTY_PLATFORMS[tpSelected];
        if (plat?.id === 'back') {
          setScreen('main');
          setSelected(2);
        } else if (plat) {
          const urls: Record<string, string> = {
            openrouter: 'https://openrouter.ai/keys',
            groq: 'https://console.groq.com/keys',
            ollama: 'https://ollama.com/download',
          };
          const url = plat.id ? urls[plat.id] : undefined;
          if (url) {
            openBrowser(url);
          }
          markOnboardingComplete('thirdparty');
          onComplete('thirdparty');
        }
      }
    });

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color="#D97736">Welcome to {CYBERMIND_NAME} Code v{CYBERMIND_VERSION}</Text>
        <DottedBorder width={58} />
        <Box marginTop={1} />
        <SkyScene />
        <Box marginTop={1} />
        <DottedBorder width={58} />

        <Box flexDirection="column" marginTop={1} paddingLeft={2} paddingRight={2}>
          <Text bold color="white">Using 3rd-party platforms</Text>
          <Box marginTop={1} />
          {THIRDPARTY_PLATFORMS.map((plat, i) => (
            <Box key={plat.id} flexDirection="column" marginBottom={1}>
              <Text>
                {i === tpSelected ? (
                  <Text color="#D97736">{'› '}</Text>
                ) : (
                  <Text color="gray">{'  '}</Text>
                )}
                <Text color={i === tpSelected ? 'white' : 'gray'} bold={i === tpSelected}>
                  {i + 1}. {plat.label}
                </Text>
                {plat.desc && <Text color="gray"> · {plat.desc}</Text>}
              </Text>
            </Box>
          ))}
          <Box marginTop={1} />
          <Text color="gray">Arrow keys to navigate, Enter to select, ESC to go back</Text>
        </Box>
      </Box>
    );
  }

  return null;
};
