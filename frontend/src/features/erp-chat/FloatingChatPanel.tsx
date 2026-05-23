/**
 * Floating chat panel — sliding side drawer (or full-screen sheet on
 * mobile) that talks to the same backend SSE endpoint as the full-page
 * chat. Reuses the renderer registry so tool results render exactly the
 * same way as on /chat.
 *
 * The panel intentionally owns its own conversation state (mirroring
 * `useChatFullPage`) rather than sharing state with the full-page chat —
 * this way the user can keep a long-running full-page conversation open in
 * one tab and use the floating widget for quick lookups in another without
 * stomping on each other.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type FC,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  X,
  ExternalLink,
  History,
  MessageSquarePlus,
  Loader2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProjectContextStore } from '@/stores/useProjectContextStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { aiApi, type AISettings } from '@/features/ai/api';
import { useFocusTrap } from '@/shared/hooks/useFocusTrap';
import { useFloatingChatStore, useIsMobileViewport } from './useFloatingChat';
import { fetchChatSessions } from './api';
import type { ChatMessage, ChatSession, ToolCallInfo } from './types';

// Reuse the full-page renderer registry so the tool-result cards inside the
// floating panel look identical to /chat. Importing the components directly
// (not the router) lets us render them inline below each tool call.
import {
  ProjectsGridRenderer,
  BOQRenderer,
  ScheduleRenderer,
  ValidationRenderer,
  CostModelRenderer,
  RiskMatrixRenderer,
  CompareRenderer,
  CWICRRenderer,
  GenericTableRenderer,
} from './full-page/right/renderers';

import './full-page/chat-tokens.css';

const RENDERERS: Record<string, FC<{ data: unknown }>> = {
  projects_grid: ProjectsGridRenderer,
  boq_table: BOQRenderer,
  schedule_gantt: ScheduleRenderer,
  validation_list: ValidationRenderer,
  cost_model: CostModelRenderer,
  risk_matrix: RiskMatrixRenderer,
  compare_table: CompareRenderer,
  cwicr_results: CWICRRenderer,
  generic_table: GenericTableRenderer,
};

const SOFT_LIMIT = 3000;
const HARD_LIMIT = 4000;

function uid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Suggestion prompts ─────────────────────────────────────────────────────
function useDefaultSuggestions(): string[] {
  const { t } = useTranslation();
  return [
    t('chat.panel.sugg_over_budget', { defaultValue: 'What are my over-budget projects?' }),
    t('chat.panel.sugg_top_risks', { defaultValue: 'Show me top open risks' }),
    t('chat.panel.sugg_walls', {
      defaultValue: "Find all walls > 30cm in current project's BIM",
    }),
    t('chat.panel.sugg_validate_boq', { defaultValue: 'Validate the current BOQ' }),
    t('chat.panel.sugg_draft_rfi', {
      defaultValue: 'Create a draft RFI from the latest clash',
    }),
    t('chat.panel.sugg_critical_path', { defaultValue: "What's the schedule critical path?" }),
  ];
}

// ── Lightweight markdown (shared subset of MessageBubble) ──────────────────
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code: string) =>
    `<pre style="background:var(--chat-surface-3,rgba(0,0,0,.06));padding:8px 10px;border-radius:6px;overflow-x:auto;font-size:12px;line-height:1.5;font-family:var(--chat-font-mono,monospace);margin:4px 0"><code>${code.trimEnd()}</code></pre>`,
  );
  html = html.replace(/`([^`\n]+)`/g, (_m, code: string) =>
    `<code style="background:var(--chat-surface-3,rgba(0,0,0,.06));padding:1px 4px;border-radius:3px;font-size:0.9em;font-family:var(--chat-font-mono,monospace)">${code}</code>`,
  );
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const isExternal = /^https?:\/\//i.test(href);
    const isInternal = href.startsWith('/') || href.startsWith('#');
    const isMailto = /^mailto:/i.test(href);
    if (!isExternal && !isInternal && !isMailto) {
      return `<span style="color:var(--chat-accent,#3b82f6)">${label}</span>`;
    }
    const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${href}"${attrs} style="color:var(--chat-accent,#3b82f6);text-decoration:underline;font-weight:500">${label}</a>`;
  });
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, '<em>$1</em>');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

// ── Tool call card (compact variant for the panel) ─────────────────────────
function ToolCallEntry({ tool }: { tool: ToolCallInfo }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const renderer = tool.result?.renderer;
  const RendererComp = renderer ? RENDERERS[renderer] : null;
  const data = tool.result?.data;
  const summary = tool.result?.summary;

  const statusLabel =
    tool.status === 'running'
      ? t('chat.panel.tool_running', {
          defaultValue: 'Running {{name}}...',
          name: tool.name,
        })
      : tool.status === 'error'
      ? t('chat.panel.tool_failed', {
          defaultValue: 'Tool {{name}} failed',
          name: tool.name,
        })
      : tool.name;

  return (
    <div
      style={{
        margin: '6px 0',
        border: '1px solid var(--chat-border-subtle)',
        borderRadius: 8,
        background: 'var(--chat-surface-2)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
          fontFamily: 'var(--chat-font-body)',
          color: 'var(--chat-text-secondary)',
          textAlign: 'left',
        }}
        aria-expanded={open}
      >
        {tool.status === 'running' && (
          <Loader2 size={12} className="animate-spin" style={{ color: 'var(--chat-tool-running)' }} />
        )}
        <span
          style={{
            color:
              tool.status === 'error'
                ? 'var(--chat-tool-error)'
                : tool.status === 'done'
                ? 'var(--chat-tool-done)'
                : 'var(--chat-text-secondary)',
            fontWeight: 500,
          }}
        >
          {statusLabel}
        </span>
        {summary && (
          <span
            style={{
              color: 'var(--chat-text-tertiary)',
              fontSize: 11,
              marginLeft: 'auto',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 160,
            }}
            title={summary}
          >
            {summary}
          </span>
        )}
      </button>
      {open && RendererComp && data !== undefined && (
        <div style={{ padding: 8, borderTop: '1px solid var(--chat-border-subtle)' }}>
          <RendererComp data={data} />
        </div>
      )}
    </div>
  );
}

// ── Empty-state suggestion chips ───────────────────────────────────────────
function EmptyState({
  onPick,
  aiConfigured,
}: {
  onPick: (text: string) => void;
  aiConfigured: boolean | null;
}) {
  const { t } = useTranslation();
  const suggestions = useDefaultSuggestions();

  if (aiConfigured === false) {
    return (
      <div
        style={{
          padding: 20,
          textAlign: 'center',
          color: 'var(--chat-text-secondary)',
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--chat-text-primary)' }}>
          {t('chat.onboarding_title', { defaultValue: 'AI assistant is not configured yet' })}
        </div>
        <div style={{ marginBottom: 12 }}>
          {t('chat.onboarding_desc', {
            defaultValue:
              'Connect your AI provider (Anthropic, OpenAI, or Google) in Settings to enable the chat assistant.',
          })}
        </div>
        <a
          href="/settings"
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            background: 'var(--chat-accent)',
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {t('chat.go_to_settings', { defaultValue: 'Go to Settings' })}
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 14px' }}>
      <div
        style={{
          fontSize: 13,
          color: 'var(--chat-text-secondary)',
          lineHeight: 1.55,
          marginBottom: 12,
        }}
      >
        {t('chat.panel.empty_state', {
          defaultValue:
            'Ask about a project, BOQ, validation, clashes, costs, or run an action like "create RFI for clash 32".',
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            data-testid="floating-chat-suggestion"
            style={{
              textAlign: 'left',
              padding: '8px 12px',
              fontSize: 13,
              fontFamily: 'var(--chat-font-body)',
              background: 'var(--chat-surface-2)',
              border: '1px solid var(--chat-border-subtle)',
              borderRadius: 8,
              color: 'var(--chat-text-primary)',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--chat-accent)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                'var(--chat-border-subtle)';
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Sessions dropdown ──────────────────────────────────────────────────────
function SessionsMenu({
  open,
  onClose,
  onPick,
  onNew,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchChatSessions()
      .then((res) => {
        if (cancelled) return;
        setSessions(res.items.slice(0, 10));
      })
      .catch(() => {
        if (cancelled) return;
        setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="menu"
      aria-label={t('chat.panel.sessions_title', { defaultValue: 'Recent sessions' })}
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        right: 8,
        width: 260,
        maxHeight: 320,
        overflowY: 'auto',
        background: 'var(--chat-bg)',
        border: '1px solid var(--chat-border)',
        borderRadius: 8,
        boxShadow: '0 10px 24px rgba(0,0,0,0.15)',
        zIndex: 10,
      }}
    >
      <button
        type="button"
        onClick={() => {
          onNew();
          onClose();
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--chat-border-subtle)',
          cursor: 'pointer',
          fontSize: 13,
          color: 'var(--chat-text-primary)',
          textAlign: 'left',
        }}
      >
        <MessageSquarePlus size={14} />
        {t('chat.panel.new_session', { defaultValue: 'New conversation' })}
      </button>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--chat-text-tertiary)',
          padding: '8px 12px 4px',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {t('chat.panel.sessions_title', { defaultValue: 'Recent sessions' })}
      </div>
      {loading && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--chat-text-tertiary)' }}>
          {t('common.loading', { defaultValue: 'Loading...' })}
        </div>
      )}
      {!loading && sessions.length === 0 && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--chat-text-tertiary)' }}>
          {t('chat.panel.no_sessions', { defaultValue: 'No previous sessions yet.' })}
        </div>
      )}
      {sessions.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => {
            onPick(s.id);
            onClose();
          }}
          style={{
            width: '100%',
            display: 'block',
            padding: '6px 12px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--chat-text-primary)',
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--chat-surface-2)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
          title={s.title}
        >
          {s.title || t('chat.panel.untitled', { defaultValue: '(untitled)' })}
        </button>
      ))}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────
export function FloatingChatPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isOpen = useFloatingChatStore((s) => s.isOpen);
  const close = useFloatingChatStore((s) => s.close);
  const activeSessionId = useFloatingChatStore((s) => s.activeSessionId);
  const setActiveSession = useFloatingChatStore((s) => s.setActiveSession);
  const bumpUnread = useFloatingChatStore((s) => s.bumpUnread);
  const isMobile = useIsMobileViewport(640);
  const resolvedTheme = useThemeStore((s) => s.resolved);
  const activeProjectId = useProjectContextStore((s) => s.activeProjectId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [value, setValue] = useState('');
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [title, setTitle] = useState<string>(
    t('chat.panel.title_default', { defaultValue: 'AI assistant' }),
  );

  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Trap focus inside the panel while it is open so Tab navigation cannot
  // escape into the rest of the page (a11y requirement).
  useFocusTrap(containerRef, isOpen);

  // ESC closes the panel.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  // Focus the textarea right after the panel opens.
  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => textareaRef.current?.focus(), 80);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  // Auto-scroll on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
  }, [messages, isStreaming]);

  // Probe AI configuration (so we can show the onboarding card instead of
  // hitting the API with a 500).
  useEffect(() => {
    if (!isOpen) return;
    if (aiConfigured !== null) return;
    let cancelled = false;
    aiApi
      .getSettings()
      .then((settings: AISettings) => {
        if (cancelled) return;
        const hasKey =
          settings.anthropic_api_key_set ||
          settings.openai_api_key_set ||
          settings.gemini_api_key_set ||
          settings.openrouter_api_key_set ||
          settings.mistral_api_key_set ||
          settings.groq_api_key_set ||
          settings.deepseek_api_key_set ||
          settings.cohere_api_key_set;
        setAiConfigured(hasKey);
      })
      .catch(() => {
        if (!cancelled) setAiConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, aiConfigured]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      if (trimmed.length > HARD_LIMIT) return;

      if (aiConfigured === false) {
        const userMsg: ChatMessage = {
          id: uid(),
          role: 'user',
          content: trimmed,
          ts: new Date(),
        };
        const onboardingMsg: ChatMessage = {
          id: uid(),
          role: 'assistant',
          content:
            '**AI assistant is not configured yet**\n\nGo to [Settings](/settings) to add your API key.',
          ts: new Date(),
        };
        setMessages((prev) => [...prev, userMsg, onboardingMsg]);
        setValue('');
        return;
      }

      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        content: trimmed,
        ts: new Date(),
      };
      const aiMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: '',
        toolCalls: [],
        ts: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setValue('');
      setIsStreaming(true);

      const aiMsgId = aiMsg.id;
      const token = useAuthStore.getState().accessToken;
      const controller = new AbortController();
      abortRef.current = controller;

      (async () => {
        try {
          const response = await fetch('/api/v1/erp_chat/stream/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              message: trimmed,
              session_id: activeSessionId,
              project_id: activeProjectId,
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => 'Unknown error');
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? { ...m, content: `Error: ${response.status} - ${errText}` }
                  : m,
              ),
            );
            if (!useFloatingChatStore.getState().isOpen) bumpUnread();
            setIsStreaming(false);
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            setIsStreaming(false);
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';
          let currentEvent = '';

          while (true) {
            const { done, value: chunk } = await reader.read();
            if (done) break;

            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const rawLine of lines) {
              const line = rawLine.replace(/\r$/, '');
              if (line.trim() === '') {
                currentEvent = '';
                continue;
              }
              if (line.startsWith('event:')) {
                currentEvent = line.slice(6).trim();
                continue;
              }
              if (!line.startsWith('data:')) continue;

              const jsonStr = line.slice(5).trim();
              if (!jsonStr || jsonStr === '[DONE]') continue;

              let payload: Record<string, unknown>;
              try {
                payload = JSON.parse(jsonStr) as Record<string, unknown>;
              } catch {
                continue;
              }

              switch (currentEvent) {
                case 'session_id': {
                  const sid = payload.session_id as string | undefined;
                  if (sid) setActiveSession(sid);
                  break;
                }
                case 'text': {
                  const content = payload.content as string | undefined;
                  if (content) {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === aiMsgId ? { ...m, content: m.content + content } : m,
                      ),
                    );
                  }
                  break;
                }
                case 'tool_start': {
                  const toolName = (payload.tool as string | undefined) ?? 'unknown';
                  const toolCall: ToolCallInfo = {
                    id: uid(),
                    name: toolName,
                    status: 'running',
                    input: payload.args as Record<string, unknown> | undefined,
                    startedAt: Date.now(),
                  };
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === aiMsgId
                        ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolCall] }
                        : m,
                    ),
                  );
                  break;
                }
                case 'tool_result': {
                  const result = payload.result as ToolCallInfo['result'] | undefined;
                  setMessages((prev) =>
                    prev.map((m) => {
                      if (m.id !== aiMsgId) return m;
                      let matched = false;
                      const toolCalls = (m.toolCalls ?? [])
                        .slice()
                        .reverse()
                        .map((tc) => {
                          if (!matched && tc.status === 'running') {
                            matched = true;
                            return {
                              ...tc,
                              status: 'done' as const,
                              result,
                              durationMs: Date.now() - tc.startedAt,
                            };
                          }
                          return tc;
                        })
                        .reverse();
                      return { ...m, toolCalls };
                    }),
                  );
                  break;
                }
                case 'error': {
                  const errMsg = (payload.message as string | undefined) ?? 'Unknown error';
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === aiMsgId
                        ? {
                            ...m,
                            content: m.content + `\n\n**Error:** ${errMsg}`,
                            toolCalls: (m.toolCalls ?? []).map((tc) =>
                              tc.status === 'running'
                                ? {
                                    ...tc,
                                    status: 'error' as const,
                                    durationMs: Date.now() - tc.startedAt,
                                  }
                                : tc,
                            ),
                          }
                        : m,
                    ),
                  );
                  break;
                }
                case 'done': {
                  break;
                }
              }
            }
          }
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            // user aborted — silent
          } else {
            const errorMsg = err instanceof Error ? err.message : 'Connection failed';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId ? { ...m, content: m.content || `Error: ${errorMsg}` } : m,
              ),
            );
          }
        } finally {
          setIsStreaming(false);
          abortRef.current = null;
          if (!useFloatingChatStore.getState().isOpen) bumpUnread();
        }
      })();
    },
    [isStreaming, activeSessionId, activeProjectId, aiConfigured, bumpUnread, setActiveSession],
  );

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(value);
      }
    },
    [value, sendMessage],
  );

  const newSession = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setIsStreaming(false);
    setActiveSession(null);
    setTitle(t('chat.panel.title_default', { defaultValue: 'AI assistant' }));
  }, [setActiveSession, t]);

  const pickSession = useCallback(
    (id: string) => {
      // We don't pre-load past messages here (keeps the widget light) — the
      // backend resumes context server-side via session_id. The user will see
      // their next reply in the context of that session.
      if (abortRef.current) abortRef.current.abort();
      setMessages([]);
      setIsStreaming(false);
      setActiveSession(id);
    },
    [setActiveSession],
  );

  const charCount = value.length;
  const overSoft = charCount > SOFT_LIMIT;
  const overHard = charCount > HARD_LIMIT;
  const canSend = value.trim().length > 0 && !isStreaming && !overHard;

  const widthClass = isMobile ? 'w-full' : 'w-[400px]';
  const heightClass = isMobile ? 'h-full' : 'h-full max-h-screen';

  const panelTitle = useMemo(() => title, [title]);

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile backdrop — desktop has no backdrop so the user can still see /
          interact with the page next to the chat. */}
      {isMobile && (
        <div
          aria-hidden
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={close}
        />
      )}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal={isMobile ? 'true' : 'false'}
        aria-label={panelTitle}
        data-testid="floating-chat-panel"
        data-chat-theme={resolvedTheme}
        tabIndex={-1}
        className={[
          'fixed z-50',
          'top-0 right-0',
          widthClass,
          heightClass,
          'flex flex-col',
          'shadow-2xl border-l border-border-light',
          'animate-slide-in-right',
        ].join(' ')}
        style={{
          background: 'var(--chat-bg)',
          color: 'var(--chat-text-primary)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderBottom: '1px solid var(--chat-border)',
            background: 'var(--chat-surface-1)',
            position: 'relative',
          }}
        >
          <input
            value={panelTitle}
            onChange={(e) => setTitle(e.target.value)}
            aria-label={t('chat.panel.title_edit', { defaultValue: 'Conversation title' })}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--chat-text-primary)',
              padding: 0,
            }}
          />
          <button
            type="button"
            onClick={() => setSessionsOpen((v) => !v)}
            aria-label={t('chat.panel.sessions_title', { defaultValue: 'Recent sessions' })}
            title={t('chat.panel.sessions_title', { defaultValue: 'Recent sessions' })}
            style={{
              padding: 6,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--chat-text-secondary)',
              borderRadius: 4,
            }}
            data-testid="floating-chat-sessions-toggle"
          >
            <History size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              navigate('/chat');
            }}
            aria-label={t('chat.panel.open_full', { defaultValue: 'Open full page' })}
            title={t('chat.panel.open_full', { defaultValue: 'Open full page' })}
            style={{
              padding: 6,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--chat-text-secondary)',
              borderRadius: 4,
            }}
            data-testid="floating-chat-open-full"
          >
            <ExternalLink size={15} />
          </button>
          <button
            type="button"
            onClick={close}
            aria-label={t('common.close', { defaultValue: 'Close' })}
            style={{
              padding: 6,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--chat-text-secondary)',
              borderRadius: 4,
            }}
            data-testid="floating-chat-close"
          >
            <X size={16} />
          </button>
          <SessionsMenu
            open={sessionsOpen}
            onClose={() => setSessionsOpen(false)}
            onPick={pickSession}
            onNew={newSession}
          />
        </div>

        {/* Body */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: messages.length === 0 ? 0 : '12px 12px 4px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {messages.length === 0 ? (
            <EmptyState onPick={sendMessage} aiConfigured={aiConfigured} />
          ) : (
            <>
              {messages.map((msg) => (
                <MessageRow key={msg.id} msg={msg} />
              ))}
              {isStreaming && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: 'var(--chat-text-tertiary)',
                    padding: '4px 4px 8px',
                  }}
                >
                  <span className="floating-chat-dots" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                  {t('chat.panel.streaming', { defaultValue: 'Thinking...' })}
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div
          style={{
            borderTop: '1px solid var(--chat-border-subtle)',
            padding: '10px 12px 12px',
            background: 'var(--chat-surface-1)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            data-testid="floating-chat-input"
            placeholder={t('chat.panel.input_placeholder', {
              defaultValue: 'Ask anything about your projects, BOQs, costs, clashes...',
            })}
            rows={1}
            style={{
              width: '100%',
              resize: 'none',
              padding: '8px 10px',
              fontSize: 13,
              fontFamily: 'var(--chat-font-body)',
              color: 'var(--chat-text-primary)',
              background: 'var(--chat-surface-2)',
              border: `1px solid ${
                overHard
                  ? 'var(--chat-tool-error, #ef4444)'
                  : overSoft
                  ? '#f59e0b'
                  : 'var(--chat-border)'
              }`,
              borderRadius: 'var(--chat-radius)',
              outline: 'none',
              lineHeight: 1.5,
              maxHeight: 160,
              overflow: 'auto',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 6,
              fontSize: 11,
              color: 'var(--chat-text-tertiary)',
              fontFamily: 'var(--chat-font-mono)',
            }}
          >
            <span>
              {t('chat.kbd_hint', { defaultValue: 'Enter to send · Shift+Enter for newline' })}
            </span>
            <span
              style={{
                color: overHard
                  ? 'var(--chat-tool-error, #ef4444)'
                  : overSoft
                  ? '#f59e0b'
                  : 'var(--chat-text-tertiary)',
              }}
            >
              {overHard
                ? t('chat.panel.token_over', { defaultValue: 'Too long — please shorten' })
                : overSoft
                ? t('chat.panel.token_warn', { defaultValue: 'Long message' })
                : `${charCount}/${HARD_LIMIT}`}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              onClick={() => sendMessage(value)}
              disabled={!canSend}
              data-testid="floating-chat-send"
              aria-label={t('chat.panel.send', { defaultValue: 'Send' })}
              style={{
                padding: '6px 16px',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'var(--chat-font-body)',
                color: canSend ? '#ffffff' : 'var(--chat-text-tertiary)',
                background: canSend ? 'var(--chat-accent)' : 'var(--chat-surface-3)',
                border: 'none',
                borderRadius: 'var(--chat-radius)',
                cursor: canSend ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s',
              }}
            >
              {t('chat.panel.send', { defaultValue: 'Send' })}
            </button>
          </div>
        </div>

        {/* Local styles — kept inline so the component is fully self-contained
            and doesn't need a CSS import that vite has to look up. */}
        <style>{`
          @keyframes floatingChatDot {
            0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
            40%           { opacity: 1;   transform: scale(1); }
          }
          .floating-chat-dots {
            display: inline-flex;
            gap: 3px;
            align-items: center;
          }
          .floating-chat-dots > span {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: var(--chat-accent);
            animation: floatingChatDot 1.2s infinite ease-in-out both;
          }
          .floating-chat-dots > span:nth-child(2) { animation-delay: 0.15s; }
          .floating-chat-dots > span:nth-child(3) { animation-delay: 0.3s; }
          @keyframes slide-in-right {
            from { transform: translateX(100%); opacity: 0.5; }
            to   { transform: translateX(0);   opacity: 1;   }
          }
          .animate-slide-in-right {
            animation: slide-in-right 0.22s cubic-bezier(0.16, 1, 0.3, 1);
          }
        `}</style>
      </div>
    </>
  );
}

// ── Individual message row ─────────────────────────────────────────────────
function MessageRow({ msg }: { msg: ChatMessage }) {
  const html = useMemo(() => (msg.content ? renderMarkdown(msg.content) : ''), [msg.content]);

  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            background: 'var(--chat-surface-3)',
            color: 'var(--chat-text-primary)',
            padding: '8px 12px',
            borderRadius: '14px 14px 4px 14px',
            maxWidth: '85%',
            fontSize: 13,
            lineHeight: 1.55,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.role === 'system') {
    return (
      <div
        style={{
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--chat-text-tertiary)',
          fontFamily: 'var(--chat-font-mono)',
          padding: '2px 0',
        }}
      >
        {msg.content}
      </div>
    );
  }

  return (
    <div
      style={{
        borderLeft: '2px solid var(--chat-accent)',
        paddingLeft: 10,
        maxWidth: '92%',
      }}
    >
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          {msg.toolCalls.map((tc) => (
            <ToolCallEntry key={tc.id} tool={tc} />
          ))}
        </div>
      )}
      {html && (
        <div
          style={{
            color: 'var(--chat-text-primary)',
            fontSize: 13,
            lineHeight: 1.6,
            wordBreak: 'break-word',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

// Helper re-export so the AppLayout import is a single line.
export default FloatingChatPanel;
