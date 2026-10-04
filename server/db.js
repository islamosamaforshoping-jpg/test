import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

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

function postgresPlaceholders(statement) {
  let index = 0;
  let quote = null;
  let result = '';
  for (let position = 0; position < statement.length; position++) {
    const character = statement[position];
    if (quote) {
      result += character;
      if (character === quote) {
        if (statement[position + 1] === quote) result += statement[++position];
        else quote = null;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
      result += character;
    } else if (character === '?') {
      result += `$${++index}`;
    } else {
      result += character;
    }
  }
  return result;
}

function postgresStatement(statement) {
  let sql = statement;
  const ignoredConflict = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);
  sql = sql.replace(/^(\s*)INSERT\s+OR\s+IGNORE\s+INTO\b/i, '$1INSERT INTO');
  const isInsert = /^\s*INSERT\s+INTO\b/i.test(sql);
  const insertMatch = sql.match(/^\s*INSERT\s+INTO\s+(?:"([^"]+)"|([a-z_][a-z\d_]*))/i);
  const insertTable = (insertMatch?.[1] || insertMatch?.[2])?.toLowerCase();
  const hasIdPrimaryKey = !['auth_sessions', 'level_course_prices', 'schema_migrations'].includes(insertTable);
  const hasReturning = /\bRETURNING\b/i.test(sql);
  const hasConflictClause = /\bON\s+CONFLICT\b/i.test(sql);
  if (ignoredConflict && !hasConflictClause) sql = `${sql.trimEnd()} ON CONFLICT DO NOTHING`;
  if (isInsert && hasIdPrimaryKey && !hasReturning) sql = `${sql.trimEnd()} RETURNING id`;
  return postgresPlaceholders(sql);
}

export function openDatabase() {
  const connectionString = process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_LOCAL or DATABASE_URL is required to connect to Postgres.');
  const pool = new Pool({ connectionString });
  return {
    pool,
    async query(statement, parameters = []) {
      const client = transactionContext.getStore();
      const result = await (client || pool).query(postgresStatement(statement), parameters);
      const numericTypes = new Set([20, 21, 23, 700, 701, 1700]);
      const numericColumns = result.fields
        .map((field, index) => numericTypes.has(field.dataTypeID) ? index : -1)
        .filter(index => index >= 0);
      for (const row of result.rows) {
        for (const index of numericColumns) {
          if (typeof row[result.fields[index].name] === 'string') {
            row[result.fields[index].name] = Number(row[result.fields[index].name]);
          }
        }
      }
      return {
        ...result,
        changes: result.rowCount,
        lastInsertRowid: result.rows?.[0]?.id
      };
    },
    close: () => pool.end()
  };
}

export async function transaction(db, callback) {
  const activeClient = transactionContext.getStore();
  if (activeClient) return callback(activeClient);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await transactionContext.run(client, callback);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function audit(db, actor, action, entity, id, details = {}) {
  await db.query(
    'INSERT INTO audit_logs(actor_id,actor_name,action,entity,entity_id,details) VALUES(?,?,?,?,?,?)',
    [actor.id, actor.name, action, entity, id, JSON.stringify(details)]
  );
}
