import React from 'react';
import { Box, Text, useStdout } from 'ink';

interface HintBarProps {
  status?: 'idle' | 'thinking' | 'awaiting-approval' | 'error';
}

export const HintBar: React.FC<HintBarProps> = ({ status = 'idle' }) => {
  const { stdout } = useStdout();
  const termWidth = stdout.columns ?? 80;
  const contentWidth = Math.min(termWidth - 4, 76);

  const getHints = () => {
    switch (status) {
      case 'thinking':
        return (
          <Text color="gray">
            <Text bold color="#D97757">Esc</Text> to interrupt · <Text bold color="#D97757">?</Text> for shortcuts
          </Text>
        );
      case 'awaiting-approval':
        return (
          <Text color="gray">
            <Text bold color="green">y</Text> allow · <Text bold color="red">n</Text> deny · <Text bold color="yellow">a</Text> always · <Text bold color="gray">ESC</Text> cancel
          </Text>
        );
      case 'idle':
      default:
        return (
          <Text color="gray">
            <Text bold color="#D97757">?</Text> for shortcuts · <Text bold color="#D97757">/</Text> for commands · <Text bold color="red">Ctrl+C</Text> to exit
          </Text>
        );
    }
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Thin dim separator line */}
      <Text color="gray" dimColor>{'─'.repeat(contentWidth + 2)}</Text>
      <Box paddingLeft={1} marginTop={0}>
        {getHints()}
      </Box>
    </Box>
  );
};
