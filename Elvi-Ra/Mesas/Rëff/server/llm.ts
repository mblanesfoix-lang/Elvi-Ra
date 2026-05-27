/**
 * LLM abstraction layer for Rëff — streaming + single-shot.
 *
 * LLM_PROVIDER = "anthropic" (default) | "ollama"
 * OLLAMA_URL   = http://ollama:11434
 * OLLAMA_MODEL = llama3:70b
 */

import Anthropic from '@anthropic-ai/sdk';

const PROVIDER      = process.env.LLM_PROVIDER  || 'anthropic';
const OLLAMA_URL    = process.env.OLLAMA_URL     || 'http://ollama:11434';
const OLLAMA_MODEL  = process.env.OLLAMA_MODEL   || 'llama3:70b';
const ANTHROPIC_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: (usage: LLMUsage) => void;
  onError: (err: Error) => void;
  isClosed: () => boolean;
}

export function isPlaceholderKey(key: string): boolean {
  const n = key.toLowerCase();
  return !key || key === 'sk-ant-...' || n.includes('tu_clave') || n.includes('your_key') || n.includes('placeholder');
}

/**
 * Streaming LLM call. Fires callbacks as chunks arrive.
 */
export async function streamLLM(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  callbacks: StreamCallbacks,
): Promise<void> {
  if (PROVIDER === 'ollama') {
    return _streamOllama(systemPrompt, messages, maxTokens, callbacks);
  }
  return _streamAnthropic(systemPrompt, messages, maxTokens, callbacks);
}

async function _streamAnthropic(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  { onChunk, onDone, onError, isClosed }: StreamCallbacks,
): Promise<void> {
  if (isPlaceholderKey(ANTHROPIC_KEY)) {
    onError(new Error('Falta configurar una clave real de Anthropic. Revisa ANTHROPIC_API_KEY en .env.'));
    return;
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

  try {
    const stream = await client.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (isClosed()) break;
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta' &&
        event.delta.text
      ) {
        onChunk(event.delta.text);
      }
    }

    const final = await stream.finalMessage();
    onDone({
      inputTokens:  final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
    });
  } catch (err: any) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

async function _streamOllama(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  maxTokens: number,
  { onChunk, onDone, onError, isClosed }: StreamCallbacks,
): Promise<void> {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: true,
        options: { num_predict: maxTokens },
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!r.ok || !r.body) {
      const t = await r.text().catch(() => '');
      throw new Error(`Ollama ${r.status}: ${t.slice(0, 300)}`);
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let inputTokens = 0;
    let outputTokens = 0;

    while (true) {
      if (isClosed()) break;
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.message?.content) onChunk(obj.message.content);
          if (obj.done) {
            inputTokens  = obj.prompt_eval_count || 0;
            outputTokens = obj.eval_count        || 0;
          }
        } catch {
          // partial JSON line — skip
        }
      }
    }

    onDone({ inputTokens, outputTokens });
  } catch (err: any) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
