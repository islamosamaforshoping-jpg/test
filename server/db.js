import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createClient } from '@libsql/client';

const transactionContext = new AsyncLocalStorage();

export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');

export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function passwordValid(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash || hash.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hash)) return false;
  try {
    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

export function openDatabase(options = {}) {
  const url = options.url || process.env.TURSO_DATABASE_URL || 'file::memory:';
  const authToken = options.authToken || process.env.TURSO_AUTH_TOKEN;
  const client = createClient({ url, authToken });

  const db = {
    client,
    async query(statement, parameters = []) {
      const activeTx = transactionContext.getStore();
      if (activeTx) return activeTx.query(statement, parameters);
      const res = await client.execute({ sql: statement, args: parameters });
      const rows = res.rows || [];
      return {
        rows,
        changes: res.rowsAffected,
        rowCount: rows.length || res.rowsAffected,
        lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined
      };
    },
    close: () => client.close()
  };

  return db;
}

export async function transaction(db, callback) {
  const activeTx = transactionContext.getStore();
  if (activeTx) return callback(activeTx);

  if (db?.client?.transaction) {
    const tx = await db.client.transaction('write');
    const txWrapper = {
      async query(statement, parameters = []) {
        const res = await tx.execute({ sql: statement, args: parameters });
        const rows = res?.rows || [];
        return {
          rows,
          changes: res?.rowsAffected ?? 0,
          rowCount: rows.length || res?.rowsAffected || 0,
          lastInsertRowid: res?.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : undefined
        };
      }
    };
    try {
      const result = await transactionContext.run(txWrapper, () => callback(db));
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }

  return callback(db);
}

export async function audit(db, actor, action, entity, id, details = {}) {
  await db.query(
    'INSERT INTO audit_logs(actor_id,actor_name,action,entity,entity_id,details) VALUES(?,?,?,?,?,?)',
    [actor.id, actor.name, action, entity, id, JSON.stringify(details)]
  );
}
