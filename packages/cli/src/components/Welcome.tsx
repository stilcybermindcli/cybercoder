import React from 'react';
import { Box, Text } from 'ink';
import { CYBERMIND_VERSION, CYBERMIND_NAME } from '@cybermind/shared';
import { MiniMascot } from './Mascot.js';
import { CompactSkyScene } from './SkyScene.js';

interface WelcomeProps {
  provider?: string;
  model?: string;
}

/**
 * Claude-Code-style welcome-back card.
 * Left side: sky scene + mascot + model info + cwd.
 * Right side: tips + what's new.
 */
export const Welcome: React.FC<WelcomeProps> = ({ model = 'auto' }) => {
  const cwd = process.cwd();
  const user = process.env.USER ?? process.env.USERNAME ?? 'friend';

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Top title bar */}
      <Text color="#D97736">{CYBERMIND_NAME} Code v{CYBERMIND_VERSION}</Text>
      <Text color="#D97736">{'─'.repeat(58)}</Text>

      <Box flexDirection="row" marginTop={1}>
        {/* LEFT COLUMN — Sky scene + mascot + info */}
        <Box flexDirection="column" width={40} paddingLeft={1}>
          <Text bold color="white">  Welcome back!</Text>
          <Box marginTop={1} />
          <CompactSkyScene />
          <Box marginTop={1} />
          <MiniMascot />
          <Box marginTop={1} />
          <Text color="gray">  {model} · API Usage Billing</Text>
          <Text color="gray">  {user}'s Individual Org</Text>
          <Box marginTop={1} />
          <Text color="gray">  {cwd}</Text>
        </Box>

        {/* RIGHT COLUMN — Tips + What's new */}
        <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
          <Text color="#ff9f43" bold>Tips for getting started</Text>
          <Text>
            Run <Text color="cyan">/init</Text> to create a CYBER.md file with instructions for CyberCoder.
          </Text>
          <Box marginTop={1} />
          <Text color="#ff9f43" bold>What's new</Text>
          <Text color="gray">
            Fixed theme picker to apply colors in real-time across the terminal.
          </Text>
          <Text color="gray">
            Added config persistence so login state survives between sessions.
          </Text>
          <Text color="gray">
            New 3rd-party platform support: OpenRouter, Groq, local Ollama.
          </Text>
          <Text color="gray">
            See <Text color="cyan">/release-notes</Text> for the full changelog.
          </Text>
        </Box>
      </Box>

      <Text color="#D97736">{'─'.repeat(58)}</Text>
    </Box>
  );
};
