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

export function openDatabase() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL || 'file:data/course.sqlite';
  const authToken = process.env.TURSO_AUTH_TOKEN;

  const client = createClient({
    url,
    ...(authToken ? { authToken } : {})
  });

  return {
    client,
    async query(statement, parameters = []) {
      const activeTx = transactionContext.getStore();
      const executor = activeTx || client;
      const resultSet = await executor.execute({ sql: statement, args: parameters });
      const rows = resultSet.rows || [];
      const changes = resultSet.rowsAffected || 0;
      const lastInsertRowid = resultSet.lastInsertRowid !== undefined && resultSet.lastInsertRowid !== null
        ? Number(resultSet.lastInsertRowid)
        : undefined;

      return {
        rows,
        rowCount: rows.length,
        changes,
        lastInsertRowid
      };
    },
    close: () => client.close()
  };
}

export async function transaction(db, callback) {
  const activeTx = transactionContext.getStore();
  if (activeTx) return callback(activeTx);

  if (!db?.client) {
    return callback(db);
  }

  const tx = await db.client.transaction('write');
  try {
    const txProxy = {
      async execute(stmt) { return tx.execute(stmt); },
      async query(statement, parameters = []) {
        const resultSet = await tx.execute({ sql: statement, args: parameters });
        const rows = resultSet.rows || [];
        const changes = resultSet.rowsAffected || 0;
        const lastInsertRowid = resultSet.lastInsertRowid !== undefined && resultSet.lastInsertRowid !== null
          ? Number(resultSet.lastInsertRowid)
          : undefined;
        return {
          rows,
          rowCount: rows.length,
          changes,
          lastInsertRowid
        };
      }
    };
    const result = await transactionContext.run(txProxy, () => callback(txProxy));
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // ignore rollback failure if transaction already failed
    }
    throw error;
  } finally {
    tx.close();
  }
}

export async function audit(db, actor, action, entity, id, details = {}) {
  await db.query(
    'INSERT INTO audit_logs(actor_id,actor_name,action,entity,entity_id,details) VALUES(?,?,?,?,?,?)',
    [actor.id, actor.name, action, entity, id, JSON.stringify(details)]
  );
}
