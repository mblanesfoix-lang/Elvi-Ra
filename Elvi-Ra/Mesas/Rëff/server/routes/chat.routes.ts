import { Router } from 'express';
import { logUsage, getAgentEnabled, getAllAgentsEnabled } from '../db.js';
import { getAgent, AGENTS } from '../agents.js';
import { streamLLM } from '../llm.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function isChatMessage(value: unknown): value is ChatMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    ((value as any).role === 'user' || (value as any).role === 'assistant') &&
    typeof (value as any).content === 'string'
  );
}

const router = Router();

const MAX_TOKENS = 4096;

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
  if (!agent) return res.status(404).json({ error: 'Agente no encontrado' });

  if (!getAgentEnabled(agentId)) return res.status(503).json({ error: 'Agente temporalmente desactivado' });

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

  let closed = false;
  req.on('close', () => { closed = true; });

  await streamLLM(agent.systemPrompt, cleanMessages, MAX_TOKENS, {
    onChunk: (text) => { if (!closed) send('chunk', { text }); },
    onDone:  (usage) => {
      logUsage(agentId, usage.inputTokens, usage.outputTokens);
      if (!closed) { send('done', {}); res.end(); }
    },
    onError: (err) => {
      console.error('[chat] LLM error:', err.message);
      if (!closed) { send('error', { message: err.message }); res.end(); }
    },
    isClosed: () => closed,
  });
});

export default router;
