import { MongoClient } from 'mongodb';

let client = null;
let elviraDb = null;

export async function connectMongo() {
  if (client) return client;
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI no definida.');
  client = new MongoClient(uri);
  await client.connect();
  elviraDb = client.db('elvira');
  await ensureIndexes();
  return client;
}

export function getMongoClient() {
  if (!client) throw new Error('Mongo no conectado. Llama connectMongo() primero.');
  return client;
}

export function getElviraDb() {
  if (!elviraDb) throw new Error('Mongo no conectado. Llama connectMongo() primero.');
  return elviraDb;
}

async function ensureIndexes() {
  await elviraDb.collection('sheets').createIndex({ user: 1 });
  await elviraDb.collection('companies').createIndex({ sheetId: 1 });
  await elviraDb.collection('companies').createIndex({ cnmc: 1 });
  await elviraDb.collection('u2_calculos').createIndex({ creadoAt: -1 });
  await elviraDb.collection('bus_history').createIndex({ ts: -1 });
  await elviraDb.collection('bus_history').createIndex({ origin: 1, state: 1, type: 1 });

  // Sentinel · trazabilidad forense IP
  await elviraDb.collection('forensic_log').createIndex({ seq: 1 }, { unique: true });
  await elviraDb.collection('forensic_log').createIndex({ ip: 1 });
  await elviraDb.collection('forensic_log').createIndex({ mesa: 1, sensitive: 1, blocked: 1 });
  await elviraDb.collection('rate_limits').createIndex({ key: 1, ts: -1 });
  await elviraDb.collection('rate_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await elviraDb.collection('ip_excess_log').createIndex({ ip: 1, path: 1, ts: -1 });
  await elviraDb.collection('ip_review_queue').createIndex({ ip: 1 }, { unique: true });
}

export async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    elviraDb = null;
  }
}

export async function withTransaction(fn) {
  const session = getMongoClient().startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
