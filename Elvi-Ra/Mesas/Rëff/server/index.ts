import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { rateLimit } from 'express-rate-limit';
import { seedDatabase, getUserByUsername } from './db.js';
import { signToken } from './auth.js';
import chatRoutes from './routes/chat.routes.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3001);
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[Rëff][WARN] ANTHROPIC_API_KEY no está definida en .env — el chat fallará.');
}

seedDatabase();

const app = express();

app.use(cors({
  origin: NODE_ENV === 'production' ? (process.env.CORS_ORIGIN || false) : true,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'anon',
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en un minuto.' },
});

app.use('/api', apiLimiter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'reff', env: NODE_ENV });
});

app.get('/api/guest-token', (_req, res) => {
  const userRow = getUserByUsername('marc');
  if (!userRow) return res.status(500).json({ error: 'usuario marc no encontrado en DB' });
  const token = signToken({ userId: userRow.id });
  res.json({ token });
});

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);

if (NODE_ENV === 'production') {
  const clientDir = path.resolve(__dirname, '../../dist/client');
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[Rëff] Servidor escuchando en http://localhost:${PORT}`);
  console.log(`[Rëff] Entorno: ${NODE_ENV}`);
});
