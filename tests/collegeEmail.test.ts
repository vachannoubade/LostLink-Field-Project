import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLEGE_EMAIL_DOMAIN,
  getPrnFromCollegeEmail,
  isCollegeEmail,
  normalizeCollegeEmail
} from '../src/lib/collegeEmail.ts';

test('college email domain is sguk.ac.in', () => {
  assert.equal(COLLEGE_EMAIL_DOMAIN, 'sguk.ac.in');
});

test('accepts PRN-based college emails', () => {
  assert.equal(isCollegeEmail('22CS1042@sguk.ac.in'), true);
  assert.equal(isCollegeEmail('abc.def@sguk.ac.in'), true);
  assert.equal(getPrnFromCollegeEmail('22CS1042@sguk.ac.in'), '22cs1042');
});

test('normalizes whitespace and casing', () => {
  assert.equal(normalizeCollegeEmail('  22CS1042@SGUK.AC.IN '), '22cs1042@sguk.ac.in');
  assert.equal(getPrnFromCollegeEmail('  22CS1042@SGUK.AC.IN '), '22cs1042');
});

test('rejects non-college, empty, malformed, and subdomain addresses', () => {
  assert.equal(isCollegeEmail('student@gmail.com'), false);
  assert.equal(isCollegeEmail('@sguk.ac.in'), false);
  assert.equal(isCollegeEmail('a@sguk.ac.in'), false);
  assert.equal(isCollegeEmail('22cs1042@mail.sguk.ac.in'), false);
  assert.equal(isCollegeEmail('22cs1042@sguk.ac.in.evil.test'), false);
  assert.equal(getPrnFromCollegeEmail('student@gmail.com'), null);
});
