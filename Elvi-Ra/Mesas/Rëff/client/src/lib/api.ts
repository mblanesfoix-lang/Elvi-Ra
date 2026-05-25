const API_URL = import.meta.env.VITE_API_URL || '';

export interface User {
  id: number;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  agents: string[];
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  color: string;
  welcomeMessage: string;
  enabled: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any).error || `Error HTTP ${res.status}`);
  }
  return data as T;
}

export async function fetchAgents() {
  return request<{ agents: Agent[] }>('/api/chat/agents');
}

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}

export async function streamChat(
  agentId: string,
  messages: ChatMessage[],
  signal: AbortSignal,
  cb: StreamCallbacks
) {
  const res = await fetch(`${API_URL}/api/chat/${agentId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!res.ok || !res.body) {
    let msg = `Error HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {
      /* noop */
    }
    cb.onError(msg);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      let event = 'message';
      let data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;

      try {
        const parsed = JSON.parse(data);
        if (event === 'chunk') cb.onChunk(parsed.text || '');
        else if (event === 'done') cb.onDone();
        else if (event === 'error') cb.onError(parsed.message || 'Error');
      } catch {
        /* fragmento incompleto */
      }
    }
  }
}
