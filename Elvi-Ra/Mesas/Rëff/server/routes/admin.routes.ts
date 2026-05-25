import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../auth.js';
import { getAllUsersUsage, toggleAgent, getAllAgentsEnabled } from '../db.js';

const router = Router();

const ADMIN_USERNAMES = new Set(['marc', 'nour']);

function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !ADMIN_USERNAMES.has(req.user.username)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
}

router.get('/users-usage', authMiddleware, adminMiddleware, (_req: Request, res: Response) => {
  const data = getAllUsersUsage();
  return res.json({ users: data });
});

router.get('/agents-status', authMiddleware, adminMiddleware, (_req: Request, res: Response) => {
  const data = getAllAgentsEnabled();
  return res.json({ agents: data });
});

router.post('/agents/:agentId/toggle', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  const agentId = String(req.params.agentId);
  try {
    const enabled = toggleAgent(agentId);
    return res.json({ agentId, enabled });
  } catch (e: unknown) {
    return res.status(404).json({ error: (e as Error).message });
  }
});

export default router;
