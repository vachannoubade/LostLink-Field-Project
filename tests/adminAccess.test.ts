import test from 'node:test';
import assert from 'node:assert/strict';
import { getTrustedRole, isTrustedAdminUser } from '../src/lib/admin.ts';

test('trusts only the server-controlled app_metadata role', () => {
  assert.equal(getTrustedRole({ app_metadata: { role: 'admin' } }), 'admin');
  assert.equal(isTrustedAdminUser({ app_metadata: { role: 'admin' } }), true);

  assert.equal(getTrustedRole({ app_metadata: { role: 'student' } }), 'student');
  assert.equal(getTrustedRole({ app_metadata: {} }), 'student');
  assert.equal(getTrustedRole(null), 'student');
  assert.equal(isTrustedAdminUser(undefined), false);
});

test('ignores user_metadata and arbitrary profile fields', () => {
  const userWithSpoofedMetadata = {
    app_metadata: { role: 'student' },
    user_metadata: { role: 'admin', isAdmin: true },
    isAdmin: true
  };

  assert.equal(getTrustedRole(userWithSpoofedMetadata), 'student');
  assert.equal(isTrustedAdminUser(userWithSpoofedMetadata), false);
});

test('requires an exact admin role value', () => {
  for (const role of ['Admin', 'ADMIN', ' admin', 'admin ', 'administrator', 1, true, null]) {
    assert.equal(getTrustedRole({ app_metadata: { role } }), 'student');
  }
});

test('prevents student self-assignment and defaults safely on malicious or malformed payloads', () => {
  const attackPayloads = [
    { app_metadata: null, user_metadata: { role: 'admin' } },
    { app_metadata: undefined, role: 'admin' },
    { app_metadata: { roles: ['admin'] } },
    { app_metadata: { is_admin: true } },
    { app_metadata: { role: { admin: true } } },
    { user_metadata: { app_metadata: { role: 'admin' } } },
    {},
    null,
    undefined
  ];

  for (const payload of attackPayloads) {
    assert.equal(getTrustedRole(payload), 'student');
    assert.equal(isTrustedAdminUser(payload), false);
  }
});
