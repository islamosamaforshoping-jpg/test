import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataDirectory = resolve(process.env.LOCAL_PGDATA || 'data/local-postgres');
const host = process.env.LOCAL_PGHOST || '127.0.0.1';
const port = Number(process.env.LOCAL_PGPORT || 5432);

await mkdir(dataDirectory, { recursive: true });
const database = new PGlite(dataDirectory);
await database.waitReady;

const server = new PGLiteSocketServer({ db: database, host, port, maxConnections: 10 });
server.addEventListener('error', event => {
  console.error('Local PostgreSQL server failed:', event);
  process.exitCode = 1;
});
await server.start();
console.log(`Local PostgreSQL: ${host}:${port} (${dataDirectory})`);

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await server.stop();
  await database.close();
};

process.on('SIGINT', () => shutdown().catch(error => {
  console.error('Local PostgreSQL shutdown failed:', error);
  process.exitCode = 1;
}));
process.on('SIGTERM', () => shutdown().catch(error => {
  console.error('Local PostgreSQL shutdown failed:', error);
  process.exitCode = 1;
}));
