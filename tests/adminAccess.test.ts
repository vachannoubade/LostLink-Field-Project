import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_ADMIN_EMAIL,
  getTrustedRole,
  isAuthorizedInitialAdminEmail,
  getSafeInternalDestination,
  isTrustedAdminUser,
  isTrustedDeskOperator,
  isTrustedStaffUser
} from '../src/lib/admin.ts';

test('trusts only the server-controlled app_metadata role', () => {
  assert.equal(getTrustedRole({ app_metadata: { role: 'admin' } }), 'admin');
  assert.equal(isTrustedAdminUser({ app_metadata: { role: 'admin' } }), true);
  assert.equal(isTrustedDeskOperator({ app_metadata: { role: 'admin' } }), true);
  assert.equal(isTrustedStaffUser({ app_metadata: { role: 'admin' } }), true);

  assert.equal(getTrustedRole({ app_metadata: { role: 'desk_operator' } }), 'desk_operator');
  assert.equal(isTrustedAdminUser({ app_metadata: { role: 'desk_operator' } }), false);
  assert.equal(isTrustedDeskOperator({ app_metadata: { role: 'desk_operator' } }), true);
  assert.equal(isTrustedStaffUser({ app_metadata: { role: 'desk_operator' } }), true);

  assert.equal(getTrustedRole({ app_metadata: { role: 'staff' } }), 'staff');
  assert.equal(isTrustedAdminUser({ app_metadata: { role: 'staff' } }), false);
  assert.equal(isTrustedDeskOperator({ app_metadata: { role: 'staff' } }), false);
  assert.equal(isTrustedStaffUser({ app_metadata: { role: 'staff' } }), true);

  assert.equal(getTrustedRole({ app_metadata: { role: 'student' } }), 'student');
  assert.equal(getTrustedRole({ app_metadata: {} }), 'student');
  assert.equal(getTrustedRole(null), 'student');
  assert.equal(isTrustedAdminUser(undefined), false);
  assert.equal(isTrustedDeskOperator(undefined), false);
  assert.equal(isTrustedStaffUser(undefined), false);
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

test('enforces authorized initial admin identity check on email', () => {
  assert.equal(INITIAL_ADMIN_EMAIL, 'vachannoubade@gmail.com');
  assert.equal(isAuthorizedInitialAdminEmail('vachannoubade@gmail.com'), true);
  assert.equal(isAuthorizedInitialAdminEmail('VACHANNOUBADE@GMAIL.COM'), true);
  assert.equal(isAuthorizedInitialAdminEmail('  vachannoubade@gmail.com  '), true);
  assert.equal(isAuthorizedInitialAdminEmail('student@sanjayghodawatuniversity.ac.in'), false);
  assert.equal(isAuthorizedInitialAdminEmail('intruder@gmail.com'), false);
  assert.equal(isAuthorizedInitialAdminEmail(null), false);
  assert.equal(isAuthorizedInitialAdminEmail(undefined), false);

  // When email is provided on user object, unauthorized email is rejected even if role claim is forged
  const authorizedAdmin = {
    email: 'vachannoubade@gmail.com',
    app_metadata: { role: 'admin' }
  };
  assert.equal(isTrustedAdminUser(authorizedAdmin), true);

  const unauthorizedWithAdminRole = {
    email: 'hacker@example.com',
    app_metadata: { role: 'admin' }
  };
  assert.equal(isTrustedAdminUser(unauthorizedWithAdminRole), false);
});

test('sanitizes internal redirect destinations and blocks open redirect vectors', () => {
  // Valid internal paths
  assert.equal(getSafeInternalDestination('/admin'), '/admin');
  assert.equal(getSafeInternalDestination('/admin/claims?status=pending'), '/admin/claims?status=pending');
  assert.equal(getSafeInternalDestination('/browse'), '/browse');

  // Open redirect attempts (protocol-relative, domain injection, backslashes, scripts)
  assert.equal(getSafeInternalDestination('//evil.com'), '/admin');
  assert.equal(getSafeInternalDestination('//evil.com/admin'), '/admin');
  assert.equal(getSafeInternalDestination('/\\evil.com'), '/admin');
  assert.equal(getSafeInternalDestination('https://evil.com'), '/admin');
  assert.equal(getSafeInternalDestination('http://evil.com/login'), '/admin');
  assert.equal(getSafeInternalDestination('javascript:alert(1)'), '/admin');
  assert.equal(getSafeInternalDestination('data:text/html,evil'), '/admin');
  assert.equal(getSafeInternalDestination(null), '/admin');
  assert.equal(getSafeInternalDestination(undefined), '/admin');
  assert.equal(getSafeInternalDestination(''), '/admin');

  // Custom fallback
  assert.equal(getSafeInternalDestination('//evil.com', '/browse'), '/browse');
});
