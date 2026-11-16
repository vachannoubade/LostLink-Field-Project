import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPhotoSuggestion, parsePhotoSuggestion, isHardwarePhotoAdapter } from '../src/lib/photoAssist.ts';

test('accepts a bounded photo suggestion, including a fenced JSON response', () => {
  const result = parsePhotoSuggestion('```json\n{"title":"Blue backpack","category":"Bags","color":"Blue","description":"A blue backpack with black straps."}\n```');
  assert.equal(result.category, 'Bags');
  assert.equal(result.title, 'Blue backpack');
});

test('rejects malformed or oversized model responses instead of inventing details', () => {
  for (const output of ['not JSON', '[]', 'null', 'x'.repeat(6001)]) {
    assert.throws(() => parsePhotoSuggestion(output));
  }
});

test('unknown fields, unsupported categories and missing details never become form values', () => {
  assert.deepEqual(parsePhotoSuggestion(JSON.stringify({
    title: 'unknown', category: 'Pets', color: 12, description: null,
    location: 'Central Library', date: '2026-01-01', privateEvidence: 'invented secret',
  })), { title: null, category: null, color: null, description: null });
});

test('filters identifiers, contact information and markup from suggestions', () => {
  for (const description of ['Email student@example.com', 'Student ID 12345678', 'Call +91 98765 43210', '<script>alert(1)</script>']) {
    assert.equal(parsePhotoSuggestion(JSON.stringify({ description })).description, null);
  }
  assert.deepEqual(parsePhotoSuggestion('{"title":"Student card","category":"ID Cards","color":"Blue","description":"A card."}'),
    { title: null, category: null, color: null, description: null });
});

test('enforces existing form length and word limits', () => {
  const result = parsePhotoSuggestion(JSON.stringify({ title: 'bag', color: 'x'.repeat(51), description: 'word '.repeat(101) }));
  assert.deepEqual(result, { title: null, category: null, color: null, description: null });
});

test('only explicitly accepted fields change; location, date and private evidence survive', () => {
  const current = { title: 'My original title', category: 'Other', color: 'Navy', description: 'My original description', location: 'Library', date: '2026-01-01', privateEvidence: 'Private marker' };
  const suggestion = parsePhotoSuggestion('{"title":"Blue backpack","category":"Bags","color":"Blue","description":"A blue backpack."}');
  assert.deepEqual(applyPhotoSuggestion(current, suggestion, []), current);
  assert.deepEqual(applyPhotoSuggestion(current, suggestion, ['title', 'category']), {
    ...current, title: 'Blue backpack', category: 'Bags',
  });
  assert.equal(current.title, 'My original title');
});

test('null suggestions cannot erase information', () => {
  const current = { title: 'My blue bag', category: 'Bags', color: 'Navy', description: 'Original text' };
  const empty = parsePhotoSuggestion('{}');
  assert.deepEqual(applyPhotoSuggestion(current, empty, ['title', 'category', 'color', 'description']), current);
});

test('software-only GPU adapters are rejected before model downloads', () => {
  assert.equal(isHardwarePhotoAdapter(null), false);
  assert.equal(isHardwarePhotoAdapter({ isFallbackAdapter: true }), false);
  assert.equal(isHardwarePhotoAdapter({ info: { isFallbackAdapter: true } }), false);
  assert.equal(isHardwarePhotoAdapter({ info: { architecture: 'swiftshader' } }), false);
  assert.equal(isHardwarePhotoAdapter({ info: { description: 'llvmpipe software renderer' } }), false);
  assert.equal(isHardwarePhotoAdapter({ info: { architecture: 'integrated-gpu' } }), true);
  assert.equal(isHardwarePhotoAdapter({}), true); // Older browsers do not expose adapter information.
});

test('document-like responses are withheld even when miscategorised by the model', () => {
  assert.deepEqual(parsePhotoSuggestion('{"title":"Student ID card","category":"Other","color":"Blue","description":"A campus card."}'),
    { title: null, category: null, color: null, description: null });
});
