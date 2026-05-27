import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callLLM, PRICE_INPUT_PER_M, PRICE_OUTPUT_PER_M } from './llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FRONT = path.join(ROOT, 'frontend');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const HISTORY_FILE = path.join(DATA_DIR, 'search_history.json');
const ELVIRA_FILE = path.join(DATA_DIR, 'elvira.json');
const SESSIONS = new Map(); // token -> { user, role, exp }

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE))  fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(ELVIRA_FILE)) fs.writeFileSync(ELVIRA_FILE, JSON.stringify({
  systems: {
    sentinel: { status: 'disconnected', endpoint: '', lastPing: null, latencyMs: null },
    herzog:   { status: 'disconnected', endpoint: '', lastPing: null, latencyMs: null },
    tcontroler: { status: 'local', tokensUsed: 0, tokensCap: 0 },
    dataBase: { status: 'ok', backend: 'json' },
  },
  ophs: {
    weights: { W: 0.18, I: 0.10, S: 0.10, M: 0.12, E: 0.10, R: 0.10, B: 0.12, G: 0.13, U2: 0.05 },
    threshold: { estrategico: 70, operativo: 45 },
    dictamenes: [],
  },
  bridges: {
    sentinel: { events: [] },
    herzog:   { audits: [] },
  },
  updatedAt: new Date().toISOString(),
}, null, 2));

/* ---------- .env loader (no dep) ---------- */
(function loadEnv() {
  const envFile = path.join(__dirname, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, v] = m;
    if (!(k in process.env)) process.env[k] = v.replace(/^["']|["']$/g, '');
  }
})();

// LLM provider configured in llm.js via LLM_PROVIDER env var

// Credentials per spec (Creedenciales.txt)
const USERS = {
  'Marc Blanes': { password: 'Marc2005', role: 'admin' },
  'Nour':        { password: 'Nour 2026', role: 'admin' },
};

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

/* ---------- storage ---------- */
function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return {}; }
}
function writeDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function ensureUser(db, user) {
  if (!db[user]) db[user] = { sheets: [] };
  if (!db[user].sheets.length) {
    db[user].sheets.push({
      id: crypto.randomUUID(),
      name: 'Hoja principal',
      createdAt: new Date().toISOString(),
      companies: [],
    });
  }
  return db[user];
}
function findSheet(userBlob, sheetId) {
  return userBlob.sheets.find(s => s.id === sheetId);
}

function normalizeTareas(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map(t => {
      if (typeof t === 'string') {
        const text = t.trim();
        if (!text) return null;
        return { id: crypto.randomUUID(), text, done: false, createdAt: new Date().toISOString() };
      }
      if (t && typeof t === 'object') {
        const text = String(t.text || '').trim();
        if (!text) return null;
        return {
          id: typeof t.id === 'string' && t.id ? t.id : crypto.randomUUID(),
          text,
          done: !!t.done,
          createdAt: t.createdAt || new Date().toISOString(),
        };
      }
      return null;
    })
    .filter(Boolean);
}

/* ---------- auth ---------- */
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const s = token && SESSIONS.get(token);
  if (!s || s.exp < Date.now()) return res.status(401).json({ error: 'unauthorized' });
  req.user = s.user;
  req.role = s.role;
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = USERS[username];
  if (!u || u.password !== password) return res.status(401).json({ error: 'Credenciales inválidas' });
  const token = crypto.randomBytes(24).toString('hex');
  SESSIONS.set(token, { user: username, role: u.role, exp: Date.now() + 1000 * 60 * 60 * 8 });
  res.json({ token, user: username, role: u.role });
});
app.post('/api/logout', auth, (req, res) => {
  const h = req.headers.authorization || '';
  SESSIONS.delete(h.slice(7));
  res.json({ ok: true });
});
app.get('/api/me', auth, (req, res) => res.json({ user: req.user, role: req.role }));

/* ---------- sheets ---------- */
app.get('/api/sheets', auth, (req, res) => {
  const db = readDB();
  const u = ensureUser(db, req.user);
  writeDB(db);
  res.json(u.sheets.map(s => ({ id: s.id, name: s.name, count: s.companies.length, createdAt: s.createdAt })));
});

app.post('/api/sheets', auth, (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'nombre requerido' });
  const db = readDB();
  const u = ensureUser(db, req.user);
  const s = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), companies: [] };
  u.sheets.push(s);
  writeDB(db);
  res.status(201).json({ id: s.id, name: s.name, count: 0, createdAt: s.createdAt });
});

app.delete('/api/sheets/:sid', auth, (req, res) => {
  const db = readDB();
  const u = ensureUser(db, req.user);
  if (u.sheets.length <= 1) return res.status(400).json({ error: 'no se puede eliminar la única hoja' });
  const idx = u.sheets.findIndex(s => s.id === req.params.sid);
  if (idx < 0) return res.status(404).json({ error: 'hoja no encontrada' });
  const [removed] = u.sheets.splice(idx, 1);
  writeDB(db);
  res.json({ id: removed.id });
});

/* ---------- companies ---------- */
app.get('/api/sheets/:sid/companies', auth, (req, res) => {
  const db = readDB();
  const u = ensureUser(db, req.user);
  const s = findSheet(u, req.params.sid);
  if (!s) return res.status(404).json({ error: 'hoja no encontrada' });
  res.json(s.companies);
});

app.post('/api/sheets/:sid/companies', auth, (req, res) => {
  const db = readDB();
  const u = ensureUser(db, req.user);
  const s = findSheet(u, req.params.sid);
  if (!s) return res.status(404).json({ error: 'hoja no encontrada' });
  const b = req.body || {};
  const c = {
    id: crypto.randomUUID(),
    nodo: String(b.nodo || '').trim(),
    sector: String(b.sector || '').trim(),
    ubicacion: String(b.ubicacion || '').trim(),
    ophs: Number(b.ophs ?? 0),
    bssMwh: Number(b.bssMwh ?? 0),
    cnmc: String(b.cnmc || 'OK').trim(),
    dictamen: String(b.dictamen || '').trim(),
    notas: String(b.notas || '').trim(),
    tipoResiduo: String(b.tipoResiduo || '').trim(),
    volumenResiduoT: b.volumenResiduoT != null && b.volumenResiduoT !== '' ? Number(b.volumenResiduoT) : null,
    plantas: b.plantas != null && b.plantas !== '' ? Number(b.plantas) : null,
    empleados: b.empleados != null && b.empleados !== '' ? Number(b.empleados) : null,
    facturacionM: b.facturacionM != null && b.facturacionM !== '' ? Number(b.facturacionM) : null,
    pagaGestion: String(b.pagaGestion || 'DESCONOCIDO').trim(),
    esg: String(b.esg || '').trim(),
    tareas: normalizeTareas(b.tareas),
    createdAt: new Date().toISOString(),
  };
  if (!c.nodo) return res.status(400).json({ error: 'nodo requerido' });
  s.companies.push(c);
  writeDB(db);
  res.status(201).json(c);
});

app.put('/api/sheets/:sid/companies/:cid', auth, (req, res) => {
  const db = readDB();
  const u = ensureUser(db, req.user);
  const s = findSheet(u, req.params.sid);
  if (!s) return res.status(404).json({ error: 'hoja no encontrada' });
  const c = s.companies.find(x => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'empresa no encontrada' });
  const allowed = ['nodo','sector','ubicacion','ophs','bssMwh','cnmc','dictamen','notas','tareas','tipoResiduo','volumenResiduoT','plantas','empleados','facturacionM','pagaGestion','esg'];
  for (const k of allowed) if (k in req.body) {
    c[k] = k === 'tareas' ? normalizeTareas(req.body[k]) : req.body[k];
  }
  writeDB(db);
  res.json(c);
});

app.delete('/api/sheets/:sid/companies/:cid', auth, (req, res) => {
  const db = readDB();
  const u = ensureUser(db, req.user);
  const s = findSheet(u, req.params.sid);
  if (!s) return res.status(404).json({ error: 'hoja no encontrada' });
  const idx = s.companies.findIndex(x => x.id === req.params.cid);
  if (idx < 0) return res.status(404).json({ error: 'empresa no encontrada' });
  const [removed] = s.companies.splice(idx, 1);
  writeDB(db);
  res.json(removed);
});

/* move company between sheets */
app.post('/api/companies/:cid/move', auth, (req, res) => {
  const { fromSheetId, toSheetId } = req.body || {};
  if (!fromSheetId || !toSheetId) return res.status(400).json({ error: 'fromSheetId/toSheetId requeridos' });
  const db = readDB();
  const u = ensureUser(db, req.user);
  const src = findSheet(u, fromSheetId);
  const dst = findSheet(u, toSheetId);
  if (!src || !dst) return res.status(404).json({ error: 'hoja no encontrada' });
  const idx = src.companies.findIndex(x => x.id === req.params.cid);
  if (idx < 0) return res.status(404).json({ error: 'empresa no encontrada' });
  const [moved] = src.companies.splice(idx, 1);
  dst.companies.push(moved);
  writeDB(db);
  res.json(moved);
});

/* aggregate for Dashboard General across all sheets */
app.get('/api/overview', auth, (req, res) => {
  const db = readDB();
  const u = ensureUser(db, req.user);
  const all = u.sheets.flatMap(s => s.companies.map(c => ({ ...c, sheetId: s.id, sheetName: s.name })));
  const totalBss = all.reduce((a, c) => a + (Number(c.bssMwh) || 0), 0);
  const avgOphs = all.length ? Math.round(all.reduce((a, c) => a + (Number(c.ophs) || 0), 0) / all.length) : 0;
  const riesgo = all.filter(c => c.cnmc !== 'OK').length;
  res.json({
    sheets: u.sheets.length,
    companies: all.length,
    totalBssMwh: Number(totalBss.toFixed(1)),
    avgOphs,
    cnmcRiesgo: riesgo,
    top: [...all].sort((a, b) => (b.ophs || 0) - (a.ophs || 0)).slice(0, 5),
  });
});

/* ---------- search history (per user, 48h) ---------- */
function readHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
  catch { return {}; }
}
function writeHistory(h) { fs.writeFileSync(HISTORY_FILE, JSON.stringify(h, null, 2)); }
function pruneHistory(arr) {
  const cutoff = Date.now() - 48 * 3600 * 1000;
  return arr.filter(x => new Date(x.createdAt).getTime() >= cutoff);
}

app.get('/api/search/history', auth, (req, res) => {
  const h = readHistory();
  const list = pruneHistory(h[req.user] || []);
  h[req.user] = list;
  writeHistory(h);
  res.json(list);
});

app.delete('/api/search/history/:hid', auth, (req, res) => {
  const h = readHistory();
  const list = pruneHistory(h[req.user] || []);
  const idx = list.findIndex(x => x.id === req.params.hid);
  if (idx < 0) return res.status(404).json({ error: 'no encontrada' });
  list.splice(idx, 1);
  h[req.user] = list;
  writeHistory(h);
  res.json({ ok: true });
});

/* ---------- IA search (Claude) ---------- */
const SYSTEM_PROMPT = `Eres el Agente S-NFI (South Navarre Fresh Innovations) integrado en Elvi-Ra. Tu trabajo: detectar Nodos de Integración Potencial (no "leads").

REGLAS DURAS de inclusión:
- Volumen de residuo orgánico anual > 8 toneladas.
- Residuo 100% orgánico (no mezclas con plástico/químico).
- Modelo B2B o B2C compatible con S-NFI BioHybrid.

VARIABLES CRÍTICAS por empresa:
- Variable B (BSS & Resilience): estima MWh de Battery Storage para 48h autonomía post-apagón. Penaliza si la empresa no tiene espacio/capacidad para BSS (vulnerabilidad CNMC).
- Variable G (Gobernanza Herzog): si la empresa está hipotecada con eléctrica tradicional o no permite modelos OEM → TÓXICO, bloquear.
- Variable U-2 (Reto Científico): si el residuo es complejo y requiere I+D S-NFI U-2, sube valor estratégico.

PENALIZACIÓN FUERTE / DESCARTE si:
- Dependencia de Biogás/Anaerobia (competencia/lastre).
- Opacidad CNMC o sanciones previas.
- Estructura jerárquica incompatible con Gobernanza Externa OPHS.

Para cada empresa devuelve PUNTUACIÓN OPHS (0-100) basada en compatibilidad global.

DATOS DE FICHA EXIGIDOS por empresa. REGLA DURA: TODOS los campos numéricos (volumenResiduoT, plantas, empleados, facturacionM) deben ir RELLENOS con un número estimado. Prohibido devolver null o 0 sin justificar. Si no hay dato exacto, ESTIMA con razonamiento sectorial usando los siguientes proxies:

PROTOCOLO DE ESTIMACIÓN (obligatorio aplicar antes de devolver):
1. Buscar dato público (web corporativa, eInforma, registro mercantil ES, SABI, Crunchbase, LinkedIn, Bloomberg, memoria anual, informe sostenibilidad GRI/ESG).
2. Si no hay público: estimar por benchmarks sectoriales:
   • Facturación → cruzar con tamaño plantilla (ratio sectorial: agroalimentario ~150-250 k€/empleado, vinícola ~120-180 k€/empleado, cárnico ~200-300 k€/empleado).
   • Empleados → buscar en LinkedIn "company size" o estimar desde facturación.
   • Plantas → web corporativa "nuestras instalaciones" / "centros productivos". Mínimo 1.
   • Volumen residuo → derivar de facturación + sector usando intensidad de residuo orgánico típica (vinícola: 0.3-0.5 T residuo / 1 T uva; cárnico: 0.4-0.6 T residuo / 1 T producto; lácteo: 0.9 L suero / 1 L leche).
3. Devolver el número estimado. Marcar la incertidumbre en "fuentes" (campo opcional).
4. Solo usar "DESCONOCIDO" en campos string (tipoResiduo, esg, pagaGestion). NUNCA en numéricos.

CAMPOS:
- tipoResiduo: categoría dominante del residuo orgánico (string, obligatorio rellenar).
- volumenResiduoT: toneladas/año totales de residuo orgánico (número, > 8, obligatorio).
- plantas: número de centros productivos (entero, mínimo 1, obligatorio).
- empleados: plantilla total estimada (entero, obligatorio).
- facturacionM: facturación anual estimada en M€ (número con 1 decimal, obligatorio).
- pagaGestion: SI si paga gestor externo de residuos hoy / NO si autogestiona / DESCONOCIDO solo si no hay señal alguna. Heurística: empresas >100 empleados sin planta propia de tratamiento → SI por defecto.
- esg: rating público (MSCI, Sustainalytics, S&P Global) o nota cualitativa ('sin reporte público', 'memoria GRI sin rating', 'greenwashing detectado', 'B Corp', 'ISO 14001').

Para candidatos ESTRATÉGICOS (OPHS >= 70) genera dictamen segmentado: IIA (transparencia datos públicos), Factory (m² planta vs unidad BioHybrid), Finance (ROI in-situ vs transporte), Pactvm Viridi/CIBE (sello circular).

SALIDA: SOLO JSON válido, sin markdown, sin texto extra. Schema:
{
  "results": [
    {
      "nodo": "string (nombre empresa)",
      "sector": "string",
      "ubicacion": "Ciudad, País",
      "ophs": 0-100,
      "bssMwh": number (MWh estimados 48h),
      "cnmc": "OK" | "RIESGO" | "SANCION",
      "variableB": "string (resumen BSS/resilience)",
      "variableG": "string (gobernanza Herzog)",
      "variableU2": "string (reto U-2)",
      "porQue": "string (por qué el sistema la detecta como buena empresa)",
      "tipoResiduo": "string (categoría residuo orgánico: vinaza, orujo, suero lácteo, restos cárnicos, FORM, hortofrutícola, etc.)",
      "volumenResiduoT": number (toneladas/año estimadas, residuo orgánico),
      "residuoAnualT": number (alias retrocompatible de volumenResiduoT),
      "plantas": number (número de plantas/centros productivos),
      "empleados": number (plantilla total estimada),
      "facturacionM": number (facturación anual estimada en millones de euros),
      "pagaGestion": "SI" | "NO" | "DESCONOCIDO" (si actualmente paga a un gestor externo por el residuo),
      "esg": "string (rating ESG público o nota corta: ej. 'A', 'B+', 'sin reporte', 'greenwashing detectado')",
      "fuentes": ["string (fuente o proxy usado para estimar, ej. 'eInforma 2024', 'LinkedIn size band', 'estimación sectorial vinícola')"],
      "modelo": "B2B" | "B2C" | "B2B/B2C",
      "dictamen": {
        "iia": "string",
        "factory": "string",
        "finance": "string",
        "pactvm": "string"
      },
      "descartar": boolean,
      "razonDescarte": "string o vacío"
    }
  ],
  "resumen": "string corto del barrido"
}

EJEMPLO de ficha completa correcta (referencia de estilo y profundidad de relleno):
{
  "nodo": "Bodegas García Carrión",
  "sector": "Vinícola",
  "ubicacion": "Jumilla, España",
  "ophs": 78,
  "bssMwh": 4.5,
  "cnmc": "OK",
  "tipoResiduo": "Orujo + lías + raspón (vinaza)",
  "volumenResiduoT": 95000,
  "plantas": 7,
  "empleados": 1100,
  "facturacionM": 825,
  "pagaGestion": "SI",
  "esg": "Memoria sostenibilidad publicada, sin rating MSCI",
  "fuentes": ["web corporativa centros productivos", "eInforma 2023", "estimación sectorial vinícola 0.4 T residuo/T uva"],
  "modelo": "B2B/B2C",
  "porQue": "Mayor bodega europea, alto volumen residuo concentrado, 7 plantas con espacio físico para BSS, sin dependencia biogás",
  "variableB": "Espacio amplio en planta Jumilla para BSS 4-5 MWh; resiliencia 48h viable",
  "variableG": "Estructura familiar, sin PPA largo plazo con eléctrica → gobernanza OEM compatible",
  "variableU2": "Orujo estándar, no requiere I+D U-2 salvo subproducto enológico específico",
  "dictamen": { "iia": "Memoria GRI publica, datos volúmenes plausibles", "factory": "Jumilla 15.000 m² → unidad BioHybrid L cabe", "finance": "Ahorro logístico ~280 k€/año vs transporte gestor", "pactvm": "Apta sello CIBE tras NDA y auditoría F4 Herzog" },
  "descartar": false,
  "razonDescarte": ""
}

Si no encuentras candidatos reales con datos públicos verificables, devuelve results vacío y explica en resumen. Nunca inventes datos financieros precisos como cifras exactas con decimales no soportados; pero SIEMPRE estima con un número plausible y registra el proxy en "fuentes". Campos numéricos null/0 = error crítico.`;

function trackTokens(user, operation, inputTokens, outputTokens) {
  const state = readElvira();
  const tc = state.systems.tcontroler;
  if (!tc.byUser) tc.byUser = {};
  if (!tc.byUser[user]) tc.byUser[user] = { inputTokens: 0, outputTokens: 0, calls: 0, operations: {} };
  const u = tc.byUser[user];
  u.inputTokens  += inputTokens;
  u.outputTokens += outputTokens;
  u.calls        += 1;
  if (!u.operations[operation]) u.operations[operation] = { inputTokens: 0, outputTokens: 0, calls: 0 };
  u.operations[operation].inputTokens  += inputTokens;
  u.operations[operation].outputTokens += outputTokens;
  u.operations[operation].calls        += 1;
  u.lastCall = new Date().toISOString();
  // global totals
  const allUsers = Object.values(tc.byUser);
  tc.tokensUsed = allUsers.reduce((s, x) => s + x.inputTokens + x.outputTokens, 0);
  writeElvira(state);
}

async function callLLMTracked(systemPrompt, userPrompt, maxTokens = 4096, user = null, operation = 'unknown') {
  const result = await callLLM(systemPrompt, userPrompt, maxTokens);
  if (user) {
    trackTokens(user, operation, result.inputTokens, result.outputTokens);
  }
  return result.text;
}
const callClaude = (userPrompt, user) => callLLMTracked(SYSTEM_PROMPT, userPrompt, 8192, user, 'search');

function extractJson(text) {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first < 0 || last < 0) throw new Error('respuesta IA sin JSON');
  return JSON.parse(s.slice(first, last + 1));
}

app.post('/api/search', auth, async (req, res) => {
  try {
    const f = req.body || {};
    const continente = String(f.continente || '').trim();
    const pais       = String(f.pais || '').trim();
    const ciudad     = String(f.ciudad || '').trim();
    const sectoresArr= Array.isArray(f.sectores) ? f.sectores.filter(Boolean).map(String) : [];
    const sector     = sectoresArr.length ? sectoresArr.join(', ') : String(f.sector || '').trim();
    const modelo     = String(f.modelo || 'B2B/B2C').trim();
    const minResiduoT= 8; // suelo duro S-NFI: > 8 T/año residuo orgánico
    const maxResults = Math.min(Math.max(Number(f.maxResults ?? 6), 1), 12);
    const extra      = String(f.extra || '').trim();

    const userPrompt = `BARRIDO de Nodos de Integración Potencial para S-NFI.

FILTROS JURISDICCIÓN:
- Continente: ${continente || 'cualquiera'}
- País: ${pais || 'cualquiera'}
- Ciudad/Región: ${ciudad || 'cualquiera'}

FILTROS DE ELEGIBILIDAD:
- Volumen mínimo residuo orgánico anual: ${minResiduoT} T/año
- Residuo: 100% orgánico
- Modelo: ${modelo}
- Sector preferido: ${sector || 'agroalimentario, vinícola, ganadero, hortofrutícola, conservero, lácteo, cárnico, panificación industrial, restauración colectiva'}

CONTEXTO ADICIONAL DEL OPERADOR: ${extra || '(ninguno)'}

Devuelve hasta ${maxResults} empresas REALES (con nombre verificable) que encajen. PREFIERE profundidad sobre cantidad: mejor 3 empresas con ficha completa que 8 a medias.

CHECKLIST OBLIGATORIO antes de emitir JSON (revisa empresa a empresa):
[ ] nodo es nombre real verificable, no genérico.
[ ] tipoResiduo no está vacío.
[ ] volumenResiduoT es número > 8 (no null, no 0).
[ ] plantas es entero >= 1.
[ ] empleados es entero > 0.
[ ] facturacionM es número > 0.
[ ] pagaGestion es SI, NO o DESCONOCIDO (preferir SI/NO).
[ ] esg tiene texto descriptivo, no vacío.
[ ] fuentes lista al menos 1 proxy/fuente.

Si un campo no se puede estimar ni siquiera por proxy, descarta esa empresa antes que devolverla con ficha rota.

SOLO JSON.`;

    const raw = await callClaude(userPrompt, req.user);
    const parsed = extractJson(raw);
    const results = Array.isArray(parsed.results) ? parsed.results : [];

    const entry = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      filters: { continente, pais, ciudad, sector, sectores: sectoresArr, modelo, minResiduoT, maxResults, extra },
      resumen: parsed.resumen || '',
      results,
    };
    const h = readHistory();
    const list = pruneHistory(h[req.user] || []);
    list.unshift(entry);
    h[req.user] = list.slice(0, 30);
    writeHistory(h);

    res.json(entry);
  } catch (ex) {
    console.error('[search]', ex);
    res.status(500).json({ error: ex.message || 'error en búsqueda' });
  }
});

/* add a search result directly to a sheet */
app.post('/api/sheets/:sid/companies/from-search', auth, (req, res) => {
  const db = readDB();
  const u = ensureUser(db, req.user);
  const s = findSheet(u, req.params.sid);
  if (!s) return res.status(404).json({ error: 'hoja no encontrada' });
  const r = req.body || {};
  if (!r.nodo) return res.status(400).json({ error: 'nodo requerido' });
  const dict = r.dictamen && typeof r.dictamen === 'object' ? r.dictamen : {};
  const dictLine = [
    dict.iia     && `IIA: ${dict.iia}`,
    dict.factory && `Factory: ${dict.factory}`,
    dict.finance && `Finance: ${dict.finance}`,
    dict.pactvm  && `Pactvm: ${dict.pactvm}`,
  ].filter(Boolean).join(' · ');
  const volumen = r.volumenResiduoT != null && r.volumenResiduoT !== ''
    ? Number(r.volumenResiduoT)
    : (r.residuoAnualT != null && r.residuoAnualT !== '' ? Number(r.residuoAnualT) : null);
  const fuentesArr = Array.isArray(r.fuentes) ? r.fuentes.filter(Boolean).map(String) : [];
  const notas = [
    r.porQue && `Por qué: ${r.porQue}`,
    r.variableB && `B (BSS): ${r.variableB}`,
    r.variableG && `G (Herzog): ${r.variableG}`,
    r.variableU2 && `U-2: ${r.variableU2}`,
    volumen != null && `Residuo ${volumen} T/año`,
    r.tipoResiduo && `Tipo residuo: ${r.tipoResiduo}`,
    r.modelo && `Modelo ${r.modelo}`,
    fuentesArr.length && `Fuentes: ${fuentesArr.join(' · ')}`,
  ].filter(Boolean).join('\n');
  const c = {
    id: crypto.randomUUID(),
    nodo: String(r.nodo).trim(),
    sector: String(r.sector || '').trim(),
    ubicacion: String(r.ubicacion || '').trim(),
    ophs: Number(r.ophs ?? 0),
    bssMwh: Number(r.bssMwh ?? 0),
    cnmc: String(r.cnmc || 'OK').trim(),
    dictamen: dictLine || String(r.dictamen || ''),
    notas,
    tipoResiduo: String(r.tipoResiduo || '').trim(),
    volumenResiduoT: volumen,
    plantas: r.plantas != null && r.plantas !== '' ? Number(r.plantas) : null,
    empleados: r.empleados != null && r.empleados !== '' ? Number(r.empleados) : null,
    facturacionM: r.facturacionM != null && r.facturacionM !== '' ? Number(r.facturacionM) : null,
    pagaGestion: String(r.pagaGestion || 'DESCONOCIDO').trim(),
    esg: String(r.esg || '').trim(),
    fuentes: fuentesArr,
    tareas: [],
    createdAt: new Date().toISOString(),
    source: 'search',
  };
  s.companies.push(c);
  writeDB(db);
  res.status(201).json(c);
});

/* ---------- companies (cross-sheet helpers para LinkedIn / Email) ---------- */
app.get('/api/companies/all', auth, (req, res) => {
  const db = readDB();
  const u = ensureUser(db, req.user);
  const all = u.sheets.flatMap(s =>
    s.companies.map(c => ({
      id: c.id,
      nodo: c.nodo,
      sector: c.sector,
      ubicacion: c.ubicacion,
      ophs: c.ophs,
      bssMwh: c.bssMwh,
      cnmc: c.cnmc,
      dictamen: c.dictamen,
      notas: c.notas,
      sheetId: s.id,
      sheetName: s.name,
    }))
  );
  res.json(all);
});

/* ---------- LinkedIn Finder (IA · sugerencias de contactos) ---------- */
const LINKEDIN_SYSTEM = `Eres el módulo "LinkedIn Finder" del Agente S-NFI dentro de Elvi-Ra.

Tu tarea: dada una empresa cliente potencial (Nodo S-NFI), proponer perfiles tipo de decision-makers y operadores clave que conviene contactar en LinkedIn para abrir conversación sobre integración S-NFI BioHybrid + Physical AI + gobernanza OPHS.

REGLAS:
- NO inventes nombres reales ni URLs concretas. Devuelve PERFILES TIPO (rol, seniority, área) que se pueden buscar.
- Para cada perfil construye una URL de BÚSQUEDA real en LinkedIn (https://www.linkedin.com/search/results/people/?keywords=...) con keywords + nombre de empresa codificados.
- Prioriza roles que tocan: sostenibilidad, operaciones de planta, energía/utilities, gestión de residuos, innovación/I+D, compliance regulatorio (CNMC), CFO/CapEx.
- Ordena por prioridadOutreach (1 = primero a contactar).
- Da un "anguloApertura" breve y específico al sector/contexto de la empresa, alineado a S-NFI (resiliencia BSS, in-situ vs transporte, soberanía energética OPHS).

SALIDA: SOLO JSON válido, sin markdown:
{
  "contactos": [
    {
      "rol": "string (ej. Director de Sostenibilidad)",
      "area": "string (Sostenibilidad | Operaciones | Energía | Innovación | Finanzas | Compliance | C-Suite)",
      "seniority": "C-Suite | VP | Director | Manager | Lead",
      "keywords": ["string", "..."],
      "searchUrl": "https://www.linkedin.com/search/results/people/?keywords=...",
      "prioridadOutreach": 1,
      "anguloApertura": "string corto"
    }
  ],
  "notaEstrategica": "string corto"
}`;

app.post('/api/linkedin', auth, async (req, res) => {
  try {
    const { companyId } = req.body || {};
    if (!companyId) return res.status(400).json({ error: 'companyId requerido' });
    const db = readDB();
    const u = ensureUser(db, req.user);
    let target = null;
    for (const s of u.sheets) {
      const c = s.companies.find(x => x.id === companyId);
      if (c) { target = { ...c, sheetName: s.name }; break; }
    }
    if (!target) return res.status(404).json({ error: 'empresa no encontrada' });

    const prompt = `EMPRESA OBJETIVO:
- NODO: ${target.nodo}
- Sector: ${target.sector || 'n/d'}
- Ubicación: ${target.ubicacion || 'n/d'}
- OPHS: ${target.ophs || 0}/100
- BSS estimado: ${target.bssMwh || 0} MWh
- CNMC: ${target.cnmc || 'OK'}
- Tipo residuo: ${target.tipoResiduo || 'n/d'}
- Volumen residuo: ${target.volumenResiduoT != null ? target.volumenResiduoT + ' T/año' : 'n/d'}
- Plantas: ${target.plantas ?? 'n/d'}
- Empleados: ${target.empleados ?? 'n/d'}
- Facturación: ${target.facturacionM != null ? target.facturacionM + ' M€' : 'n/d'}
- Paga gestión: ${target.pagaGestion || 'DESCONOCIDO'}
- ESG: ${target.esg || 'n/d'}
- Notas: ${(target.notas || '').slice(0, 600)}
- Dictamen: ${(target.dictamen || '').slice(0, 600)}

Devuelve 5–8 perfiles tipo priorizados para outreach LinkedIn alineado a S-NFI. SOLO JSON.`;

    const raw = await callLLMTracked(LINKEDIN_SYSTEM, prompt, 2048, req.user, 'linkedin');
    const parsed = extractJson(raw);
    const contactos = Array.isArray(parsed.contactos) ? parsed.contactos : [];

    // sanitize / re-build searchUrl by hand to ensure validity
    const cleaned = contactos.map(c => {
      const kw = Array.isArray(c.keywords) ? c.keywords.join(' ') : (c.rol || '');
      const q = `${kw} ${target.nodo}`.trim();
      return {
        rol: String(c.rol || '').trim(),
        area: String(c.area || '').trim(),
        seniority: String(c.seniority || '').trim(),
        keywords: Array.isArray(c.keywords) ? c.keywords.slice(0, 8) : [],
        searchUrl: 'https://www.linkedin.com/search/results/people/?keywords=' + encodeURIComponent(q),
        prioridadOutreach: Number(c.prioridadOutreach || 99),
        anguloApertura: String(c.anguloApertura || '').trim(),
      };
    }).sort((a, b) => a.prioridadOutreach - b.prioridadOutreach);

    res.json({
      company: { id: target.id, nodo: target.nodo, sector: target.sector, ubicacion: target.ubicacion },
      contactos: cleaned,
      notaEstrategica: parsed.notaEstrategica || '',
      generatedAt: new Date().toISOString(),
    });
  } catch (ex) {
    console.error('[linkedin]', ex);
    res.status(500).json({ error: ex.message || 'error LinkedIn Finder' });
  }
});

/* ---------- Email Creator (IA · plantillas políticas S-NFI) ---------- */
const EMAIL_SYSTEM = `Eres el módulo "Email Creator" del Agente S-NFI dentro de Elvi-Ra.

Generas correos de outreach corporativo en NOMBRE de South-Navarre Fresh Innovations Corp. (S-NFI), OEM deep-tech de infraestructura industrial modular. Tecnología núcleo: S-NFI BioHybrid (BioGrinder + BioDeshidratador → biopellet 7–8%) + Physical AI + Gobernanza OPHS.

PRINCIPIOS DE ESTILO S-NFI:
- Tono: serio, técnico-industrial, soberano. Nada de marketing verde blando. Nada de emojis. Nada de exclamaciones.
- Español de España. Frases cortas. No promesas vacías.
- Posicionar S-NFI como infraestructura OEM, no proveedor de servicios.
- Si se cita resiliencia: hablar de autonomía post-apagón (48h) y vulnerabilidad CNMC.
- NDA: encuadrar como prerrequisito de transferencia técnica controlada, no como trámite.
- Firma cierre: "— Equipo S-NFI · South Navarre Fresh Innovations Corp."

SITUACIONES SOPORTADAS:
1. "primer_contacto" → toma de contacto inicial alineada al sector/residuo de la empresa.
2. "solicitud_nda" → segunda iteración solicitando NDA para abrir datos técnicos / cifras.

SALIDA: SOLO JSON válido, sin markdown:
{
  "asunto": "string (max 90 chars)",
  "preheader": "string (max 110 chars, opcional)",
  "cuerpoTexto": "string (texto plano, saltos de línea con \\n, listo para pegar)",
  "cuerpoHtml": "string (HTML simple <p>/<ul>, sin estilos inline ni imágenes)",
  "siguientePaso": "string corto (qué esperamos del destinatario)"
}`;

app.post('/api/email', auth, async (req, res) => {
  try {
    const { companyId, situacion, destinatarioRol, tonoExtra } = req.body || {};
    if (!companyId) return res.status(400).json({ error: 'companyId requerido' });
    const sit = situacion === 'solicitud_nda' ? 'solicitud_nda' : 'primer_contacto';
    const db = readDB();
    const u = ensureUser(db, req.user);
    let target = null;
    for (const s of u.sheets) {
      const c = s.companies.find(x => x.id === companyId);
      if (c) { target = c; break; }
    }
    if (!target) return res.status(404).json({ error: 'empresa no encontrada' });

    const prompt = `SITUACIÓN: ${sit}
DESTINATARIO (rol/perfil): ${destinatarioRol || 'Decision-maker industrial'}
CONTEXTO EXTRA OPERADOR: ${tonoExtra || '(ninguno)'}

EMPRESA OBJETIVO:
- NODO: ${target.nodo}
- Sector: ${target.sector || 'n/d'}
- Ubicación: ${target.ubicacion || 'n/d'}
- OPHS: ${target.ophs || 0}/100
- BSS estimado: ${target.bssMwh || 0} MWh / 48h
- Estado CNMC: ${target.cnmc || 'OK'}
- Tipo residuo: ${target.tipoResiduo || 'n/d'}
- Volumen residuo: ${target.volumenResiduoT != null ? target.volumenResiduoT + ' T/año' : 'n/d'}
- Plantas: ${target.plantas ?? 'n/d'}
- Empleados: ${target.empleados ?? 'n/d'}
- Facturación: ${target.facturacionM != null ? target.facturacionM + ' M€' : 'n/d'}
- Paga gestión externa: ${target.pagaGestion || 'DESCONOCIDO'}
- ESG: ${target.esg || 'n/d'}
- Notas internas: ${(target.notas || '').slice(0, 800)}
- Dictamen interno: ${(target.dictamen || '').slice(0, 800)}

Redacta el email para esta situación, anclado al sector y a las variables S-NFI relevantes. SOLO JSON.`;

    const raw = await callLLMTracked(EMAIL_SYSTEM, prompt, 2048, req.user, 'email');
    const parsed = extractJson(raw);

    res.json({
      company: { id: target.id, nodo: target.nodo, sector: target.sector, ubicacion: target.ubicacion },
      situacion: sit,
      destinatarioRol: destinatarioRol || '',
      asunto: String(parsed.asunto || '').trim(),
      preheader: String(parsed.preheader || '').trim(),
      cuerpoTexto: String(parsed.cuerpoTexto || '').trim(),
      cuerpoHtml: String(parsed.cuerpoHtml || '').trim(),
      siguientePaso: String(parsed.siguientePaso || '').trim(),
      generatedAt: new Date().toISOString(),
    });
  } catch (ex) {
    console.error('[email]', ex);
    res.status(500).json({ error: ex.message || 'error Email Creator' });
  }
});

/* ============================================================
   ELVI-RA · Centro de mando · orquestador
   Endpoints mock estructurados, listos para enchufar Sentinel + Herzog reales.
   ============================================================ */
function readElvira() {
  try { return JSON.parse(fs.readFileSync(ELVIRA_FILE, 'utf8')); }
  catch { return {}; }
}
function writeElvira(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(ELVIRA_FILE, JSON.stringify(state, null, 2));
}

/* Overview agregado: estado sistemas + métricas globales */
app.get('/api/elvira/overview', auth, (req, res) => {
  const state = readElvira();
  const db = readDB();
  const totalUsers = Object.keys(USERS).length;
  const activeSessions = [...SESSIONS.values()].filter(s => s.exp > Date.now()).length;
  const totalCompanies = Object.values(db).reduce(
    (n, u) => n + (u?.sheets || []).reduce((m, s) => m + (s.companies?.length || 0), 0), 0
  );
  res.json({
    systems: state.systems,
    metrics: {
      totalUsers,
      activeSessions,
      totalCompanies,
      dictamenes: (state.ophs?.dictamenes || []).length,
    },
    updatedAt: state.updatedAt,
  });
});

/* ---------- Systems registry ---------- */
app.get('/api/elvira/systems', auth, (req, res) => {
  const state = readElvira();
  res.json(state.systems);
});

app.put('/api/elvira/systems/:key', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ error: 'admin requerido' });
  const state = readElvira();
  const key = String(req.params.key);
  if (!state.systems[key]) return res.status(404).json({ error: 'sistema no registrado' });
  const allowed = ['status', 'endpoint', 'tokensUsed', 'tokensCap', 'backend'];
  for (const k of allowed) if (k in req.body) state.systems[key][k] = req.body[k];
  state.systems[key].lastPing = new Date().toISOString();
  writeElvira(state);
  res.json(state.systems[key]);
});

/* Mock ping — sustituir por handshake real cuando exista */
app.post('/api/elvira/systems/:key/ping', auth, (req, res) => {
  const state = readElvira();
  const key = String(req.params.key);
  const sys = state.systems[key];
  if (!sys) return res.status(404).json({ error: 'sistema no registrado' });
  const t0 = Date.now();
  sys.latencyMs = Math.floor(8 + Math.random() * 22);
  sys.lastPing = new Date().toISOString();
  if (sys.endpoint) sys.status = 'connected';
  writeElvira(state);
  res.json({ key, ...sys, ackMs: Date.now() - t0 });
});

/* ---------- OPHS · scoring centralizado ---------- */
/*
 * Scoring heurístico Dictamen de Soberanía.
 * Variables: W,I,S,M,E,R,B,G,U2  (0-100 cada una).
 * OPHS = sum(weights[k] * vars[k]).
 * Clasificación: ESTRATEGICO >= threshold.estrategico, OPERATIVO >= threshold.operativo, NO_CANDIDATO resto.
 * Penalización dura: vars.G === 0 (tóxico Herzog) o flags.biogas → NO_CANDIDATO.
 */
app.get('/api/elvira/ophs', auth, (req, res) => {
  const state = readElvira();
  res.json(state.ophs);
});

app.put('/api/elvira/ophs/config', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ error: 'admin requerido' });
  const state = readElvira();
  const { weights, threshold } = req.body || {};
  if (weights && typeof weights === 'object') state.ophs.weights = { ...state.ophs.weights, ...weights };
  if (threshold && typeof threshold === 'object') state.ophs.threshold = { ...state.ophs.threshold, ...threshold };
  writeElvira(state);
  res.json({ weights: state.ophs.weights, threshold: state.ophs.threshold });
});

app.post('/api/elvira/ophs/score', auth, (req, res) => {
  const { vars = {}, flags = {}, nodo = '' } = req.body || {};
  const state = readElvira();
  const w = state.ophs.weights;
  const th = state.ophs.threshold;
  const keys = ['W','I','S','M','E','R','B','G','U2'];
  const clean = {};
  let total = 0;
  for (const k of keys) {
    const v = Math.max(0, Math.min(100, Number(vars[k] ?? 0)));
    clean[k] = v;
    total += (w[k] || 0) * v;
  }
  let ophs = Math.round(total);
  let clasificacion = 'NO_CANDIDATO';
  let razonDescarte = '';
  if (flags.biogas)              { ophs = Math.min(ophs, 30); razonDescarte = 'Dependencia biogás/anaerobia'; }
  else if (flags.cnmcSancion)    { ophs = Math.min(ophs, 25); razonDescarte = 'Sanción CNMC previa'; }
  else if (clean.G === 0)        { ophs = Math.min(ophs, 20); razonDescarte = 'Gobernanza tóxica (Herzog bloquea)'; }
  if (!razonDescarte) {
    if (ophs >= th.estrategico) clasificacion = 'ESTRATEGICO';
    else if (ophs >= th.operativo) clasificacion = 'OPERATIVO';
  }
  const dictamen = {
    id: crypto.randomUUID(),
    nodo: String(nodo || '').trim(),
    vars: clean,
    flags,
    ophs,
    clasificacion,
    razonDescarte,
    createdAt: new Date().toISOString(),
    user: req.user,
  };
  state.ophs.dictamenes.unshift(dictamen);
  state.ophs.dictamenes = state.ophs.dictamenes.slice(0, 100);
  writeElvira(state);
  res.json(dictamen);
});

/* ---------- Sentinel bridge (mock) ---------- */
/* Espejo de eventos de identidad/acceso. Real Sentinel publicará aquí. */
app.get('/api/elvira/sentinel/events', auth, (req, res) => {
  const state = readElvira();
  res.json(state.bridges.sentinel.events.slice(0, 50));
});

app.post('/api/elvira/sentinel/events', auth, (req, res) => {
  const b = req.body || {};
  const ev = {
    id: crypto.randomUUID(),
    type: String(b.type || 'access'),       // access | denied | attempt | identity
    subject: String(b.subject || ''),
    detail: String(b.detail || ''),
    severity: String(b.severity || 'info'), // info | warn | critical
    createdAt: new Date().toISOString(),
  };
  const state = readElvira();
  state.bridges.sentinel.events.unshift(ev);
  state.bridges.sentinel.events = state.bridges.sentinel.events.slice(0, 200);
  writeElvira(state);
  res.status(201).json(ev);
});

/* ---------- Herzog bridge (mock) ---------- */
/* Auditoría Fase 4 protocolo S-NFI. Real Herzog publicará aquí. */
app.get('/api/elvira/herzog/audits', auth, (req, res) => {
  const state = readElvira();
  res.json(state.bridges.herzog.audits.slice(0, 50));
});

app.post('/api/elvira/herzog/audits', auth, (req, res) => {
  const b = req.body || {};
  const a = {
    id: crypto.randomUUID(),
    candidato: String(b.candidato || ''),
    veredicto: String(b.veredicto || 'pendiente'), // apto | toxico | pendiente
    fase: String(b.fase || 'F4'),
    motivo: String(b.motivo || ''),
    createdAt: new Date().toISOString(),
    user: req.user,
  };
  const state = readElvira();
  state.bridges.herzog.audits.unshift(a);
  state.bridges.herzog.audits = state.bridges.herzog.audits.slice(0, 200);
  writeElvira(state);
  res.status(201).json(a);
});

/* ---------- T'Controler · token accounting ---------- */
app.get('/api/elvira/tcontroler', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ error: 'admin requerido' });
  const state = readElvira();
  const tc = state.systems.tcontroler;
  const byUser = tc.byUser || {};

  const report = Object.entries(byUser).map(([user, data]) => {
    const costInput  = (data.inputTokens  / 1_000_000) * PRICE_INPUT_PER_M;
    const costOutput = (data.outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
    const costTotal  = costInput + costOutput;
    const ops = Object.entries(data.operations || {}).map(([op, od]) => ({
      operation: op,
      calls: od.calls,
      inputTokens: od.inputTokens,
      outputTokens: od.outputTokens,
      costUSD: Number(((od.inputTokens / 1_000_000) * PRICE_INPUT_PER_M + (od.outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M).toFixed(4)),
    }));
    return {
      user,
      calls: data.calls,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.inputTokens + data.outputTokens,
      costInputUSD: Number(costInput.toFixed(4)),
      costOutputUSD: Number(costOutput.toFixed(4)),
      costTotalUSD: Number(costTotal.toFixed(4)),
      lastCall: data.lastCall || null,
      operations: ops,
    };
  });

  const globalInput  = report.reduce((s, u) => s + u.inputTokens,  0);
  const globalOutput = report.reduce((s, u) => s + u.outputTokens, 0);
  const globalCost   = Number(((globalInput / 1_000_000) * PRICE_INPUT_PER_M + (globalOutput / 1_000_000) * PRICE_OUTPUT_PER_M).toFixed(4));

  res.json({
    model: ANTHROPIC_MODEL,
    pricing: { inputPer1M: PRICE_INPUT_PER_M, outputPer1M: PRICE_OUTPUT_PER_M, currency: 'USD' },
    global: { calls: report.reduce((s, u) => s + u.calls, 0), inputTokens: globalInput, outputTokens: globalOutput, totalTokens: globalInput + globalOutput, costTotalUSD: globalCost },
    byUser: report,
    tokensCap: tc.tokensCap || 0,
    updatedAt: state.updatedAt,
  });
});

app.delete('/api/elvira/tcontroler/reset', auth, (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ error: 'admin requerido' });
  const state = readElvira();
  state.systems.tcontroler.byUser    = {};
  state.systems.tcontroler.tokensUsed = 0;
  writeElvira(state);
  res.json({ ok: true, resetAt: new Date().toISOString() });
});

/* ---------- static frontend ---------- */
app.use(express.static(FRONT));
app.get('/', (req, res) => res.redirect('/pages/login.html'));

/* ============================================================
   RËFF · Mesa de trabajo integrada
   Monta el servidor compilado de Rëff bajo /reff/api
   y sirve su cliente React bajo /reff
   ============================================================ */
(async () => {
  try {
    const REFF_DIST = path.resolve(__dirname, '../../Elvi-Ra/Mesas/Rëff/dist');
    const REFF_SERVER = path.join(REFF_DIST, 'server');
    const REFF_CLIENT = path.join(REFF_DIST, 'client');

    // Load Rëff .env into process.env (ANTHROPIC_API_KEY, JWT_SECRET, DB_PATH)
    const reffEnv = path.resolve(__dirname, '../../Elvi-Ra/Mesas/Rëff/.env');
    if (fs.existsSync(reffEnv)) {
      for (const line of fs.readFileSync(reffEnv, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const [, k, v] = m;
        if (!(k in process.env)) process.env[k] = v.replace(/^["']|["']$/g, '');
      }
    }

    // Override DB_PATH so Rëff SQLite goes to its own data folder
    if (!process.env.DB_PATH) {
      process.env.DB_PATH = path.join(REFF_DIST, '../data/snfi.db');
    }

    const toFileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

    const { seedDatabase, getUserByUsername } = await import(toFileUrl(path.join(REFF_SERVER, 'db.js')));
    seedDatabase();

    const { signToken } = await import(toFileUrl(path.join(REFF_SERVER, 'auth.js')));

    const { default: reffAuthRoutes }  = await import(toFileUrl(path.join(REFF_SERVER, 'routes', 'auth.routes.js')));
    const { default: reffChatRoutes }  = await import(toFileUrl(path.join(REFF_SERVER, 'routes', 'chat.routes.js')));
    const { default: reffAdminRoutes } = await import(toFileUrl(path.join(REFF_SERVER, 'routes', 'admin.routes.js')));

    const reffHealth = (_req, res) => res.json({ status: 'ok', service: 'reff', env: process.env.NODE_ENV || 'development' });

    // Issues a short-lived JWT for 'marc' so the embedded React app can authenticate without a login screen
    app.get('/reff/api/guest-token', (_req, res) => {
      const userRow = getUserByUsername('marc');
      if (!userRow) return res.status(500).json({ error: 'usuario marc no encontrado en DB' });
      const token = signToken({ userId: userRow.id });
      res.json({ token });
    });

    app.get('/reff/api/health', reffHealth);
    app.use('/reff/api/auth',  reffAuthRoutes);
    app.use('/reff/api/chat',  reffChatRoutes);
    app.use('/reff/api/admin', reffAdminRoutes);

    // Aliases at root /api so Rëff React client (built with base path "/") resolves correctly
    app.get('/api/guest-token', (_req, res) => res.redirect('/reff/api/guest-token'));
    app.get('/api/reff-health', reffHealth);
    app.use('/api/auth',  reffAuthRoutes);
    app.use('/api/chat',  reffChatRoutes);
    app.use('/api/admin', reffAdminRoutes);

    // Serve Rëff React client — assets built with base "/" so /assets/* must be mirrored
    if (fs.existsSync(REFF_CLIENT)) {
      // Wrapper: injects JWT into localStorage before loading the React SPA
      // Wrapper page: fetches a guest JWT, stores it under the key the React app expects, then enters the SPA
      app.get('/reff', (_req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(`<!doctype html><html><head><meta charset="UTF-8"><title>Rëff</title></head><body>
<script>
(async () => {
  try {
    const r = await fetch('/reff/api/guest-token');
    const { token } = await r.json();
    if (token) localStorage.setItem('snfi.token', token);
  } catch(e) { console.warn('[reff-wrapper] guest-token failed', e); }
  location.replace('/reff/app/crm');
})();
</script>
</body></html>`);
      });
      app.use('/reff/app', express.static(REFF_CLIENT));
      app.use('/assets', express.static(path.join(REFF_CLIENT, 'assets')));
      app.get('/reff/app/*', (_req, res) => res.sendFile(path.join(REFF_CLIENT, 'index.html')));
    }

    console.log('[Rëff] Integrado en Elvi-Ra bajo /reff');
  } catch (err) {
    console.error('[Rëff] Error al integrar — Rëff no disponible:', err.message);
  }
})();

const PORT = process.env.PORT || 5173;
app.listen(PORT, () => console.log(`Elvi-Ra running → http://localhost:${PORT}`));
