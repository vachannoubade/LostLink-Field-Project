import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSupabaseUrl, isPrivilegedCredential } from '../config/supabaseUrl.ts';

const validHttpsUrl = 'https://demo-project.supabase.co';

test('accepts a valid Supabase HTTPS URL', () => {
  const result = validateSupabaseUrl(validHttpsUrl);

  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.url, validHttpsUrl);
  }

  const restResult = validateSupabaseUrl(`${validHttpsUrl}/rest/v1`);
  assert.equal(restResult.valid, true);
  if (restResult.valid) {
    assert.equal(restResult.url, validHttpsUrl);
  }
});

test('accepts the standard HTTPS port :443', () => {
  const result = validateSupabaseUrl(`${validHttpsUrl}:443`);

  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.url, validHttpsUrl);
  }
});

test('rejects malformed URLs', () => {
  const input = 'not-a-valid-url';
  const result = validateSupabaseUrl(input);

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.match(result.error, /valid absolute URL/i);
    assert.equal(result.error.includes(input), false);
  }
});

test('rejects URLs containing username or password credentials', () => {
  for (const value of [
    'https://user@demo-project.supabase.co',
    'https://user:password@demo-project.supabase.co'
  ]) {
    const result = validateSupabaseUrl(value);

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.match(result.error, /username or password/i);
    }
  }
});

test('rejects query parameters and fragments', () => {
  const queryResult = validateSupabaseUrl('https://demo-project.supabase.co?foo=bar');
  const fragmentResult = validateSupabaseUrl('https://demo-project.supabase.co#section');

  assert.equal(queryResult.valid, false);
  assert.equal(fragmentResult.valid, false);
  if (!queryResult.valid) {
    assert.match(queryResult.error, /query parameters/i);
  }
  if (!fragmentResult.valid) {
    assert.match(fragmentResult.error, /fragment/i);
  }
});

test('rejects unsupported HTTP URLs', () => {
  const result = validateSupabaseUrl('http://demo-project.supabase.co');

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.match(result.error, /HTTPS/i);
  }
});

test('rejects non-standard hosted HTTPS ports', () => {
  for (const value of [
    'https://demo-project.supabase.co:8443',
    'https://demo-project.supabase.co:8080'
  ]) {
    const result = validateSupabaseUrl(value);

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.match(result.error, /standard HTTPS port/i);
    }
  }
});

test('rejects backslash-containing URLs', () => {
  const result = validateSupabaseUrl('https://demo-project.supabase.co\\@evil.com');

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.match(result.error, /backslash/i);
  }
});

test('rejects embedded whitespace and ASCII control characters', () => {
  for (const value of [
    'https://demo-project.supabase.co /rest/v1',
    'https://demo-project.supabase.co\t/rest/v1',
    'https://demo-project.supabase.co\u0000/rest/v1'
  ]) {
    const result = validateSupabaseUrl(value);

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.match(result.error, /whitespace or control/i);
    }
  }
});

test('rejects Unicode hostname variants', () => {
  for (const value of [
    'https://demo-project。supabase.co',
    'https://démö-project.supabase.co'
  ]) {
    const result = validateSupabaseUrl(value);

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.match(result.error, /ASCII/i);
    }
  }
});

test('rejects empty user-info syntax', () => {
  const result = validateSupabaseUrl('https://@demo-project.supabase.co');

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.match(result.error, /user-info/i);
  }
});

test('rejects unsupported paths', () => {
  for (const value of [
    'https://demo-project.supabase.co/api',
    'https://demo-project.supabase.co/rest/v1/extra'
  ]) {
    const result = validateSupabaseUrl(value);

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.match(result.error, /unsupported path/i);
    }
  }
});

test('rejects malformed hostname labels', () => {
  for (const value of [
    'https://-bad.supabase.co',
    'https://bad-.supabase.co',
    'https://bad..supabase.co',
    'https://bad_host.supabase.co',
    'https://demo-project.supabase.co.'
  ]) {
    const result = validateSupabaseUrl(value);

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.match(result.error, /valid hostname/i);
    }
  }
});

test('allows localhost HTTP only when local development is enabled', () => {
  const allowed = validateSupabaseUrl('http://localhost:54321', { allowLocalhost: true });
  const rejected = validateSupabaseUrl('http://localhost:54321', { allowLocalhost: false });

  assert.equal(allowed.valid, true);
  if (allowed.valid) {
    assert.equal(allowed.url, 'http://localhost:54321');
  }
  assert.equal(rejected.valid, false);
});

test('rejects non-Supabase hostnames', () => {
  const result = validateSupabaseUrl('https://example.com');

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.match(result.error, /supabase\.co/i);
  }
});

test('detects and blocks privileged service-role credentials and database passwords', () => {
  assert.equal(isPrivilegedCredential('sb_secret_abcdef123456'), true);
  assert.equal(isPrivilegedCredential('sbp_test_token_123'), true);
  assert.equal(isPrivilegedCredential('postgresql://postgres:password123@db.supabase.co:5432/postgres'), true);
  assert.equal(isPrivilegedCredential('postgres://postgres:password123@db.supabase.co:5432/postgres'), true);

  // JWT with service_role
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const serviceRolePayload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  const anonPayload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url');
  const dummySignature = 'sig12345';

  assert.equal(isPrivilegedCredential(`${header}.${serviceRolePayload}.${dummySignature}`), true);
  assert.equal(isPrivilegedCredential(`${header}.${anonPayload}.${dummySignature}`), false);
  assert.equal(isPrivilegedCredential('sbp-anon-key-placeholder'), false);
  assert.equal(isPrivilegedCredential(''), false);
  assert.equal(isPrivilegedCredential(undefined), false);
});
