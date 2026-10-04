import assert from 'node:assert/strict';
import test from 'node:test';
import { findMatchingAdmin, prepareBackupUsers } from '../server/database-backup.js';

test('backup restore matches the authenticated admin by username across databases', () => {
  const backupAdmin = { id: 42, username: 'Admin.User', role: 'admin' };
  const actor = { id: 7, username: 'admin.user', role: 'admin' };

  assert.equal(findMatchingAdmin([backupAdmin], actor), backupAdmin);
});

test('backup restore preserves the authenticated known staff admin role', () => {
  const backupAdmin = { id: 42, username: 'rashad', role: 'admin' };
  const otherKnownAdmin = { id: 43, username: 'elnashar', role: 'admin' };
  const actor = { id: 7, username: 'rashad', role: 'admin' };

  const prepared = prepareBackupUsers([backupAdmin, otherKnownAdmin], actor);

  assert.equal(prepared.restoredActor, backupAdmin);
  assert.equal(prepared.users[0].role, 'admin');
  assert.equal(prepared.users[1].role, 'doctor');
});

test('backup restore does not match a non-admin or a different username', () => {
  const actor = { id: 7, username: 'admin.user', role: 'admin' };

  assert.equal(findMatchingAdmin([{ id: 7, username: 'admin.user', role: 'doctor' }], actor), undefined);
  assert.equal(findMatchingAdmin([{ id: 7, username: 'other.user', role: 'admin' }], actor), undefined);
  assert.throws(() => prepareBackupUsers([{ id: 7, username: 'admin.user', role: 'doctor' }], actor), {
    message: 'النسخة لا تحتوي على حساب الإدارة المستخدم لبدء الاستعادة.'
  });
});
