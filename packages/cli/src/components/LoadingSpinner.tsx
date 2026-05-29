import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

interface LoadingSpinnerProps {
  text?: string;
  showTimer?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ text = 'Thinking', showTimer = false }) => {
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const frames = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];

  useEffect(() => {
    const frameInterval = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, 80);

    return () => clearInterval(frameInterval);
  }, []);

  useEffect(() => {
    if (!showTimer) return;
    const timerInterval = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [showTimer]);

  const formatElapsed = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <Box flexDirection="row" alignItems="center">
      <Text color="#D97757">{frames[frame]} </Text>
      <Text color="white" bold>{text}</Text>
      {showTimer && (
        <Text color="gray"> ({formatElapsed(elapsed)})</Text>
      )}
    </Box>
  );
};
