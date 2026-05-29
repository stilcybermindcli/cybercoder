import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { exec } from 'node:child_process';
import http from 'node:http';
import { CYBERMIND_VERSION, CYBERMIND_NAME } from '@cybermind/shared';
import { Mascot } from './Mascot.js';
import { LoadingSpinner } from './LoadingSpinner.js';
import {
  markOnboardingComplete,
  setApiKey,
  setAuthToken,
  setSessionId,
  setUserProfile
} from '../utils/config.js';
import { apiClient } from '../utils/api-client.js';

interface OnboardingProps {
  onComplete: (method: string) => void;
}

type SubScreen = 'main' | 'cybercli-login' | 'apikey-input' | 'thirdparty-platforms';

const LOGIN_METHODS = [
  {
    id: 'cybercli',
    label: 'CyberCli account (Pro, Max, Team)',
    desc: 'Automated OAuth browser sign-in',
  },
  {
    id: 'apikey',
    label: 'API Key (Bring Your Own Key)',
    desc: 'Billed based on API usage',
  },
  {
    id: 'thirdparty',
    label: '3rd-party platform (Ollama, Groq, etc.)',
    desc: 'Local setup and config',
  },
];

const THIRDPARTY_PLATFORMS = [
  { id: 'openrouter', label: 'OpenRouter', desc: 'Get OpenRouter API keys' },
  { id: 'groq', label: 'Groq', desc: 'Get Groq API keys' },
  { id: 'ollama', label: 'Ollama (local)', desc: 'Run locally' },
  { id: 'back', label: 'Go back', desc: '' },
];

const API_PROVIDERS = [
  { id: 'cybermind', label: 'CyberMind Cloud' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'groq', label: 'Groq' },
  { id: 'google', label: 'Google (Gemini)' },
  { id: 'openrouter', label: 'OpenRouter' },
];

function openBrowser(url: string) {
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      exec(`cmd /c start "" "${url}"`, { windowsHide: true });
    } else if (platform === 'darwin') {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
  } catch {
    // Silently fail if browser can't be opened
  }
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [screen, setScreen] = useState<SubScreen>('main');
  const [selected, setSelected] = useState(0);

  // local callback server state
  const [port, setPort] = useState<number | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [waitingForAuth, setWaitingForAuth] = useState(false);
  const serverRef = useRef<http.Server | null>(null);

  // API key input state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyProvider, setApiKeyProvider] = useState('cybermind');
  const [apiKeyStage, setApiKeyStage] = useState<'provider' | 'key'>('provider');

  // 3rd party state
  const [tpSelected, setTpSelected] = useState(0);

  const termWidth = stdout.columns ?? 80;
  const contentWidth = Math.min(termWidth - 4, 76);

  // HTTP callback server management
  useEffect(() => {
    if (screen === 'cybercli-login') {
      setWaitingForAuth(true);
      setAuthError(null);

      const server = http.createServer((req, res) => {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
        if (urlObj.pathname === '/auth') {
          const token = urlObj.searchParams.get('token');
          if (token) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Successful!</h1><p>You can close this tab and return to the terminal.</p>');

            setAuthToken(token);
            apiClient.authenticate(token)
              .then((authInfo) => {
                setSessionId(authInfo.session_id);
                setUserProfile(authInfo.user);
                markOnboardingComplete('cybercli');
                onComplete('cybercli');
              })
              .catch((err) => {
                setAuthError(err.message || 'Token verification failed');
                setWaitingForAuth(false);
              });

            // Close server after response finishes
            setTimeout(() => {
              server.close();
            }, 1000);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing token');
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const allocatedPort = typeof addr === 'string' ? 0 : addr?.port || 0;
        setPort(allocatedPort);

        const frontendUrl = process.env.FRONTEND_URL || 'https://cybermindcli.info';
        openBrowser(`${frontendUrl}/login?redirect=cli&port=${allocatedPort}`);
      });

      serverRef.current = server;

      // Timeout after 5 minutes
      const timeout = setTimeout(() => {
        setAuthError('Authentication timed out. Please try again.');
        setWaitingForAuth(false);
        server.close();
      }, 5 * 60 * 1000);

      return () => {
        clearTimeout(timeout);
        server.close();
      };
    }
  }, [screen, onComplete]);

  // Unified keyboard handler
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    if (screen === 'main') {
      if (key.escape) {
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
          setApiKeyProvider('cybermind');
          setSelected(0);
        } else if (method?.id === 'thirdparty') {
          setScreen('thirdparty-platforms');
          setTpSelected(0);
        }
      }
      return;
    }

    if (screen === 'cybercli-login') {
      if (key.escape) {
        setScreen('main');
        setSelected(0);
        return;
      }
      return;
    }

    if (screen === 'apikey-input') {
      if (apiKeyStage === 'provider') {
        if (key.escape) {
          setScreen('main');
          setSelected(1);
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
        return;
      }

      if (key.escape) {
        setApiKeyStage('provider');
        setSelected(0);
        return;
      }
      return;
    }

    if (screen === 'thirdparty-platforms') {
      if (key.escape) {
        setScreen('main');
        setSelected(2);
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
          const url = urls[plat.id];
          if (url) {
            openBrowser(url);
          }
          markOnboardingComplete('thirdparty');
          onComplete('thirdparty');
        }
      }
      return;
    }
  });

  const renderBorderTop = (title: string) => {
    const titleText = ` ${title} `;
    const dashLength = Math.max(2, contentWidth - titleText.length - 2);
    return <Text color="#D97757">╭{titleText}{'─'.repeat(dashLength)}╮</Text>;
  };

  const renderBorderBottom = () => {
    return <Text color="#D97757">╰{'─'.repeat(contentWidth)}╯</Text>;
  };

  // ── RENDER: Main Screen ──
  if (screen === 'main') {
    return (
      <Box flexDirection="column" paddingX={1} width={contentWidth + 4}>
        {renderBorderTop(`${CYBERMIND_NAME} v${CYBERMIND_VERSION}`)}
        <Box flexDirection="column" paddingX={2} marginY={1}>
          <Box flexDirection="row" alignItems="center" marginBottom={1}>
            <Mascot />
            <Box flexDirection="column" marginLeft={2}>
              <Text bold color="white">Welcome to {CYBERMIND_NAME}</Text>
              <Text color="gray">The fullstack agentic coding CLI</Text>
            </Box>
          </Box>

          <Text color="white" bold marginBottom={1}>
            How would you like to authenticate?
          </Text>

          {LOGIN_METHODS.map((method, i) => (
            <Box key={method.id} flexDirection="row" marginBottom={1}>
              <Text>
                {i === selected ? (
                  <Text color="#D97757">› </Text>
                ) : (
                  <Text color="gray">  </Text>
                )}
                <Text color={i === selected ? 'white' : 'gray'} bold={i === selected}>
                  {i + 1}. {method.label}
                </Text>
                <Text color="gray"> · {method.desc}</Text>
              </Text>
            </Box>
          ))}

          <Box marginTop={1}>
            <Text color="gray">↑↓ navigate · Enter select · ESC exit</Text>
          </Box>
        </Box>
        {renderBorderBottom()}
      </Box>
    );
  }

  // ── RENDER: CyberCli Login Screen ──
  if (screen === 'cybercli-login') {
    const frontendUrl = process.env.FRONTEND_URL || 'https://cybermindcli.info';
    return (
      <Box flexDirection="column" paddingX={1} width={contentWidth + 4}>
        {renderBorderTop('Waiting for Authentication')}
        <Box flexDirection="column" paddingX={2} marginY={1}>
          {waitingForAuth ? (
            <Box flexDirection="column" marginBottom={1}>
              <LoadingSpinner text="Waiting for browser authentication..." />
              <Box marginTop={1}>
                <Text color="gray">A browser window should have opened. If not, open:</Text>
                <Text color="cyan">{frontendUrl}/login?redirect=cli&port={port || '...'}</Text>
              </Box>
            </Box>
          ) : (
            <Box flexDirection="column" marginBottom={1}>
              {authError ? (
                <Text color="red" bold>✕ {authError}</Text>
              ) : (
                <Text color="green" bold>✓ Authenticated successfully!</Text>
              )}
            </Box>
          )}

          <Box marginTop={1}>
            <Text color="gray">ESC to go back to main menu</Text>
          </Box>
        </Box>
        {renderBorderBottom()}
      </Box>
    );
  }

  // ── RENDER: API Key Input Screen ──
  if (screen === 'apikey-input') {
    if (apiKeyStage === 'provider') {
      return (
        <Box flexDirection="column" paddingX={1} width={contentWidth + 4}>
          {renderBorderTop('Select API Provider')}
          <Box flexDirection="column" paddingX={2} marginY={1}>
            <Text color="white" bold marginBottom={1}>
              Select an API provider:
            </Text>

            {API_PROVIDERS.map((prov, i) => (
              <Box key={prov.id} flexDirection="row" marginBottom={1}>
                <Text>
                  {i === selected ? (
                    <Text color="#D97757">› </Text>
                  ) : (
                    <Text color="gray">  </Text>
                  )}
                  <Text color={i === selected ? 'white' : 'gray'} bold={i === selected}>
                    {i + 1}. {prov.label}
                  </Text>
                </Text>
              </Box>
            ))}

            <Box marginTop={1}>
              <Text color="gray">↑↓ navigate · Enter select · ESC go back</Text>
            </Box>
          </Box>
          {renderBorderBottom()}
        </Box>
      );
    }

    return (
      <Box flexDirection="column" paddingX={1} width={contentWidth + 4}>
        {renderBorderTop('Enter API Key')}
        <Box flexDirection="column" paddingX={2} marginY={1}>
          <Text color="white" bold marginBottom={1}>
            Paste your API key below:
          </Text>
          <Text color="gray" marginBottom={1}>
            Provider: <Text color="cyan" bold>{apiKeyProvider}</Text>
          </Text>

          <Box flexDirection="row" marginBottom={1}>
            <Text color="gray">{'>'} </Text>
            <TextInput
              value={apiKeyInput}
              onChange={setApiKeyInput}
              onSubmit={() => {
                const trimmed = apiKeyInput.trim();
                if (trimmed) {
                  setApiKey(apiKeyProvider, trimmed);
                  if (apiKeyProvider === 'cybermind') {
                    // Try to authenticate with the API key to backend
                    setAuthToken(trimmed);
                    apiClient.authenticate(trimmed)
                      .then((authInfo) => {
                        setSessionId(authInfo.session_id);
                        setUserProfile(authInfo.user);
                        markOnboardingComplete('apikey');
                        onComplete('apikey');
                      })
                      .catch((err) => {
                        // Save key anyway, client can run offline
                        markOnboardingComplete('apikey');
                        onComplete('apikey');
                      });
                  } else {
                    markOnboardingComplete('apikey');
                    onComplete('apikey');
                  }
                }
              }}
              mask="*"
            />
          </Box>

          <Box marginTop={1}>
            <Text color="gray">Enter submit · ESC go back</Text>
          </Box>
        </Box>
        {renderBorderBottom()}
      </Box>
    );
  }

  // ── RENDER: 3rd Party Platforms Screen ──
  if (screen === 'thirdparty-platforms') {
    return (
      <Box flexDirection="column" paddingX={1} width={contentWidth + 4}>
        {renderBorderTop('3rd-Party Platforms')}
        <Box flexDirection="column" paddingX={2} marginY={1}>
          <Text color="white" bold marginBottom={1}>
            Select a local or 3rd-party platform to set up:
          </Text>

          {THIRDPARTY_PLATFORMS.map((plat, i) => (
            <Box key={plat.id} flexDirection="column" marginBottom={1}>
              <Text>
                {i === tpSelected ? (
                  <Text color="#D97757">› </Text>
                ) : (
                  <Text color="gray">  </Text>
                )}
                <Text color={i === tpSelected ? 'white' : 'gray'} bold={i === tpSelected}>
                  {i + 1}. {plat.label}
                </Text>
                {plat.desc && <Text color="gray"> · {plat.desc}</Text>}
              </Text>
            </Box>
          ))}

          <Box marginTop={1}>
            <Text color="gray">↑↓ navigate · Enter select · ESC go back</Text>
          </Box>
        </Box>
        {renderBorderBottom()}
      </Box>
    );
  }

  return null;
};
