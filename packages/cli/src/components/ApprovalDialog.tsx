import React from 'react';
import { Box, Text, useInput } from 'ink';

export interface PendingApproval {
  toolName: string;
  summary: string;
  destructive: boolean;
  /** Resolve with the user's choice. */
  resolve: (decision: 'allow' | 'deny' | 'allow-session' | 'allow-persistent') => void;
}

interface Props {
  pending: PendingApproval;
}

export const ApprovalDialog: React.FC<Props> = ({ pending }) => {
  useInput((input, key) => {
    const char = input.toLowerCase();
    if (char === 'y') {
      pending.resolve('allow');
    } else if (char === 'n' || key.escape) {
      pending.resolve('deny');
    } else if (char === 'a') {
      pending.resolve('allow-persistent');
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={pending.destructive ? 'red' : 'yellow'}
      paddingX={1}
      marginY={1}
    >
      <Text bold color={pending.destructive ? 'red' : 'yellow'}>
        {pending.destructive ? '⚠ Critical Tool Approval Required' : '⚡ Tool Approval Required'}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Tool: <Text color="cyan" bold>{pending.toolName}</Text></Text>
        <Text color="gray">{pending.summary}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          <Text bold color="green">[y] Allow</Text> · <Text bold color="red">[n] Deny</Text> · <Text bold color="yellow">[a] Always allow</Text> · <Text bold color="gray">[ESC] Cancel</Text>
        </Text>
      </Box>
    </Box>
  );
};
