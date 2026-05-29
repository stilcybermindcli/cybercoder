import { Box, useApp, useInput } from 'ink';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Welcome } from './components/Welcome.js';
import { Onboarding } from './components/Onboarding.js';
import { ThemePicker, type ThemeConfig } from './components/ThemePicker.js';
import { Settings } from './components/Settings.js';
import { Prompt } from './components/Prompt.js';
import { MessageList } from './components/MessageList.js';
import { StatusBar } from './components/StatusBar.js';
import { ExitConfirm } from './components/ExitConfirm.js';
import { ApprovalDialog, type PendingApproval } from './components/ApprovalDialog.js';
import { buildCommandRegistry } from './commands/index.js';
import { runChat } from './runtime/chat.js';
import { isOnboardingComplete, getTheme, setTheme, clearLogin } from './utils/config.js';
import type { ApprovalDecision, ApprovalPrompt, ApprovalUI } from '@cybermind/tools';
import type { SessionMessage, SessionStatus } from './state/session.js';

type Screen = 'onboarding' | 'theme' | 'settings' | 'welcome' | 'chat';

interface AppProps {
  showWelcome: boolean;
  initialModel?: string;
  initialProvider?: string;
}

export const App: React.FC<AppProps> = ({ showWelcome, initialModel, initialProvider }) => {
  const { exit } = useApp();

  // Check config for onboarding completion and saved theme
  const configTheme = getTheme();
  const hasCompletedOnboarding = isOnboardingComplete();
  const [screen, setScreen] = useState<Screen>(hasCompletedOnboarding ? 'welcome' : 'onboarding');
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>({
    mode: configTheme.mode as ThemeConfig['mode'],
    syntaxTheme: configTheme.syntaxTheme,
  });

  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [model, setModel] = useState<string>(initialModel ?? 'auto');
  const [provider, setProvider] = useState<string>(initialProvider ?? 'auto');
  const [, setPromptColor] = useState<string>('cyan');
  const [welcomeVisible, setWelcomeVisible] = useState<boolean>(showWelcome);
  const [exitConfirm, setExitConfirm] = useState<boolean>(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  // Holds the live mutable id of the assistant message currently being streamed.
  const streamingIdRef = useRef<string | null>(null);
  // Forward-declared so slash-command handlers can submit synthesized prompts
  // before driveChat is created below (e.g. /research, /plan).
  const driveChatRef = useRef<(text: string) => Promise<void>>(async () => {});

  // ApprovalUI implementation that defers the decision to the Ink dialog.
  const approvalUI = useMemo<ApprovalUI>(
    () => ({
      ask(prompt: ApprovalPrompt): Promise<ApprovalDecision> {
        return new Promise<ApprovalDecision>((resolve) => {
          setPendingApproval({
            toolName: prompt.toolName,
            summary: prompt.summary,
            destructive: prompt.destructive,
            resolve: (decision) => {
              setPendingApproval(null);
              resolve(decision);
            },
          });
        });
      },
    }),
    [],
  );

  const appendMessage = useCallback((msg: SessionMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setWelcomeVisible(false);
  }, []);

  const commandRegistry = useMemo(
    () =>
      buildCommandRegistry({
        clear: clearMessages,
        exit: () => exit(),
        appendMessage,
        submitUserPrompt: (text) => {
          // Slash-command shortcuts (e.g. /research) call this to inject a
          // synthesized user message that the main agent then processes.
          void driveChatRef.current(text);
        },
        getModel: () => model,
        setModel,
        getProvider: () => provider,
        setProvider,
        setPromptColor,
        setScreen: (s: string) => setScreen(s as Screen),
        logout: () => {
          clearLogin();
          setMessages([]);
          setWelcomeVisible(true);
          setScreen('onboarding');
        },
      }),
    [appendMessage, clearMessages, exit, model, provider],
  );

  // Handle Ctrl+C: first press asks for confirmation, second press exits.
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (exitConfirm) {
        exit();
      } else {
        setExitConfirm(true);
        // Auto-clear after 2s
        setTimeout(() => setExitConfirm(false), 2000);
      }
    }
  });

  /** Append a streaming text delta into the active assistant message. */
  const appendDelta = useCallback((delta: string) => {
    setMessages((prev) => {
      const id = streamingIdRef.current;
      if (!id) return prev;
      return prev.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m));
    });
  }, []);

  const driveChat = useCallback(
    async (userText: string) => {
      const userMsg: SessionMessage = {
        id: cryptoRandomId(),
        role: 'user',
        content: userText,
        createdAt: Date.now(),
      };
      const assistantId = cryptoRandomId();
      streamingIdRef.current = assistantId;
      const assistantMsg: SessionMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      };

      // Build the history snapshot the agent loop sees (user appended).
      const nextHistory = [...messages, userMsg];
      setMessages([...nextHistory, assistantMsg]);
      setStatus('thinking');

      try {
        await runChat(nextHistory, {
          model,
          approvalUI,
          onEvent: (evt) => {
            if (evt.type === 'text') appendDelta(evt.text);
            else if (evt.type === 'tool_call') {
              setStatus('awaiting-approval');
              appendDelta(`\n[→ ${evt.name}] ${stringifyArgs(evt.input)}\n`);
            } else if (evt.type === 'tool_result') {
              setStatus('thinking');
              const trimmed = evt.output.length > 800 ? `${evt.output.slice(0, 800)}\n…[truncated]` : evt.output;
              appendDelta(`\n${trimmed}\n`);
            } else if (evt.type === 'done') {
              if (evt.reason === 'error') {
                appendDelta(`\n[error] ${evt.error ?? 'unknown'}`);
              }
            }
          },
        });
      } catch (err) {
        appendDelta(`\n[fatal] ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        streamingIdRef.current = null;
        setStatus('idle');
      }
    },
    [messages, model, appendDelta, approvalUI],
  );

  // Keep the ref pointing at the latest driveChat closure so slash-command
  // shortcuts always see fresh state when they inject synthesized prompts.
  driveChatRef.current = driveChat;

  const handleSubmit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      // Hide the welcome card on first real interaction
      if (welcomeVisible) setWelcomeVisible(false);

      // Slash command dispatch
      if (text.startsWith('/')) {
        const [name, ...rest] = text.slice(1).split(/\s+/);
        const args = rest.join(' ');
        const cmd = commandRegistry.find(name ?? '');
        if (!cmd) {
          appendMessage({
            id: cryptoRandomId(),
            role: 'system',
            content: `Unknown command: /${name}. Type /help for a list.`,
            createdAt: Date.now(),
          });
          return;
        }
        try {
          cmd.run(args);
        } catch (err) {
          appendMessage({
            id: cryptoRandomId(),
            role: 'system',
            content: `Error in /${name}: ${err instanceof Error ? err.message : String(err)}`,
            createdAt: Date.now(),
          });
        }
        return;
      }

      // Drive the real agent loop (M2).
      void driveChat(text);
    },
    [appendMessage, commandRegistry, welcomeVisible, driveChat],
  );

  // Screen navigation handlers
  const handleOnboardingComplete = useCallback((method: string) => {
    void method;
    setScreen('theme');
  }, []);

  const handleThemeComplete = useCallback((theme: ThemeConfig) => {
    setThemeConfig(theme);
    setTheme(theme.mode, theme.syntaxTheme);
    setScreen('welcome');
  }, []);

  const handleSettingsClose = useCallback(() => {
    setScreen('chat');
  }, []);

  // Render based on current screen
  const renderScreen = () => {
    switch (screen) {
      case 'onboarding':
        return <Onboarding onComplete={handleOnboardingComplete} />;
      case 'theme':
        return <ThemePicker onComplete={handleThemeComplete} />;
      case 'settings':
        return <Settings onClose={handleSettingsClose} />;
      case 'welcome':
        return (
          <>
            {welcomeVisible && <Welcome provider={provider} model={model} />}
            <MessageList messages={messages} />
            {pendingApproval && <ApprovalDialog pending={pendingApproval} />}
            <Prompt onSubmit={handleSubmit} disabled={status !== 'idle'} />
            <StatusBar status={status} model={model} provider={provider} />
            {exitConfirm && <ExitConfirm />}
          </>
        );
      case 'chat':
      default:
        return (
          <>
            <MessageList messages={messages} />
            {pendingApproval && <ApprovalDialog pending={pendingApproval} />}
            <Prompt onSubmit={handleSubmit} disabled={status !== 'idle'} />
            <StatusBar status={status} model={model} provider={provider} />
            {exitConfirm && <ExitConfirm />}
          </>
        );
    }
  };

  return (
    <Box flexDirection="column">
      {renderScreen()}
    </Box>
  );
};

function cryptoRandomId(): string {
  // Avoid pulling in `node:crypto` for the renderer; a short random suffices.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stringifyArgs(input: Record<string, unknown>): string {
  // Compact, single-line preview of tool arguments for the chat transcript.
  const pairs = Object.entries(input).map(([k, v]) => {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    const short = s.length > 80 ? `${s.slice(0, 80)}…` : s;
    return `${k}=${short}`;
  });
  return pairs.join(', ');
}
