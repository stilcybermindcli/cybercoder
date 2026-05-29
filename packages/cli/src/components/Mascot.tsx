import React from 'react';
import { Text } from 'ink';

/**
 * 👾 Space-invader style pixel-art mascot for CyberCoder.
 * Classic retro arcade alien with blocky body, square eyes, and legs.
 */
export const Mascot: React.FC = () => {
  return (
    <Text>
      <Text color="#FF6B6B">    ▄▄▄▄▄▄▄    {'\n'}</Text>
      <Text color="#FF6B6B">   ▄█░░░░░░█▄   {'\n'}</Text>
      <Text color="#FF8E8E">  ▄█░░▄░░▄░░█▄  {'\n'}</Text>
      <Text color="#FF8E8E">  █░░░▀░░▀░░░█  {'\n'}</Text>
      <Text color="#FF6B6B">  █░░░░▄▄░░░░█  {'\n'}</Text>
      <Text color="#FF6B6B">   ▀█░░░░░░█▀   {'\n'}</Text>
      <Text color="#FF4757">     ▀▀▀▀▀▀     {'\n'}</Text>
      <Text color="#FF4757">     ▌    ▌     {'\n'}</Text>
      <Text color="#FF4757">     ▌    ▌     </Text>
    </Text>
  );
};

/**
 * Mini mascot variant for the sky scene (smaller, no legs).
 */
export const MiniMascot: React.FC = () => {
  return (
    <Text>
      <Text color="#FF8E8E">  ▄▄▄▄▄▄▄  {'\n'}</Text>
      <Text color="#FF8E8E"> ▄█▄▄▄▄▄▄█▄ {'\n'}</Text>
      <Text color="#FF6B6B"> █░░▄░░▄░░█ {'\n'}</Text>
      <Text color="#FF6B6B"> █░░▀░░▀░░█ {'\n'}</Text>
      <Text color="#FF4757">  ▀▀▀▀▀▀▀▀  {'\n'}</Text>
      <Text color="#FF4757">  ▐      ▌  </Text>
    </Text>
  );
};
