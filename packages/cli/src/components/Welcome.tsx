import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { CYBERMIND_VERSION, CYBERMIND_NAME } from '@cybermind/shared';
import { Mascot } from './Mascot.js';
import { getUserProfile } from '../utils/config.js';

interface WelcomeProps {
  provider?: string;
  model?: string;
}

export const Welcome: React.FC<WelcomeProps> = ({ model = 'auto', provider = 'auto' }) => {
  const cwd = process.cwd();
  const profile = getUserProfile();
  const userName = profile.name || process.env.USER || process.env.USERNAME || 'Coder';
  const userPlan = profile.plan || 'Free';

  const { stdout } = useStdout();
  const termWidth = stdout.columns ?? 80;
  const contentWidth = Math.min(termWidth - 4, 76);

  const renderBorderTop = (title: string) => {
    const titleText = ` ${title} `;
    const dashLength = Math.max(2, contentWidth - titleText.length - 2);
    return <Text color="#D97757">╭{titleText}{'─'.repeat(dashLength)}╮</Text>;
  };

  const renderBorderBottom = () => {
    return <Text color="#D97757">╰{'─'.repeat(contentWidth)}╯</Text>;
  };

  return (
    <Box flexDirection="column" paddingX={1} width={contentWidth + 4}>
      {renderBorderTop(`${CYBERMIND_NAME} v${CYBERMIND_VERSION}`)}
      
      <Box flexDirection="column" paddingX={2} marginY={1}>
        <Box flexDirection="row" alignItems="center" marginBottom={1}>
          <Mascot />
          <Box flexDirection="column" marginLeft={2}>
            <Text bold color="white">Welcome back, {userName}!</Text>
            <Text color="gray">
              Model: <Text color="cyan" bold>{model}</Text> · Provider: <Text color="cyan" bold>{provider}</Text>
            </Text>
            <Text color="gray">
              Plan: <Text color="yellow" bold>{userPlan}</Text> · Organization: {userName}'s Workspace
            </Text>
            <Text color="gray" wrap="truncate-end">
              Cwd: <Text color="cyan">{cwd}</Text>
            </Text>
          </Box>
        </Box>

        <Text color="#D97757" bold marginBottom={1}>
          {'─'.repeat(contentWidth - 4)}
        </Text>

        <Box flexDirection="row" width="100%">
          {/* Left Column: Tips */}
          <Box flexDirection="column" width="50%" paddingRight={1}>
            <Text bold color="white" marginBottom={1}>Tips</Text>
            <Text color="gray">• <Text color="cyan">/init</Text> creates CYBER.md configuration</Text>
            <Text color="gray">• <Text color="cyan">/model</Text> changes active model</Text>
            <Text color="gray">• <Text color="cyan">/compact</Text> shrinks context size</Text>
            <Text color="gray">• <Text color="cyan">/help</Text> list all options</Text>
          </Box>

          {/* Right Column: What's New */}
          <Box flexDirection="column" width="50%" paddingLeft={1}>
            <Text bold color="white" marginBottom={1}>What's New</Text>
            <Text color="gray">• Real-time model consensus mode</Text>
            <Text color="gray">• Fully working web OAuth & redirection</Text>
            <Text color="gray">• Rich terminal Markdown formatting</Text>
            <Text color="gray">• Cost and token usage tracking</Text>
          </Box>
        </Box>
      </Box>

      {renderBorderBottom()}
      <Box paddingX={2} marginBottom={1}>
        <Text color="gray" italic>
          Need help? Ask CyberCoder a coding question or use / for commands.
        </Text>
      </Box>
    </Box>
  );
};
