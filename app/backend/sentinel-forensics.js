import crypto from 'node:crypto';
import geoip from 'geoip-lite';

/* ============================================================
   SENTINEL · Trazabilidad Forense de IPs
   Log criptográfico inmutable: hash chain + HMAC por entry.
   Rate limiting dinámico sobre Mongo (sin Redis).
   ============================================================ */

const FORENSIC_SECRET = process.env.SENTINEL_FORENSIC_SECRET || process.env.JWT_SECRET || 'dev-only-secret-cambiar-en-produccion';

const SENSITIVE_PREFIXES = ['/api/elvira/cnmc', '/api/snfi-u2', '/api/u2'];
const SENSITIVE_LIMIT_PER_MIN = 20;
const NORMAL_LIMIT_PER_MIN = 120;
const RATE_WINDOW_MS = 60 * 1000;
const AUTO_BLOCK_SAME_ROUTE_COUNT = 3;
const AUTO_BLOCK_SAME_ROUTE_WINDOW_MS = 60 * 60 * 1000; // 1h
const AUTO_BLOCK_DISTINCT_ROUTES_COUNT = 2;

function isSensitivePath(path) {
  return SENSITIVE_PREFIXES.some(p => path.startsWith(p));
}

function canonical(entry) {
  // Orden de claves fijo para que el hash sea determinista.
  return JSON.stringify({
    seq: entry.seq, ts: entry.ts, ip: entry.ip, method: entry.method, path: entry.path,
    mesa: entry.mesa, sensitive: entry.sensitive, user: entry.user, statusCode: entry.statusCode,
    blocked: entry.blocked, reason: entry.reason,
  });
}

function signHmac(hash) {
  return crypto.createHmac('sha256', FORENSIC_SECRET).update(hash).digest('hex');
}

export function createSentinelForensics({ mongo, busEmit }) {
  let lastHash = '0'.repeat(64); // genesis
  let seqCounter = 0;
  let chainLoaded = false;
  let chainQueue = Promise.resolve();

  async function loadChainTail() {
    if (chainLoaded) return;
    chainLoaded = true;
    const last = await mongo.collection('forensic_log').find().sort({ seq: -1 }).limit(1).toArray();
    if (last.length) {
      lastHash = last[0].hash;
      seqCounter = last[0].seq;
    }
  }

  // Serializa los appends: seq/hash deben calcularse y persistirse de forma
  // atómica por proceso, si no, llamadas concurrentes pisan lastHash/seqCounter
  // y rompen la cadena (mismatch en el seq que pierde la carrera).
  function appendForensicEntry(fields) {
    const task = chainQueue.then(() => appendForensicEntryUnsafe(fields));
    chainQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  async function appendForensicEntryUnsafe(fields) {
    await loadChainTail();
    seqCounter += 1;
    const entry = {
      seq: seqCounter,
      ts: new Date().toISOString(),
      ip: fields.ip,
      geo: fields.geo,
      method: fields.method,
      path: fields.path,
      mesa: fields.mesa || null,
      sensitive: !!fields.sensitive,
      user: fields.user || null,
      statusCode: fields.statusCode ?? null,
      blocked: !!fields.blocked,
      reason: fields.reason || null,
      prevHash: lastHash,
    };
    const hash = crypto.createHash('sha256').update(lastHash + canonical(entry)).digest('hex');
    const hmac = signHmac(hash);
    const doc = { _id: crypto.randomUUID(), ...entry, hash, hmac };
    await mongo.collection('forensic_log').insertOne(doc);
    lastHash = hash;
    return doc;
  }

  async function verifyChain() {
    await loadChainTail();
    const all = await mongo.collection('forensic_log').find().sort({ seq: 1 }).toArray();
    let prev = '0'.repeat(64);
    for (const entry of all) {
      const expectedHash = crypto.createHash('sha256').update(prev + canonical(entry)).digest('hex');
      if (expectedHash !== entry.hash) {
        return { valid: false, brokenAtSeq: entry.seq, reason: 'hash_mismatch' };
      }
      const expectedHmac = signHmac(entry.hash);
      if (expectedHmac !== entry.hmac) {
        return { valid: false, brokenAtSeq: entry.seq, reason: 'hmac_mismatch' };
      }
      prev = entry.hash;
    }
    return { valid: true, totalEntries: all.length };
  }

  /* ---- rate limiting dinámico sobre Mongo (sin Redis) ---- */
  async function checkRateLimit(ip, path, limit) {
    const now = Date.now();
    const windowStart = new Date(now - RATE_WINDOW_MS);
    const key = `${ip}::${path}`;
    await mongo.collection('rate_limits').insertOne({
      key, ip, path, ts: new Date(now), expiresAt: new Date(now + RATE_WINDOW_MS),
    });
    const count = await mongo.collection('rate_limits').countDocuments({ key, ts: { $gte: windowStart } });
    return { exceeded: count > limit, count, limit };
  }

  /* ---- política de exceso: cola de revisión Admin + auto-bloqueo por patrón ---- */
  async function isIpBlocked(ip) {
    const blocked = await mongo.collection('ip_review_queue').findOne({ ip, decision: 'BLOCKED' });
    return !!blocked;
  }

  async function registerExcess(ip, path, geo) {
    const now = new Date();
    await mongo.collection('ip_excess_log').insertOne({ ip, path, ts: now });

    const sinceWindow = new Date(now.getTime() - AUTO_BLOCK_SAME_ROUTE_WINDOW_MS);
    const sameRouteCount = await mongo.collection('ip_excess_log').countDocuments({ ip, path, ts: { $gte: sinceWindow } });
    const distinctRoutes = await mongo.collection('ip_excess_log').distinct('path', { ip });

    const shouldAutoBlock = sameRouteCount >= AUTO_BLOCK_SAME_ROUTE_COUNT || distinctRoutes.length >= AUTO_BLOCK_DISTINCT_ROUTES_COUNT;

    const existing = await mongo.collection('ip_review_queue').findOne({ ip });
    if (shouldAutoBlock) {
      const reason = sameRouteCount >= AUTO_BLOCK_SAME_ROUTE_COUNT
        ? `AUTO-BLOQUEO · ${sameRouteCount} excesos en ${path} dentro de 1h`
        : `AUTO-BLOQUEO · reconocimiento activo en ${distinctRoutes.length} rutas sensibles distintas`;
      await mongo.collection('ip_review_queue').updateOne(
        { ip },
        { $set: { ip, geo, decision: 'BLOCKED', reason, autoBlocked: true, decidedAt: now, updatedAt: now },
          $setOnInsert: { createdAt: now } },
        { upsert: true },
      );
      busEmit?.({
        id: crypto.randomUUID(), ts: now.toISOString(), origin: 'SENTINEL', dest: 'ELVI-RA',
        type: 'alert', state: 'BLOCKED', label: `IP AUTO-BLOQUEADA · ${ip}`,
        payload: { ip, geo, reason },
      });
      return { autoBlocked: true, reason };
    }

    if (!existing) {
      await mongo.collection('ip_review_queue').insertOne({
        ip, geo, decision: 'PENDING', reason: `Exceso de tasa en ruta sensible · ${path}`,
        autoBlocked: false, createdAt: now, updatedAt: now,
      });
    }
    return { autoBlocked: false };
  }

  /* ---- middleware global ---- */
  function middleware(mesaForPath) {
    return async function sentinelForensicsMiddleware(req, res, next) {
      const ip = req.ip || 'unknown';
      const geo = geoip.lookup(ip.replace(/^::ffff:/, '')) || null;
      const sensitive = isSensitivePath(req.path);

      try {
        if (await isIpBlocked(ip)) {
          await appendForensicEntry({
            ip, geo, method: req.method, path: req.path, mesa: mesaForPath?.(req.path) || null,
            sensitive, user: req.user || null, statusCode: 403, blocked: true, reason: 'IP en lista de bloqueo Sentinel',
          });
          return res.status(403).json({ error: 'IP bloqueada por Sentinel' });
        }

        if (sensitive) {
          const { exceeded } = await checkRateLimit(ip, req.path, SENSITIVE_LIMIT_PER_MIN);
          if (exceeded) {
            const excess = await registerExcess(ip, req.path, geo);
            await appendForensicEntry({
              ip, geo, method: req.method, path: req.path, mesa: mesaForPath?.(req.path) || null,
              sensitive, user: req.user || null, statusCode: 429, blocked: true,
              reason: excess.autoBlocked ? excess.reason : 'Rate limit excedido en ruta sensible (cola revisión Admin)',
            });
            busEmit?.({
              id: crypto.randomUUID(), ts: new Date().toISOString(), origin: 'SENTINEL', dest: 'ELVI-RA',
              type: 'alert', state: 'BLOCKED', label: `RATE LIMIT EXCEDIDO · ${ip} · ${req.path}`,
              payload: { ip, geo, path: req.path },
            });
            return res.status(429).json({ error: 'Demasiadas peticiones en ruta sensible. IP enviada a revisión.' });
          }
        }

        res.on('finish', () => {
          appendForensicEntry({
            ip, geo, method: req.method, path: req.path, mesa: mesaForPath?.(req.path) || null,
            sensitive, user: req.user || null, statusCode: res.statusCode, blocked: false,
          }).catch(err => console.error('[sentinel-forensics] log error', err));
        });

        next();
      } catch (err) {
        console.error('[sentinel-forensics] middleware error', err);
        next();
      }
    };
  }

  async function listForensicLog({ ip, mesa, blocked, sensitive, limit = 200, offset = 0 } = {}) {
    const q = {};
    if (ip) q.ip = ip;
    if (mesa) q.mesa = mesa;
    if (blocked != null) q.blocked = blocked === 'true' || blocked === true;
    if (sensitive != null) q.sensitive = sensitive === 'true' || sensitive === true;
    const total = await mongo.collection('forensic_log').countDocuments(q);
    const events = await mongo.collection('forensic_log').find(q).sort({ seq: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 1000)).toArray();
    return { total, events };
  }

  async function ipStats() {
    const top = await mongo.collection('forensic_log').aggregate([
      { $group: { _id: '$ip', total: { $sum: 1 }, blocked: { $sum: { $cond: ['$blocked', 1, 0] } }, geo: { $first: '$geo' }, lastSeen: { $max: '$ts' } } },
      { $sort: { total: -1 } },
      { $limit: 50 },
    ]).toArray();
    return top.map(t => ({ ip: t._id, total: t.total, blocked: t.blocked, geo: t.geo, lastSeen: t.lastSeen }));
  }

  async function listReviewQueue() {
    return mongo.collection('ip_review_queue').find().sort({ updatedAt: -1 }).limit(200).toArray();
  }

  async function decideReview(ip, decision, decidedBy) {
    const now = new Date();
    await mongo.collection('ip_review_queue').updateOne(
      { ip },
      { $set: { decision, decidedBy, decidedAt: now, updatedAt: now, autoBlocked: false } },
      { upsert: true },
    );
    return mongo.collection('ip_review_queue').findOne({ ip });
  }

  /* ---- bloqueo manual directo desde panel Admin (sin esperar exceso) ---- */
  async function manualBlock(ip, reason, decidedBy) {
    const now = new Date();
    const geo = geoip.lookup(ip.replace(/^::ffff:/, '')) || null;
    await mongo.collection('ip_review_queue').updateOne(
      { ip },
      { $set: { ip, geo, decision: 'BLOCKED', reason: reason || `Bloqueo manual por ${decidedBy}`, autoBlocked: false, decidedBy, decidedAt: now, updatedAt: now },
        $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    return mongo.collection('ip_review_queue').findOne({ ip });
  }

  /* ---- timeline de trafico: peticiones/min ultimos N minutos ---- */
  async function trafficTimeline(minutes = 60) {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const buckets = await mongo.collection('forensic_log').aggregate([
      { $match: { ts: { $gte: since.toISOString() } } },
      { $group: {
        _id: { $dateTrunc: { date: { $toDate: '$ts' }, unit: 'minute' } },
        total: { $sum: 1 },
        blocked: { $sum: { $cond: ['$blocked', 1, 0] } },
        sensitive: { $sum: { $cond: ['$sensitive', 1, 0] } },
      } },
      { $sort: { _id: 1 } },
    ]).toArray();
    return buckets.map(b => ({ minute: b._id.toISOString(), total: b.total, blocked: b.blocked, sensitive: b.sensitive }));
  }

  async function exportIpReport(ip) {
    const log = await mongo.collection('forensic_log').find({ ip }).sort({ seq: 1 }).toArray();
    const review = await mongo.collection('ip_review_queue').findOne({ ip });
    return { ip, review, totalRequests: log.length, log };
  }

  return {
    middleware, listForensicLog, ipStats, listReviewQueue, decideReview, manualBlock, trafficTimeline, exportIpReport, verifyChain, isSensitivePath,
  };
}
