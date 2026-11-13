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
  assert.equal(isCollegeEmail('242631003@sguk.ac.in'), true);
  assert.equal(isCollegeEmail('2024010042@sguk.ac.in'), true);
  assert.equal(isCollegeEmail('221042@sguk.ac.in'), true);
  assert.equal(getPrnFromCollegeEmail('242631003@sguk.ac.in'), '242631003');
});

test('normalizes whitespace and casing', () => {
  assert.equal(normalizeCollegeEmail('  242631003@SGUK.AC.IN '), '242631003@sguk.ac.in');
  assert.equal(getPrnFromCollegeEmail('  242631003@SGUK.AC.IN '), '242631003');
});

test('rejects non-college, empty, malformed, non-numeric, and subdomain addresses', () => {
  assert.equal(isCollegeEmail('22CS1042@sguk.ac.in'), false);
  assert.equal(isCollegeEmail('abc.def@sguk.ac.in'), false);
  assert.equal(isCollegeEmail('student@gmail.com'), false);
  assert.equal(isCollegeEmail('@sguk.ac.in'), false);
  assert.equal(isCollegeEmail('a@sguk.ac.in'), false);
  assert.equal(isCollegeEmail('12345@sguk.ac.in'), false);
  assert.equal(isCollegeEmail('242631003@mail.sguk.ac.in'), false);
  assert.equal(isCollegeEmail('242631003@sguk.ac.in.evil.test'), false);
  assert.equal(getPrnFromCollegeEmail('student@gmail.com'), null);
  assert.equal(getPrnFromCollegeEmail('abc.def@sguk.ac.in'), null);
  assert.equal(getPrnFromCollegeEmail('22CS1042@sguk.ac.in'), null);
});
