import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { logUsage, getAgentEnabled, getAllAgentsEnabled } from '../db.js';
import { getAgent, AGENTS } from '../agents.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function isChatMessage(value: unknown): value is ChatMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as any).role &&
    (value as any).content &&
    ((value as any).role === 'user' || (value as any).role === 'assistant') &&
    typeof (value as any).content === 'string'
  );
}

const router = Router();

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();

function looksLikePlaceholderApiKey(apiKey: string): boolean {
  const normalized = apiKey.toLowerCase();
  return (
    !apiKey ||
    apiKey === 'sk-ant-...' ||
    normalized.includes('tu_clave') ||
    normalized.includes('your_key') ||
    normalized.includes('placeholder')
  );
}

function getAnthropicErrorMessage(err: any): string {
  const status = err?.status;
  const rawMessage = String(err?.message || '');
  const errorType = err?.error?.type || err?.type;

  if (
    status === 401 ||
    errorType === 'authentication_error' ||
    rawMessage.toLowerCase().includes('invalid x-api-key')
  ) {
    return 'Clave de Anthropic invalida. Actualiza ANTHROPIC_API_KEY en el archivo .env del servidor y reinicia la aplicacion.';
  }

  return rawMessage || 'Error interno del agente';
}

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

router.get('/agents', (_req, res) => {
  const enabledMap = getAllAgentsEnabled();
  const list = AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    category: a.category,
    color: a.color,
    welcomeMessage: a.welcomeMessage,
    enabled: enabledMap[a.id] !== false,
  }));
  res.json({ agents: list });
});

router.post('/:agentId', async (req, res) => {
  const agentId = req.params.agentId as string;

  const agent = getAgent(agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agente no encontrado' });
  }

  if (!getAgentEnabled(agentId)) {
    return res.status(503).json({ error: 'Agente temporalmente desactivado' });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de mensajes' });
  }

  const cleanMessages = messages
    .filter(isChatMessage)
    .map((m) => ({ role: m.role, content: m.content }));

  if (cleanMessages.length === 0 || cleanMessages[cleanMessages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'El último mensaje debe ser del usuario' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (looksLikePlaceholderApiKey(ANTHROPIC_API_KEY)) {
    send('error', {
      message: 'Falta configurar una clave real de Anthropic. Revisa ANTHROPIC_API_KEY en .env y reinicia la aplicacion.',
    });
    return res.end();
  }

  let closed = false;
  req.on('close', () => {
    closed = true;
  });

  try {
    const stream = await anthropic.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: agent.systemPrompt,
      messages: cleanMessages,
    });

    for await (const event of stream) {
      if (closed) break;
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta' &&
        event.delta.text
      ) {
        send('chunk', { text: event.delta.text });
      }
    }

    try {
      const final = await stream.finalMessage();
      logUsage(agentId, final.usage.input_tokens, final.usage.output_tokens);
    } catch {
      // usage logging is best-effort
    }

    if (!closed) {
      send('done', {});
      res.end();
    }
  } catch (err: any) {
    console.error('[chat] Anthropic error:', err?.message || err);
    if (!closed) {
      send('error', { message: getAnthropicErrorMessage(err) });
      res.end();
    }
  }
});

export default router;
