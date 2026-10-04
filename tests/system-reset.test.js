import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { passwordHash } from '../server/db.js';
import { registerSystemResetRoutes, removeAutomaticBackups } from '../server/system-reset.js';

const pending = () => ({
  id: 'wipe-request',
  requester_id: 10,
  requester_name: 'Assistant',
  requester_username: 'assistant',
  requester_role: 'assistant',
  status: 'pending'
});

function setup(options = {}) {
  const password = 'correct horse battery staple';
  const users = new Map([
    [10, { id: 10, name: 'Assistant', username: 'assistant', role: 'assistant', active: 1, password_hash: passwordHash(password) }],
    [20, { id: 20, name: 'Doctor', username: 'doctor', role: 'doctor', active: 1, password_hash: passwordHash(password) }],
    [30, { id: 30, name: 'Student', username: 'student', role: 'student', active: 1, password_hash: passwordHash(password) }]
  ]);
  const requests = new Map();
  const storageCalls = [];
  let truncateSql = '';
  let studentUsersDeleteSql = '';
  let backupCleanupCount = 0;
  let completionCount = 0;
  const db = {
    pool: {
      connect: async () => ({
        query: async () => ({ rows: [] }),
        release() {}
      })
    },
    async query(sql, params = []) {
      if (sql.includes('FROM users WHERE id=?')) return { rows: users.has(params[0]) ? [{ ...users.get(params[0]) }] : [] };
      if (sql.includes("FROM system_wipe_requests") && sql.includes("status IN ('pending','processing')")) {
        const active = [...requests.values()].find(request => ['pending', 'processing'].includes(request.status));
        return { rows: active ? [{ id: active.id }] : [] };
      }
      if (sql.startsWith('INSERT INTO system_wipe_requests')) {
        requests.set(params[0], { ...pending(), id: params[0], requester_id: params[1], requester_name: params[2], requester_username: params[3], requester_role: params[4], created_at: params[5] });
        return { rows: [], changes: 1 };
      }
      if (sql.includes('FROM system_wipe_requests') && sql.includes('FOR UPDATE')) {
        const request = requests.get(params[0]);
        return { rows: request?.status === 'pending' ? [{ ...request }] : [] };
      }
      if (sql.includes("FROM users WHERE id=?") && sql.includes('role,active')) {
        return { rows: users.has(params[0]) ? [{ ...users.get(params[0]) }] : [] };
      }
      if (sql.startsWith("UPDATE system_wipe_requests SET status='processing'")) {
        const request = requests.get(params[4]);
        Object.assign(request, { status: 'processing', approver_id: params[0], approver_name: params[1], approver_username: params[2], approved_at: params[3] });
        return { rows: [], changes: 1 };
      }
      if (sql.startsWith("UPDATE system_wipe_requests SET status='completed'")) {
        const request = requests.get(params[1]);
        Object.assign(request, { status: 'completed', finished_at: params[0], failure_reason: '' });
        return { rows: [], changes: 1 };
      }
      if (sql.startsWith("UPDATE system_wipe_requests SET status='failed'")) {
        const request = requests.get(params[2]);
        if (request?.status === 'processing') Object.assign(request, { status: 'failed', finished_at: params[0], failure_reason: params[1] });
        return { rows: [], changes: 1 };
      }
      if (sql.startsWith("UPDATE system_wipe_requests SET status='cancelled'")) {
        const request = requests.get(params[1]);
        if (request?.requester_id === params[2] && request.status === 'pending') {
          Object.assign(request, { status: 'cancelled', finished_at: params[0] });
          return { rows: [], changes: 1 };
        }
        return { rows: [], changes: 0 };
      }
      if (sql.includes('FROM system_wipe_requests ORDER BY created_at')) return { rows: [...requests.values()].map(row => ({ ...row })) };
      if (sql.includes('FROM information_schema.tables')) {
        return { rows: ['users', 'students', 'course_settings', 'system_wipe_requests', 'schema_migrations', 'neon_data_migrations'].map(table_name => ({ table_name })) };
      }
      if (sql.startsWith('TRUNCATE TABLE')) {
        truncateSql = sql;
        return { rows: [] };
      }
      if (sql === "DELETE FROM users WHERE role='student'") {
        studentUsersDeleteSql = sql;
        for (const [id, user] of users) if (user.role === 'student') users.delete(id);
        return { rows: [], changes: 0 };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    }
  };
  const routes = new Map();
  const app = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); }
  };
  const storage = {
    async send(command) {
      storageCalls.push(command.constructor.name);
      if (command.constructor.name === 'ListObjectsV2Command') return { Contents: [{ Key: 'material-1' }, { Key: 'material-2' }], IsTruncated: false };
      if (command.constructor.name === 'DeleteObjectsCommand') return { Deleted: [{ Key: 'material-1' }, { Key: 'material-2' }] };
      throw new Error(`Unexpected storage command: ${command.constructor.name}`);
    },
    destroy() { storageCalls.push('destroy'); }
  };
  registerSystemResetRoutes(app, db, {
    createStorageClient: options.createStorageClient ?? (() => storage),
    removeBackups: options.removeBackups ?? (async () => { backupCleanupCount++; }),
    onComplete: options.onComplete ?? (() => { completionCount++; })
  });
  return {
    password, requests, routes, storageCalls,
    get users() { return [...users.values()]; },
    get truncateSql() { return truncateSql; },
    get studentUsersDeleteSql() { return studentUsersDeleteSql; },
    get backupCleanupCount() { return backupCleanupCount; },
    get completionCount() { return completionCount; }
  };
}

async function invoke(routes, key, { user, body = {}, params = {} }) {
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; }
  };
  let error;
  await routes.get(key)({ user, body, params }, response, value => { error = value; });
  return { response, error };
}

test('system wipe request requires the authenticated staff member password', async () => {
  const state = setup();
  const wrong = await invoke(state.routes, 'POST /api/system-reset/requests', {
    user: { id: 10, role: 'assistant' }, body: { password: 'wrong password here' }
  });
  assert.equal(wrong.response.statusCode, 401);
  assert.equal(state.requests.size, 0);

  const accepted = await invoke(state.routes, 'POST /api/system-reset/requests', {
    user: { id: 10, role: 'assistant' }, body: { password: state.password }
  });
  assert.equal(accepted.response.statusCode, 201);
  assert.equal(state.requests.get(accepted.response.payload.id).status, 'pending');
});

test('a requesting doctor cannot approve their own request', async () => {
  const state = setup();
  state.requests.set('wipe-request', { ...pending(), requester_id: 20, requester_role: 'doctor' });
  const result = await invoke(state.routes, 'POST /api/system-reset/requests/:id/approve', {
    user: { id: 20, role: 'doctor', name: 'Doctor' }, params: { id: 'wipe-request' }
  });
  assert.equal(result.error.status, 403);
  assert.equal(state.requests.get('wipe-request').status, 'pending');
  assert.deepEqual(state.storageCalls, []);
});

test('assistants cannot approve and only a request owner may cancel', async () => {
  const state = setup();
  state.requests.set('wipe-request', pending());
  const assistantApproval = await invoke(state.routes, 'POST /api/system-reset/requests/:id/approve', {
    user: { id: 10, role: 'assistant' }, params: { id: 'wipe-request' }
  });
  assert.equal(assistantApproval.response.statusCode, 403);

  const otherUserCancel = await invoke(state.routes, 'POST /api/system-reset/requests/:id/cancel', {
    user: { id: 20, role: 'doctor' }, params: { id: 'wipe-request' }
  });
  assert.equal(otherUserCancel.response.statusCode, 409);
  assert.equal(state.requests.get('wipe-request').status, 'pending');

  const ownerCancel = await invoke(state.routes, 'POST /api/system-reset/requests/:id/cancel', {
    user: { id: 10, role: 'assistant' }, params: { id: 'wipe-request' }
  });
  assert.equal(ownerCancel.response.statusCode, 200);
  assert.equal(state.requests.get('wipe-request').status, 'cancelled');
});

test('a different doctor approval deletes storage, backs up, and all application tables', async () => {
  const state = setup();
  state.requests.set('wipe-request', pending());
  const result = await invoke(state.routes, 'POST /api/system-reset/requests/:id/approve', {
    user: { id: 20, role: 'doctor', name: 'Doctor' }, params: { id: 'wipe-request' }
  });
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.payload.ok, true);
  assert.equal(state.requests.get('wipe-request').status, 'completed');
  assert.doesNotMatch(state.truncateSql, /"users"/);
  assert.match(state.truncateSql, /"students"/);
  assert.match(state.truncateSql, /RESTART IDENTITY CASCADE$/);
  assert.doesNotMatch(state.truncateSql, /"system_wipe_requests"/);
  assert.doesNotMatch(state.truncateSql, /"schema_migrations"/);
  assert.equal(state.studentUsersDeleteSql, "DELETE FROM users WHERE role='student'");
  assert.deepEqual(state.users.map(({ username, role }) => ({ username, role })), [
    { username: 'assistant', role: 'assistant' },
    { username: 'doctor', role: 'doctor' }
  ]);
  assert.deepEqual(state.storageCalls, ['ListObjectsV2Command', 'DeleteObjectsCommand', 'destroy']);
  assert.equal(state.backupCleanupCount, 1);
  assert.equal(state.completionCount, 1);
});

test('storage configuration errors return a clear failure without truncating application data', async () => {
  const state = setup({
    createStorageClient() {
      const error = new Error('تخزين المكتبة غير مهيأ؛ لم يبدأ مسح البيانات.');
      error.status = 503;
      throw error;
    }
  });
  state.requests.set('wipe-request', pending());
  const result = await invoke(state.routes, 'POST /api/system-reset/requests/:id/approve', {
    user: { id: 20, role: 'doctor', name: 'Doctor' }, params: { id: 'wipe-request' }
  });
  assert.equal(result.error.status, 503);
  assert.equal(state.truncateSql, '');
  assert.equal(state.requests.get('wipe-request').status, 'failed');
  assert.match(state.requests.get('wipe-request').failure_reason, /تخزين المكتبة غير مهيأ/);
});

test('Vercel resets skip local backup-file deletion on the read-only deployment filesystem', async () => {
  const directory = join(tmpdir(), `system-reset-vercel-${Date.now()}`);
  await assert.doesNotReject(() => removeAutomaticBackups({ directory, isVercel: true }));
});

test('local reset removes only automatic backup files and ignores unrelated files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'system-reset-backups-'));
  try {
    const { writeFile, readdir } = await import('node:fs/promises');
    await writeFile(join(directory, 'course-backup-2026-10-01.json'), '{}');
    await writeFile(join(directory, 'keep.txt'), 'keep');
    await removeAutomaticBackups({ directory, isVercel: false });
    assert.deepEqual(await readdir(directory), ['keep.txt']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
