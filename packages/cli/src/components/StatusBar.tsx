import React from 'react';
import { Box, Text } from 'ink';
import type { SessionStatus } from '../state/session.js';

interface Props {
  status: SessionStatus;
  model: string;
  provider: string;
  tokens?: number;
  cost?: number;
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: 'ready',
  thinking: 'thinking…',
  'awaiting-approval': 'awaiting approval',
  error: 'error',
};

const STATUS_COLOR: Record<SessionStatus, string> = {
  idle: 'green',
  thinking: 'yellow',
  'awaiting-approval': 'magenta',
  error: 'red',
};

export const StatusBar: React.FC<Props> = ({ status, model, provider, tokens = 0, cost = 0 }) => {
  const formatTokens = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  return (
    <Box marginTop={1} paddingLeft={1}>
      <Text color="gray">{'['}</Text>
      <Text color={STATUS_COLOR[status]} bold>{STATUS_LABEL[status]}</Text>
      <Text color="gray">{'] '} </Text>
      <Text color="white" bold>{model}</Text>
      <Text color="gray"> · </Text>
      <Text color="white">{provider}</Text>
      <Text color="gray"> │ </Text>
      <Text color="gray">tokens: </Text>
      <Text color="cyan" bold>{formatTokens(tokens)}</Text>
      <Text color="gray"> │ </Text>
      <Text color="gray">cost: </Text>
      <Text color="green" bold>${cost.toFixed(2)}</Text>
      <Text color="gray"> │ </Text>
      <Text color="gray">? shortcuts</Text>
    </Box>
  );
};
