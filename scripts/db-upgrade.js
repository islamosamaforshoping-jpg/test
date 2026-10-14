import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { openDatabase } from '../server/db.js';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const db = openDatabase();

try {
  const result = await db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'");
  if (!result.rowCount) {
    console.log('No schema_migrations table found. Run npm run db:migrate first.');
  } else {
    console.log('Database upgrade completed.');
  }
} finally {
  await db.close();
}
