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

function normalizeStatement(statement) {
  let sql = statement;
  // Convert Postgres $1, $2 placeholders if present back to ? for libSQL
  sql = sql.replace(/\$(\d+)/g, '?');
  return sql;
}

export function openDatabase() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error('TURSO_DATABASE_URL, DATABASE_URL_LOCAL, or DATABASE_URL is required to connect.');

  const client = createClient({ url, authToken });

  // Dummy pool object for backwards compatibility with legacy lockClient / client acquisition calls
  const dummyPool = {
    connect: async () => ({
      query: async (statement, parameters = []) => {
        const tx = transactionContext.getStore();
        const exec = tx || client;
        const result = await exec.execute({
          sql: normalizeStatement(statement),
          args: parameters
        });
        const rows = result.rows.map(row => ({ ...row }));
        return {
          rows,
          fields: result.columns.map(name => ({ name })),
          rowCount: rows.length,
          changes: result.rowsAffected,
          lastInsertRowid: result.lastInsertRowid !== undefined && result.lastInsertRowid !== null
            ? Number(result.lastInsertRowid)
            : undefined
        };
      },
      release: () => {}
    })
  };

  return {
    client,
    pool: dummyPool,
    async query(statement, parameters = []) {
      const activeCtx = transactionContext.getStore();
      const exec = activeCtx || client;
      const result = await exec.execute({
        sql: normalizeStatement(statement),
        args: parameters
      });

      const rows = result.rows.map(row => {
        const plain = { ...row };
        return plain;
      });

      const lastInsertRowid = result.lastInsertRowid !== undefined && result.lastInsertRowid !== null
        ? Number(result.lastInsertRowid)
        : undefined;

      return {
        rows,
        fields: result.columns.map(name => ({ name })),
        rowCount: rows.length,
        changes: result.rowsAffected,
        lastInsertRowid
      };
    },
    close: () => {
      client.close();
    }
  };
}

export async function transaction(db, callback) {
  const activeTx = transactionContext.getStore();
  if (activeTx) return callback(activeTx);

  if (!db.client) {
    return transactionContext.run(db, () => callback(db));
  }

  const tx = await db.client.transaction('write');
  const txWrapper = {
    async query(statement, parameters = []) {
      const result = await tx.execute({
        sql: normalizeStatement(statement),
        args: parameters
      });
      const rows = result.rows.map(row => ({ ...row }));
      const lastInsertRowid = result.lastInsertRowid !== undefined && result.lastInsertRowid !== null
        ? Number(result.lastInsertRowid)
        : undefined;
      return {
        rows,
        fields: result.columns.map(name => ({ name })),
        rowCount: rows.length,
        changes: result.rowsAffected,
        lastInsertRowid
      };
    }
  };

  try {
    const result = await transactionContext.run(txWrapper, () => callback(txWrapper));
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // ignore rollback error
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
