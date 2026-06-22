import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { getUserById, updateUserPassword, updateUserProfile } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  return res.json({ user: req.user });
});

router.post('/update-profile', authMiddleware, async (req: Request, res: Response) => {
  const { displayName, avatarUrl } = req.body || {};
  if (!displayName || typeof displayName !== 'string' || displayName.trim().length < 1) {
    return res.status(400).json({ error: 'El nombre no puede estar vacío' });
  }
  if (displayName.trim().length > 60) {
    return res.status(400).json({ error: 'El nombre no puede superar 60 caracteres' });
  }
  const avatar = typeof avatarUrl === 'string' && avatarUrl.startsWith('data:image/') ? avatarUrl : null;
  await updateUserProfile(req.user.id, displayName.trim(), avatar);
  const updated = {
    id: req.user.id,
    username: req.user.username,
    displayName: displayName.trim(),
    avatarUrl: avatar,
  };
  return res.json({ user: updated });
});

router.post('/change-password', authMiddleware, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Contraseña actual y nueva son obligatorias' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }
  const userRow = await getUserById(req.user.id);
  if (!userRow) return res.status(404).json({ error: 'Usuario no encontrado' });
  const ok = await bcrypt.compare(String(currentPassword), userRow.password_hash);
  if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  const newHash = await bcrypt.hash(String(newPassword), 10);
  await updateUserPassword(req.user.id, newHash);
  return res.json({ ok: true });
});

export default router;
