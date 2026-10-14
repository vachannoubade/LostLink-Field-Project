import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMatchScore, generateMatches } from '../src/utils/matching.ts';
import type { Report } from '../src/types.ts';

// Helper to create mock reports with sensible defaults
function createReport(overrides: Partial<Report>): Report {
  return {
    id: `r_${Math.random().toString(36).slice(2, 9)}`,
    title: 'Test Item',
    description: 'Test item description with details',
    category: 'Electronics',
    type: 'lost',
    status: 'lost',
    location: 'Main Library 2nd Floor',
    campusZone: 'Central Campus',
    date: '2026-10-12',
    userId: 'user_1',
    createdAt: '2026-10-12T10:00:00.000Z',
    ...overrides
  };
}

test('AI Matching Suite - Case 1: Exact category, location, and description match', () => {
  const lost = createReport({
    id: 'lost_1',
    type: 'lost',
    status: 'lost',
    title: 'Hydro Flask 32oz Navy Blue',
    category: 'Accessories',
    campusZone: 'Central Campus',
    location: 'Main Library 2nd Floor quiet study room',
    description: 'Navy blue hydro flask water bottle with national park stickers on side',
    date: '2026-10-12'
  });

  const found = createReport({
    id: 'found_1',
    type: 'found',
    status: 'found',
    title: 'Hydro Flask 32oz Navy Blue',
    category: 'Accessories',
    campusZone: 'Central Campus',
    location: 'Main Library 2nd Floor quiet study room',
    description: 'Navy blue hydro flask water bottle with national park stickers on side',
    date: '2026-10-12'
  });

  const result = calculateMatchScore(lost, found);

  assert.ok(result.score >= 80, `Expected score >= 80, got ${result.score}`);
  assert.ok(result.reasons.some(r => r.includes('Same category')), 'Missing category reason');
  assert.ok(result.reasons.some(r => r.includes('Same campus zone') || r.includes('Location')), 'Missing location reason');
  assert.ok(result.reasons.some(r => r.includes('Title keywords')), 'Missing title reason');
  assert.ok(result.reasons.some(r => r.includes('exact same date')), 'Missing date reason');
});

test('AI Matching Suite - Case 2: Same item described using different words', () => {
  const lost = createReport({
    id: 'lost_airpods',
    type: 'lost',
    status: 'lost',
    title: 'Apple AirPods Pro',
    category: 'Electronics',
    campusZone: 'North Campus',
    location: 'Near engineering quad bench',
    description: 'White wireless earbuds in a matte silicone case left on bench',
    date: '2026-10-10'
  });

  const found = createReport({
    id: 'found_airpods',
    type: 'found',
    status: 'found',
    title: 'AirPods wireless earphones',
    category: 'Electronics',
    campusZone: 'North Campus',
    location: 'Engineering quad outdoor seating desk',
    description: 'Found white earbuds silicone case near bench',
    date: '2026-10-11'
  });

  const result = calculateMatchScore(lost, found);

  assert.ok(result.score >= 60, `Expected score >= 60 for synonym/stem overlap, got ${result.score}`);
  assert.ok(result.reasons.some(r => r.includes('Same category')), 'Missing category match');
  assert.ok(result.reasons.some(r => r.includes('North Campus') || r.includes('quad')), 'Missing zone/location match');
  assert.ok(result.reasons.some(r => r.includes('earbud') || r.includes('silicone') || r.includes('airpod')), 'Missing stem matches');
});

test('AI Matching Suite - Case 3: Lost-to-Lost and Found-to-Found pairs are excluded', () => {
  const lostA = createReport({ id: 'l1', type: 'lost', status: 'lost', category: 'Electronics' });
  const lostB = createReport({ id: 'l2', type: 'lost', status: 'lost', category: 'Electronics' });
  const foundA = createReport({ id: 'f1', type: 'found', status: 'found', category: 'Electronics' });
  const foundB = createReport({ id: 'f2', type: 'found', status: 'found', category: 'Electronics' });

  const lostToLost = calculateMatchScore(lostA, lostB);
  assert.strictEqual(lostToLost.score, 0);
  assert.ok(lostToLost.reasons.includes('Both reports are of the same type'));

  const foundToFound = calculateMatchScore(foundA, foundB);
  assert.strictEqual(foundToFound.score, 0);
  assert.ok(foundToFound.reasons.includes('Both reports are of the same type'));

  const matchesLostOnly = generateMatches([lostA, lostB]);
  assert.strictEqual(matchesLostOnly.length, 0);

  const matchesFoundOnly = generateMatches([foundA, foundB]);
  assert.strictEqual(matchesFoundOnly.length, 0);
});

test('AI Matching Suite - Case 4: Null descriptions and missing dates do not crash the algorithm', () => {
  const lost = createReport({
    id: 'lost_missing',
    type: 'lost',
    status: 'lost',
    title: 'Water Bottle',
    description: '',
    category: 'Accessories',
    campusZone: undefined,
    location: '',
    date: ''
  });

  const found = createReport({
    id: 'found_missing',
    type: 'found',
    status: 'found',
    title: 'Water Bottle',
    description: null as unknown as string,
    category: 'Accessories',
    campusZone: undefined,
    location: undefined as unknown as string,
    date: 'invalid-date-string'
  });

  // Must not throw TypeError or RangeError
  assert.doesNotThrow(() => {
    const result = calculateMatchScore(lost, found);
    assert.ok(typeof result.score === 'number');
    assert.ok(Array.isArray(result.reasons));
  });

  assert.doesNotThrow(() => {
    const matches = generateMatches([lost, found]);
    assert.ok(Array.isArray(matches));
  });
});

test('AI Matching Suite - Case 5: Duplicate pairs and inverted pairs are removed', () => {
  const lost = createReport({
    id: 'lost_pair',
    type: 'lost',
    status: 'lost',
    title: 'Calculator TI-84 Plus',
    category: 'Electronics',
    location: 'Science Hall 101'
  });

  const found = createReport({
    id: 'found_pair',
    type: 'found',
    status: 'found',
    title: 'TI-84 Graphing Calculator',
    category: 'Electronics',
    location: 'Science Hall 101'
  });

  // Self-matching check
  const selfMatch = calculateMatchScore(lost, lost);
  assert.strictEqual(selfMatch.score, 0);
  assert.ok(selfMatch.reasons.includes('Cannot match report with itself'));

  // Test pair generation: should only contain 1 match, not 2
  const matches = generateMatches([lost, found]);
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].lostReportId, lost.id);
  assert.strictEqual(matches[0].foundReportId, found.id);

  // Inverted input order to calculateMatchScore produces symmetric valid results
  const directScore = calculateMatchScore(lost, found);
  const invertedScore = calculateMatchScore(found, lost);
  assert.strictEqual(directScore.score, invertedScore.score);
});

test('AI Matching Suite - Case 6: Low-quality candidate is not ranked above strong candidate', () => {
  const lost = createReport({
    id: 'lost_macbook',
    type: 'lost',
    status: 'lost',
    title: 'MacBook Pro 14 M2 Space Gray',
    category: 'Electronics',
    campusZone: 'Central Campus',
    location: 'Library 3rd floor study room',
    description: 'Space gray MacBook Pro 14-inch in black neoprene sleeve',
    date: '2026-10-10'
  });

  const foundStrong = createReport({
    id: 'found_macbook',
    type: 'found',
    status: 'found',
    title: 'MacBook Pro laptop',
    category: 'Electronics',
    campusZone: 'Central Campus',
    location: 'Library 3rd floor',
    description: 'Found space gray MacBook laptop in neoprene sleeve',
    date: '2026-10-10'
  });

  const foundWeak = createReport({
    id: 'found_umbrella',
    type: 'found',
    status: 'found',
    title: 'Black Umbrella',
    category: 'Clothing',
    campusZone: 'Athletics & Recreation',
    location: 'Gym locker room bench',
    description: 'Standard black foldable umbrella',
    date: '2026-09-01'
  });

  const strongScore = calculateMatchScore(lost, foundStrong);
  const weakScore = calculateMatchScore(lost, foundWeak);

  assert.ok(strongScore.score >= 70, `Expected strong score >= 70, got ${strongScore.score}`);
  assert.ok(weakScore.score < 20, `Expected weak score < 20, got ${weakScore.score}`);
  assert.ok(strongScore.score > weakScore.score + 50);

  const matches = generateMatches([lost, foundStrong, foundWeak]);
  assert.ok(matches.length >= 1);
  assert.strictEqual(matches[0].foundReportId, foundStrong.id, 'Strong candidate must be ranked first');

  // If weak candidate passed threshold, verify it is ranked second
  if (matches.length > 1) {
    assert.strictEqual(matches[1].foundReportId, foundWeak.id);
    assert.ok(matches[0].score.score >= matches[1].score.score);
  }
});

test('AI Matching Suite - Case 7: Empty data returns a valid empty result', () => {
  const emptyMatches = generateMatches([]);
  assert.deepStrictEqual(emptyMatches, []);

  const nullScore = calculateMatchScore(null as unknown as Report, null as unknown as Report);
  assert.strictEqual(nullScore.score, 0);
  assert.deepStrictEqual(nullScore.reasons, []);

  const singleLost = generateMatches([createReport({ type: 'lost', status: 'lost' })]);
  assert.deepStrictEqual(singleLost, []);

  const singleFound = generateMatches([createReport({ type: 'found', status: 'found' })]);
  assert.deepStrictEqual(singleFound, []);
});
