import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface PromptProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

// Memory-based persistent history across prompt mounts during session
const promptHistory: string[] = [];

export const Prompt: React.FC<PromptProps> = ({ onSubmit, disabled }) => {
  const [value, setValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const cwd = process.cwd();

  // Estimate tokens (roughly 4 characters per token)
  const estTokens = Math.ceil(value.length / 4);

  // Hook into input for Up/Down arrow history cycling
  useInput((input, key) => {
    if (disabled) return;

    if (key.upArrow) {
      if (promptHistory.length > 0) {
        const nextIndex = historyIndex === -1 ? promptHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIndex);
        setValue(promptHistory[nextIndex] || '');
      }
    } else if (key.downArrow) {
      if (historyIndex !== -1) {
        const nextIndex = historyIndex + 1;
        if (nextIndex >= promptHistory.length) {
          setHistoryIndex(-1);
          setValue('');
        } else {
          setHistoryIndex(nextIndex);
          setValue(promptHistory[nextIndex] || '');
        }
      }
    }
  });

  const handleSubmit = (text: string) => {
    // If ending with a backslash, append a newline and let user keep writing
    if (text.endsWith('\\')) {
      setValue(text.slice(0, -1) + '\n');
      return;
    }

    const trimmed = text.trim();
    if (trimmed) {
      // Add to history if unique from the last command
      if (promptHistory.length === 0 || promptHistory[promptHistory.length - 1] !== trimmed) {
        promptHistory.push(trimmed);
      }
      setHistoryIndex(-1);
      onSubmit(trimmed);
      setValue('');
    }
  };

  if (disabled) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray" dimColor>{cwd}</Text>
        <Box flexDirection="row">
          <Text color="gray">{'>'} </Text>
          <Text color="gray">(thinking…)</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        <Text color="gray" dimColor>{cwd}</Text>
        {value.length > 0 && (
          <Text color="gray" dimColor>[{value.length} chars · est {estTokens} tokens]</Text>
        )}
      </Box>
      <Box flexDirection="row">
        <Text color="#D97757" bold>{'>'} </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Ask CyberCoder... (/ for commands, end with \ for multi-line)"
        />
      </Box>
    </Box>
  );
};
