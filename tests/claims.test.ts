import test from 'node:test';
import assert from 'node:assert/strict';

interface ReportValidationInput {
  title: string;
  description: string;
  location: string;
  privateEvidence?: string;
}

const validateReportInput = (input: ReportValidationInput): { valid: boolean; error?: string } => {
  const title = input.title?.trim() || '';
  if (title.length < 5 || title.length > 70) {
    return { valid: false, error: 'Title must be between 5 and 70 characters.' };
  }

  const desc = input.description?.trim() || '';
  if (desc.length === 0 || desc.length > 700) {
    return { valid: false, error: 'Description must be between 1 and 700 characters.' };
  }

  const words = desc.split(/\s+/).filter(Boolean);
  if (words.length > 100) {
    return { valid: false, error: 'Description exceeds maximum allowed word count of 100 words.' };
  }

  const loc = input.location?.trim() || '';
  if (loc.length === 0 || loc.length > 100) {
    return { valid: false, error: 'Location must be between 1 and 100 characters.' };
  }

  if (input.privateEvidence && input.privateEvidence.trim().length > 300) {
    return { valid: false, error: 'Private evidence detail cannot exceed 300 characters.' };
  }

  return { valid: true };
};

const validateClaimInput = (evidence: string): { valid: boolean; error?: string } => {
  const trimmed = evidence?.trim() || '';
  if (trimmed.length < 10 || trimmed.length > 500) {
    return { valid: false, error: 'Claim evidence must be between 10 and 500 characters.' };
  }
  return { valid: true };
};

test('Report validation: Enforces title 5-70 chars, description max 700 chars and 100 words, location max 100 chars', () => {
  assert.equal(validateReportInput({
    title: 'Blue Water Bottle',
    description: 'Stainless steel bottle left in the library 2nd floor.',
    location: 'Central Library'
  }).valid, true);

  // Short title
  assert.equal(validateReportInput({
    title: 'Key',
    description: 'Found keys',
    location: 'Cafeteria'
  }).valid, false);

  // Overly long title
  assert.equal(validateReportInput({
    title: 'A'.repeat(71),
    description: 'Description text',
    location: 'Cafeteria'
  }).valid, false);

  // Word count limit (> 100 words)
  const longWordDesc = Array(105).fill('word').join(' ');
  assert.equal(validateReportInput({
    title: 'Valid Title Here',
    description: longWordDesc,
    location: 'Cafeteria'
  }).valid, false);

  // Character limit (> 700 chars)
  assert.equal(validateReportInput({
    title: 'Valid Title Here',
    description: 'a'.repeat(701),
    location: 'Cafeteria'
  }).valid, false);

  // Private evidence limit (> 300 chars)
  assert.equal(validateReportInput({
    title: 'Valid Title Here',
    description: 'Valid description text.',
    location: 'Cafeteria',
    privateEvidence: 'x'.repeat(301)
  }).valid, false);
});

test('Claim validation: Requires 10-500 chars of private identifying evidence', () => {
  assert.equal(validateClaimInput('It has a scratch on the bottom right and an anime sticker').valid, true);

  // Too short (< 10 chars)
  assert.equal(validateClaimInput('Mine').valid, false);

  // Too long (> 500 chars)
  assert.equal(validateClaimInput('a'.repeat(501)).valid, false);
});
