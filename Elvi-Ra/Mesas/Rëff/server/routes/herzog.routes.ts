import { Router, Request, Response } from 'express';
import { getReffDb, nextSeq } from '../mongo.js';
import { authMiddleware } from '../auth.js';
import { streamLLM } from '../llm.js';

const router = Router();

router.use(authMiddleware);

const HERZOG_SYSTEM_PROMPT = `Eres Herzog, el módulo de auditoría científica de Elvi-Ra, centro de mando de South-Navarre Fresh Innovations Corp. (S-NFI).

A partir del texto que te da el usuario sobre una empresa candidata, evalúa estas 6 variables, cada una puntuada de 0 a 100:

- W (Residuo): volumen y calidad del residuo orgánico generado, idoneidad para S-NFI BioHybrid.
- I (Infraestructura): infraestructura física existente, facilidad de integración con S-NFI Systems.
- S (Escalabilidad): potencial de crecimiento y replicación del modelo con esta empresa.
- M (Compatibilidad OEM): compatibilidad con el modelo OEM de S-NFI (energía, residuo, dato, control).
- E (Impacto económico): impacto económico esperado para S-NFI (ingresos, ahorro, valor estratégico).
- R (Estratégico): valor estratégico a largo plazo, alineación con doctrina S-NFI y marco OPHS.

Penaliza fuerte: biogás/anaerobia clásica, sanciones CNMC, opacidad informativa, incompatibilidad con OPHS. Ante duda razonable, no clasifiques como estratégico.

Redacta "summary", "highlights" y "risks" en frases completas, gramaticalmente correctas y sin ambigüedad. No uses construcciones como "no orgánicos idóneos"; en su lugar especifica con claridad, ej. "genera residuo industrial no orgánico, no idóneo para S-NFI BioHybrid".

Responde EXCLUSIVAMENTE con un JSON válido (sin markdown, sin texto adicional), con esta forma exacta:
{
  "scores": { "W": 0, "I": 0, "S": 0, "M": 0, "E": 0, "R": 0 },
  "overall": 0,
  "classification": "ESTRATEGICO" | "OPERATIVO" | "NO_CANDIDATO",
  "summary": "resumen breve en español, 2-4 frases",
  "highlights": ["punto clave 1", "punto clave 2"],
  "risks": ["riesgo 1", "riesgo 2"]
}

"overall" es la media de los 6 scores, redondeada a entero.`;

router.post('/audit', async (req: Request, res: Response) => {
  const { companyName, text } = req.body || {};
  if (!companyName || typeof companyName !== 'string' || !companyName.trim()) {
    return res.status(400).json({ error: 'El nombre de la empresa es obligatorio' });
  }
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'El texto a auditar es obligatorio' });
  }

  const userMessage = `Empresa: ${companyName.trim()}\n\nInformación a auditar:\n${text.trim()}`;

  let fullText = '';
  let errorMsg: string | null = null;

  await streamLLM(
    HERZOG_SYSTEM_PROMPT,
    [{ role: 'user', content: userMessage }],
    2048,
    {
      onChunk: (chunk) => { fullText += chunk; },
      onDone: () => {},
      onError: (err) => { errorMsg = err.message; },
      isClosed: () => false,
    },
  );

  if (errorMsg) {
    return res.status(502).json({ error: errorMsg });
  }

  let result: unknown;
  try {
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    result = JSON.parse(jsonMatch ? jsonMatch[0] : fullText);
  } catch {
    return res.status(502).json({ error: 'La auditoría no devolvió un JSON válido', raw: fullText });
  }

  const auditId = await nextSeq('herzog_audits');
  await getReffDb().collection<AuditDoc>('herzog_audits').insertOne({
    _id: auditId,
    user_id: req.user.id,
    company_name: companyName.trim(),
    input_text: text.trim(),
    result_json: result as Record<string, unknown>,
    created_at: new Date().toISOString(),
  });

  res.json({ result });
});

interface AuditDoc {
  _id: number;
  user_id: string;
  company_name: string;
  input_text: string;
  result_json: Record<string, unknown>;
  created_at: string;
}

router.get('/history', async (req: Request, res: Response) => {
  const rows = await getReffDb().collection<AuditDoc>('herzog_audits')
    .find({ user_id: req.user.id })
    .sort({ _id: -1 })
    .limit(50)
    .toArray();
  res.json({
    audits: rows.map((r) => ({
      id: r._id,
      companyName: r.company_name,
      inputText: r.input_text,
      result: r.result_json,
      createdAt: r.created_at,
    })),
  });
});

export default router;
