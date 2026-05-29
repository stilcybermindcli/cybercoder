import React from 'react';
import { Box, Text } from 'ink';
import type { SessionMessage } from '../state/session.js';

interface Props {
  messages: SessionMessage[];
}

const ROLE_COLOR: Record<SessionMessage['role'], string> = {
  user: 'cyan',
  assistant: 'white',
  system: 'gray',
  tool: 'magenta',
};

const ROLE_LABEL: Record<SessionMessage['role'], string> = {
  user: 'you',
  assistant: 'cybermind',
  system: 'info',
  tool: 'tool',
};

function renderFormattedText(text: string, key: any) {
  const parts: React.ReactNode[] = [];
  let currentText = '';
  let i = 0;

  while (i < text.length) {
    if (text.startsWith('**', i)) {
      if (currentText) {
        parts.push(<Text key={`txt-${i}`}>{currentText}</Text>);
        currentText = '';
      }
      i += 2;
      const endIdx = text.indexOf('**', i);
      if (endIdx !== -1) {
        const boldContent = text.substring(i, endIdx);
        parts.push(<Text key={`bold-${i}`} bold color="white">{boldContent}</Text>);
        i = endIdx + 2;
      } else {
        currentText += '**';
      }
    } else if (text.startsWith('`', i)) {
      if (currentText) {
        parts.push(<Text key={`txt-${i}`}>{currentText}</Text>);
        currentText = '';
      }
      i += 1;
      const endIdx = text.indexOf('`', i);
      if (endIdx !== -1) {
        const codeContent = text.substring(i, endIdx);
        parts.push(<Text key={`inline-code-${i}`} color="cyan" bold>{codeContent}</Text>);
        i = endIdx + 1;
      } else {
        currentText += '`';
      }
    } else {
      currentText += text[i];
      i++;
    }
  }

  if (currentText) {
    parts.push(<Text key={`txt-end`}>{currentText}</Text>);
  }

  // Header formatting (# or ##)
  if (text.startsWith('# ')) {
    return (
      <Box key={key} marginTop={1} marginBottom={1}>
        <Text color="#D97757" bold underline>{text.slice(2)}</Text>
      </Box>
    );
  }
  if (text.startsWith('## ')) {
    return (
      <Box key={key} marginTop={1}>
        <Text color="#D97757" bold>{text.slice(3)}</Text>
      </Box>
    );
  }

  return (
    <Box key={key} flexDirection="row">
      <Text>{parts}</Text>
    </Box>
  );
}

function parseContent(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Check code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
        const langHeader = codeBlockLang ? ` ${codeBlockLang.toUpperCase()} ` : ' CODE ';
        elements.push(
          <Box key={`code-${i}`} flexDirection="column" marginY={1} borderStyle="round" borderColor="gray">
            <Box paddingX={1} backgroundColor="gray">
              <Text color="black" bold>{langHeader}</Text>
            </Box>
            <Box paddingX={1} flexDirection="column">
              {codeBlockLines.map((l, idx) => (
                <Text key={idx} color="white">{l}</Text>
              ))}
            </Box>
          </Box>
        );
        codeBlockLines = [];
        codeBlockLang = '';
      } else {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Check tool call logs
    if (line.startsWith('[→ ') && line.includes(']')) {
      const match = line.match(/^\[→ ([^\]]+)\](.*)$/);
      if (match) {
        const toolName = match[1]?.trim() || '';
        const toolArgs = match[2]?.trim() || '';
        elements.push(
          <Box key={`tool-${i}`} flexDirection="column" paddingX={1} marginY={1} borderStyle="single" borderColor="yellow">
            <Text color="yellow" bold>⚡ Tool Call: {toolName}</Text>
            <Text color="gray">{toolArgs}</Text>
          </Box>
        );
        continue;
      }
    }

    // Diff line rendering
    if (line.startsWith('+') && !line.startsWith('+++')) {
      elements.push(<Text key={i} color="green">{line}</Text>);
      continue;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      elements.push(<Text key={i} color="red">{line}</Text>);
      continue;
    } else if (line.startsWith('@@')) {
      elements.push(<Text key={i} color="cyan">{line}</Text>);
      continue;
    }

    elements.push(renderFormattedText(line, i));
  }

  return elements;
}

export const MessageList: React.FC<Props> = ({ messages }) => {
  if (messages.length === 0) return null;
  return (
    <Box flexDirection="column" marginBottom={1}>
      {messages.map((m) => {
        // Skip rendering system messages that are empty or internal
        if (m.role === 'system' && !m.content.trim()) return null;

        return (
          <Box key={m.id} flexDirection="column" marginBottom={1}>
            <Text color={ROLE_COLOR[m.role]} bold>
              {ROLE_LABEL[m.role]}
            </Text>
            <Box flexDirection="column" paddingLeft={1}>
              {parseContent(m.content)}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
