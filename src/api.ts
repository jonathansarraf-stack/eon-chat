const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3777';

export interface SessionData {
  id: string;
  title: string;
  created: number;
  updated: number;
  messageCount: number;
  snippet: string | null;
}

export interface MessageData {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  durationMs?: number;
  costUsd?: number;
  isError?: boolean;
}

export interface ActivityData {
  tool: string;
  label: string;
  icon: string;
  done: boolean;
}

// ── Sessions ────────────────────────────────────────────────────────────────

export async function fetchSessions(): Promise<SessionData[]> {
  const res = await fetch(`${API_BASE}/api/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function createSession(title?: string): Promise<SessionData> {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error('Failed to create session');
  return res.json();
}

export async function renameSession(id: string, title: string): Promise<void> {
  await fetch(`${API_BASE}/api/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

export async function deleteSession(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/sessions/${id}`, { method: 'DELETE' });
}

// ── Messages ────────────────────────────────────────────────────────────────

export async function fetchMessages(sessionId: string): Promise<MessageData[]> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

// ── Chat (SSE streaming) ────────────────────────────────────────────────────

export interface ChatCallbacks {
  onTextDelta: (text: string) => void;
  onActivity: (activity: ActivityData) => void;
  onDone: (message: MessageData) => void;
  onTitleUpdate?: (title: string) => void;
  onError: (error: string) => void;
}

export function sendMessage(
  sessionId: string,
  text: string,
  callbacks: ChatCallbacks,
): AbortController {
  const controller = new AbortController();

  const url = `${API_BASE}/api/sessions/${sessionId}/chat`;

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        callbacks.onError(`HTTP ${res.status}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError('No response body');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              switch (currentEvent) {
                case 'text_delta':
                  callbacks.onTextDelta(parsed.text);
                  break;
                case 'activity':
                  callbacks.onActivity(parsed);
                  break;
                case 'done':
                  callbacks.onDone(parsed);
                  break;
                case 'title_update':
                  callbacks.onTitleUpdate?.(parsed.title);
                  break;
                case 'error':
                  callbacks.onError(parsed.message);
                  break;
              }
            } catch (e) {
              // ignore parse errors
            }
            currentEvent = '';
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        callbacks.onError(err.message);
      }
    });

  return controller;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface AuthStatus {
  loggedIn: boolean;
  email?: string;
  orgName?: string;
  subscriptionType?: string;
  message?: string;
}

export async function checkAuth(): Promise<AuthStatus> {
  const res = await fetch(`${API_BASE}/api/auth/status`);
  if (!res.ok) throw new Error('Failed to check auth');
  return res.json();
}

// ── Health ───────────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
