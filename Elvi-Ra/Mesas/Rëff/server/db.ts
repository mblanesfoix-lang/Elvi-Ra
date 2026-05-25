import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { AGENTS } from './agents.js';

const DB_PATH = process.env.DB_PATH || './data/reff.db';

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_agents (
    user_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    PRIMARY KEY (user_id, agent_id)
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    color TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    agent_id TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export function seedDatabase() {
  const upsertAgent = db.prepare(`
    INSERT INTO agents (id, name, description, category, color, system_prompt)
    VALUES (@id, @name, @description, @category, @color, @system_prompt)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      description=excluded.description,
      category=excluded.category,
      color=excluded.color,
      system_prompt=excluded.system_prompt
  `);

  const tx = db.transaction(() => {
    for (const a of AGENTS) {
      upsertAgent.run({
        id: a.id,
        name: a.name,
        description: a.description,
        category: a.category,
        color: a.color,
        system_prompt: a.systemPrompt,
      });
    }
  });
  tx();

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('marc');
  if (!existing) {
    const marcHash = bcrypt.hashSync('Marc2005', 10);
    const nourHash = bcrypt.hashSync('Nour 2026', 10);
    const marcId = crypto.randomUUID();
    const nourId = crypto.randomUUID();
    db.prepare('INSERT OR IGNORE INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)').run(marcId, 'marc', 'Marc Blanes', marcHash);
    db.prepare('INSERT OR IGNORE INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)').run(nourId, 'nour', 'Nour', nourHash);
  }
}

export function getAgentEnabled(agentId: string): boolean {
  const row = db.prepare('SELECT enabled FROM agents WHERE id = ?').get(agentId) as { enabled: number } | undefined;
  return row ? row.enabled === 1 : true;
}

export function getAllAgentsEnabled(): Record<string, boolean> {
  const rows = db.prepare('SELECT id, enabled FROM agents').all() as { id: string; enabled: number }[];
  return Object.fromEntries(rows.map(r => [r.id, r.enabled === 1]));
}

export function logUsage(agentId: string, inputTokens: number, outputTokens: number): void {
  db.prepare(
    'INSERT INTO usage_log (agent_id, input_tokens, output_tokens) VALUES (?, ?, ?)'
  ).run(agentId, inputTokens, outputTokens);
}

/* ---------- user functions ---------- */

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  avatar_url: string | null;
}

export function getUserByUsername(username: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow) || null;
}

export function getUserById(id: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow) || null;
}

export function getUserAgents(userId: string): string[] {
  const rows = db.prepare('SELECT agent_id FROM user_agents WHERE user_id = ?').all(userId) as { agent_id: string }[];
  return rows.map(r => r.agent_id);
}

export function updateUserPassword(userId: string, newHash: string): void {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);
}

export function updateUserProfile(userId: string, displayName: string, avatarUrl: string | null): void {
  db.prepare('UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?').run(displayName, avatarUrl, userId);
}

export function getUserUsage(userId: string) {
  return db.prepare(`
    SELECT agent_id, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, COUNT(*) as calls
    FROM usage_log WHERE user_id = ? GROUP BY agent_id
  `).all(userId);
}

export function getAllUsersUsage() {
  const users = db.prepare('SELECT id, username, display_name FROM users').all() as { id: string; username: string; display_name: string }[];
  return users.map(u => {
    const usage = db.prepare(`
      SELECT SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, COUNT(*) as calls
      FROM usage_log WHERE user_id = ?
    `).get(u.id) as { input_tokens: number; output_tokens: number; calls: number } || { input_tokens: 0, output_tokens: 0, calls: 0 };
    return { userId: u.id, username: u.username, displayName: u.display_name, ...usage };
  });
}

export function toggleAgent(agentId: string): boolean {
  const row = db.prepare('SELECT enabled FROM agents WHERE id = ?').get(agentId) as { enabled: number } | undefined;
  if (!row) throw new Error(`Agente ${agentId} no encontrado`);
  const newVal = row.enabled === 1 ? 0 : 1;
  db.prepare('UPDATE agents SET enabled = ? WHERE id = ?').run(newVal, agentId);
  return newVal === 1;
}
