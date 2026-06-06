import 'dotenv/config';
import { Router } from 'express';
import https from 'node:https';
import crypto from 'node:crypto';
import { ANTHROPIC_MODEL } from '../llm.js';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

// ─── In-memory store (persists until server restart) ─────────────────────────
const docStore: ComplianceDoc[] = [];

interface ComplianceDoc {
  id: string;
  empresa: string;
  sector: string;
  jurisdiccion: string;
  periodo: string;
  fuente: string;
  ingestedAt: string;
  datos: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractJson(raw: string): any {
  // Try direct parse first
  try { return JSON.parse(raw); } catch { /* continue */ }
  // Strip markdown fences
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* continue */ } }
  // Last resort: extract first {...}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try { return JSON.parse(match[0]); } catch { return {}; }
}

async function callLLM(system: string, user: string, maxTokens: number): Promise<string> {
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) throw new Error('ANTHROPIC_API_KEY no definida en .env');
  const model = process.env.ANTHROPIC_MODEL || ANTHROPIC_MODEL;
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const block = msg.content[0];
  return block.type === 'text' ? block.text : '';
}

// Fetch a URL and return body text (best-effort, no crash on failure)
function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ElviRa-Reff/1.0; S-NFI Corp; compliance research)',
        'Accept': 'text/html,application/json',
      },
    }, (res) => {
      // Follow single redirect
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(() => resolve(''));
        res.resume();
        return;
      }
      let d = '';
      res.on('data', (c: string) => { if (d.length < 50000) d += c; });
      res.on('end', () => resolve(d));
    });
    req.on('error', () => resolve(''));
    req.setTimeout(8000, () => { req.destroy(); resolve(''); });
  });
}

// Strip HTML tags, collapse whitespace, truncate
function stripHtml(html: string, maxLen = 8000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLen);
}

// Search CNMC sanciones page for a company name
async function searchCnmcSanciones(empresa: string): Promise<string> {
  const q = encodeURIComponent(empresa);
  const url = `https://www.cnmc.es/busqueda-resoluciones?search=${q}&field_tipo_resolucion=Sanci%C3%B3n`;
  const html = await fetchUrl(url);
  if (!html) return '';
  return stripHtml(html, 3000);
}

// Search BOE for sanction resolutions
async function searchBoe(empresa: string): Promise<string> {
  const q = encodeURIComponent(`sanción ${empresa}`);
  const url = `https://www.boe.es/buscar/boe.php?campo%5B0%5D=TIT&dato%5B0%5D=${q}&operacion%5B0%5D=and&lang=es`;
  const html = await fetchUrl(url);
  if (!html) return '';
  return stripHtml(html, 3000);
}

// ─── System prompt ────────────────────────────────────────────────────────────

const COMPLIANCE_SYSTEM = `Eres el módulo "Compliance Scanner" del agente Rëff dentro de Elvi-Ra (S-NFI Corp).

Tu función: generar un perfil regulatorio y de compliance de una empresa para evaluar su idoneidad como candidato del marco OPHS de S-NFI.

VARIABLES DE ENTRADA: empresa, sector, jurisdicción, periodo, y fragmentos HTML/texto de fuentes públicas (CNMC, BOE, registros oficiales) proporcionados en el prompt.

INSTRUCCIONES:
1. Analiza los fragmentos de texto de fuentes públicas si se proporcionan. Si contienen información verificable, extráela con confianza ALTA.
2. Complementa con conocimiento propio sobre regulación sectorial, expedientes sancionadores públicos conocidos, etc. Estos datos van con confianza MEDIA o BAJA.
3. NUNCA inventes NIF/CIF, fechas exactas de resolución, o importes de sanción. Usa null y explica en notas.
4. Evalúa según marco OPHS: Ops (operacional), PAIA (sostenibilidad/impacto), Herzog (gobernanza/auditoría), Sentinel (identidad/autenticación).
5. Para empresas industriales/agroalimentarias: evalúa especialmente régimen ambiental (AAI, AIA), gestión residuos, certificaciones ISO 14001/50001, riesgo CNMC energético.

ESTADOS COMPLIANCE:
- APTO: sin expedientes activos, cumplimiento ESG razonable, perfil limpio
- OBSERVACION: algún riesgo menor conocido, requiere due diligence
- EXPEDIENTE_ACTIVO: sanción o expediente abierto verificable
- SANCIONADO: sanción firme conocida
- DESCONOCIDO: información insuficiente para determinar (no usar APTO por defecto)

REGLA CRÍTICA: si no tienes información verificable suficiente, di DESCONOCIDO. No pongas APTO por defecto. La duda perjudica menos que la falsa seguridad.

SALIDA: SOLO JSON válido, sin markdown ni texto fuera del JSON:
{
  "empresa": "string",
  "sector": "string",
  "jurisdiccion": "string",
  "periodo": "string",
  "fuente": "Compliance Scanner · Rëff · S-NFI",
  "confianza": "ALTA | MEDIA | BAJA | MIXTA",
  "fuentesConsultadas": ["string"],
  "registroOficial": {
    "encontrado": boolean,
    "nombreRegistrado": "string | null",
    "nif": "string | null",
    "domicilio": "string | null",
    "fechaAltaRegistro": "string | null",
    "registros": ["string"]
  },
  "datos": {
    "regimen": "string | null",
    "certificaciones": ["string"],
    "licenciasAmbientales": "string | null",
    "gestionResiduos": "string | null",
    "sanciones": "string",
    "expedientes": "string",
    "potenciaInstalada": "number | null",
    "volumenResiduoT": "number | null",
    "obligacionesIncumplidas": ["string"],
    "estadoCompliance": "APTO | OBSERVACION | EXPEDIENTE_ACTIVO | SANCIONADO | DESCONOCIDO",
    "perfilOperador": "string | null",
    "riesgoOPHS": {
      "ops": "BAJO | MEDIO | ALTO",
      "paia": "BAJO | MEDIO | ALTO",
      "herzog": "BAJO | MEDIO | ALTO",
      "sentinel": "BAJO | MEDIO | ALTO"
    }
  },
  "dictamenPreliminar": "CANDIDATO_VIABLE | REQUIERE_REVISION | NO_RECOMENDADO",
  "notas": "string",
  "recomiendaIngest": boolean
}`;

// ─── Confidence scoring ───────────────────────────────────────────────────────

interface ConfianzaBreakdown {
  fuentesWeb: number;      // 0-30: real web sources fetched
  registroEncontrado: number; // 0-20: official registry data present
  datosVerificables: number;  // 0-25: verifiable fields populated (nif, cert, etc.)
  coherenciaLLM: number;   // 0-15: LLM self-assessed confianza
  coberturaDatos: number;  // 0-10: number of data fields populated
}

interface ConfianzaScore {
  score: number;            // 0-100
  nivel: 'ALTA' | 'MEDIA' | 'BAJA' | 'INSUFICIENTE';
  breakdown: ConfianzaBreakdown;
  factores: string[];       // human-readable signals
}

function computeConfianzaScore(
  parsed: any,
  webSourcesHit: number,
  cnmcRaw: string,
  boeRaw: string,
): ConfianzaScore {
  const factores: string[] = [];
  const breakdown: ConfianzaBreakdown = {
    fuentesWeb: 0,
    registroEncontrado: 0,
    datosVerificables: 0,
    coherenciaLLM: 0,
    coberturaDatos: 0,
  };

  // fuentesWeb (0-30): did real scraping return data?
  if (cnmcRaw && cnmcRaw.length > 200) {
    breakdown.fuentesWeb += 15;
    factores.push('CNMC resoluciones: datos obtenidos');
  } else {
    factores.push('CNMC resoluciones: sin datos (posible empresa pequeña o timeout)');
  }
  if (boeRaw && boeRaw.length > 200) {
    breakdown.fuentesWeb += 15;
    factores.push('BOE búsqueda: datos obtenidos');
  } else {
    factores.push('BOE búsqueda: sin datos');
  }

  // registroEncontrado (0-20): official registry data
  const reg = parsed.registroOficial;
  if (reg?.encontrado) {
    breakdown.registroEncontrado += 10;
    factores.push('Registro oficial: entrada encontrada');
    if (reg.nif) { breakdown.registroEncontrado += 5; factores.push('NIF/CIF verificado'); }
    if (reg.domicilio) { breakdown.registroEncontrado += 5; factores.push('Domicilio registrado'); }
  } else {
    factores.push('Registro oficial: no encontrado');
  }

  // datosVerificables (0-25): hard data fields
  const datos = parsed.datos || {};
  let verif = 0;
  if (datos.certificaciones?.length > 0) { verif += 7; factores.push(`Certificaciones: ${datos.certificaciones.join(', ')}`); }
  if (datos.licenciasAmbientales) { verif += 6; factores.push('Licencias ambientales documentadas'); }
  if (datos.regimen) { verif += 6; factores.push(`Régimen: ${datos.regimen}`); }
  if (datos.potenciaInstalada != null) { verif += 3; factores.push(`Potencia instalada: ${datos.potenciaInstalada} MW`); }
  if (datos.volumenResiduoT != null) { verif += 3; factores.push(`Volumen residuo: ${datos.volumenResiduoT} T`); }
  breakdown.datosVerificables = Math.min(verif, 25);

  // coherenciaLLM (0-15): map LLM self-reported confianza
  const llmConf = (parsed.confianza || '').toUpperCase();
  if (llmConf === 'ALTA') { breakdown.coherenciaLLM = 15; factores.push('LLM auto-evaluación: ALTA'); }
  else if (llmConf === 'MIXTA') { breakdown.coherenciaLLM = 10; factores.push('LLM auto-evaluación: MIXTA (parcialmente verificado)'); }
  else if (llmConf === 'MEDIA') { breakdown.coherenciaLLM = 7; factores.push('LLM auto-evaluación: MEDIA'); }
  else { breakdown.coherenciaLLM = 2; factores.push('LLM auto-evaluación: BAJA (sin fuentes verificadas)'); }

  // coberturaDatos (0-10): how many result fields are populated
  const populated = [
    datos.sanciones, datos.expedientes, datos.gestionResiduos,
    datos.perfilOperador, parsed.notas, datos.estadoCompliance,
  ].filter(v => v && v !== 'null' && v !== '').length;
  breakdown.coberturaDatos = Math.min(Math.round((populated / 6) * 10), 10);

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const nivel: ConfianzaScore['nivel'] =
    score >= 70 ? 'ALTA' :
    score >= 45 ? 'MEDIA' :
    score >= 25 ? 'BAJA' : 'INSUFICIENTE';

  return { score, nivel, breakdown, factores };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/elvira/compliance/documents
router.get('/documents', (_req, res) => {
  res.json(docStore.slice().reverse());
});

// POST /api/elvira/compliance/ingest
router.post('/ingest', (req, res) => {
  const b = req.body || {};
  const doc: ComplianceDoc = {
    id: crypto.randomUUID(),
    empresa: b.empresa || '',
    sector: b.sector || '',
    jurisdiccion: b.jurisdiccion || '',
    periodo: b.periodo || '',
    fuente: b.fuente || 'Compliance Scanner · Rëff',
    ingestedAt: new Date().toISOString(),
    datos: b.datos || {},
  };
  docStore.push(doc);
  res.json({ ok: true, doc });
});

// DELETE /api/elvira/compliance/documents/:id
router.delete('/documents/:id', (req, res) => {
  const idx = docStore.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Documento no encontrado' });
  docStore.splice(idx, 1);
  res.json({ ok: true });
});

// POST /api/elvira/compliance/search
router.post('/search', async (req, res) => {
  try {
    const b = req.body || {};
    const empresa     = String(b.empresa     || '').trim();
    const sector      = String(b.sector      || '').trim();
    const jurisdiccion = String(b.jurisdiccion || 'España').trim();
    const periodo     = String(b.periodo     || new Date().getFullYear().toString()).trim();

    if (!empresa) return res.status(400).json({ error: 'empresa requerida' });

    // Parallel fetch of public sources
    const [cnmcText, boeText] = await Promise.all([
      searchCnmcSanciones(empresa),
      searchBoe(empresa),
    ]);

    const fuentesConsultadas: string[] = [];
    if (cnmcText) fuentesConsultadas.push('cnmc.es/busqueda-resoluciones');
    if (boeText)  fuentesConsultadas.push('boe.es/buscar');

    const webContext = [
      cnmcText ? `=== CNMC resoluciones/sanciones ===\n${cnmcText}` : '',
      boeText  ? `=== BOE búsqueda sanciones ===\n${boeText}` : '',
    ].filter(Boolean).join('\n\n') || 'No se obtuvieron fragmentos de fuentes públicas en esta consulta.';

    const userPrompt = `EMPRESA: ${empresa}
SECTOR: ${sector || 'No especificado'}
JURISDICCIÓN: ${jurisdiccion}
PERIODO: ${periodo}

FRAGMENTOS DE FUENTES PÚBLICAS CONSULTADAS:
${webContext}

Genera el perfil de compliance completo según las instrucciones. SOLO JSON.`;

    const raw = await callLLM(COMPLIANCE_SYSTEM, userPrompt, 3500);
    const parsed = extractJson(raw);

    // Ensure fuentesConsultadas is populated even if LLM omits it
    if (!parsed.fuentesConsultadas || parsed.fuentesConsultadas.length === 0) {
      parsed.fuentesConsultadas = fuentesConsultadas.length > 0
        ? fuentesConsultadas
        : ['Conocimiento del modelo (sin fuentes externas obtenidas)'];
    }

    const confianzaScore = computeConfianzaScore(parsed, fuentesConsultadas.length, cnmcText, boeText);

    res.json({
      empresa,
      sector,
      jurisdiccion,
      periodo,
      searchedAt: new Date().toISOString(),
      webSourcesHit: fuentesConsultadas.length,
      confianzaScore,
      ...parsed,
    });
  } catch (ex: any) {
    console.error('[compliance/search]', ex);
    res.status(500).json({ error: ex.message || 'error búsqueda compliance' });
  }
});

export default router;
