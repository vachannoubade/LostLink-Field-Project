import type { Report, MatchScore, Match } from '../types';

// Normalization helpers
const normalize = (val?: string | null): string => (val || '').trim().toLowerCase();

const STOPWORDS = new Set([
  'the', 'and', 'with', 'left', 'found', 'lost', 'some', 'near', 'this',
  'that', 'from', 'have', 'been', 'there', 'here', 'where', 'what', 'when',
  'which', 'will', 'would', 'could', 'should', 'about', 'after', 'before',
  'between', 'into', 'through', 'during', 'over', 'under', 'above', 'below',
  'please', 'help', 'item', 'contact', 'anyone', 'someone', 'around', 'very',
  'just', 'also', 'their', 'them', 'they', 'your', 'ours', 'mine', 'were',
  'was', 'are', 'is', 'for', 'our'
]);

// Strip common word endings (simple stemmer for plurals/suffixes)
const stem = (word: string): string => {
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  return word;
};

// Safe token extractor
const extractTokens = (text?: string | null): string[] => {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
  return words;
};

const extractStems = (text?: string | null): Set<string> => {
  const tokens = extractTokens(text);
  return new Set(tokens.map(stem));
};

const parseDateSafe = (dateStr?: string | null): number | null => {
  if (!dateStr) return null;
  const time = new Date(dateStr).getTime();
  return isNaN(time) ? null : time;
};

/**
 * Calculates a match score between two reports.
 * Returns score (0 - 100) and human-readable match factors.
 */
export const calculateMatchScore = (itemA: Report, itemB: Report): MatchScore => {
  if (!itemA || !itemB) {
    return { score: 0, reasons: [] };
  }

  // 1. Same item check
  if (itemA.id && itemB.id && itemA.id === itemB.id) {
    return { score: 0, reasons: ['Cannot match report with itself'] };
  }

  // 2. Both reports must be active (not resolved)
  if (normalize(itemA.status) === 'resolved' || normalize(itemB.status) === 'resolved') {
    return { score: 0, reasons: ['Resolved reports cannot be matched'] };
  }

  // 3. Directionality / Type check
  const typeA = normalize(itemA.type);
  const typeB = normalize(itemB.type);

  if ((typeA === 'lost' && typeB === 'lost') || (typeA === 'found' && typeB === 'found')) {
    return { score: 0, reasons: ['Both reports are of the same type'] };
  }

  if ((typeA !== 'lost' && typeA !== 'found') || (typeB !== 'lost' && typeB !== 'found')) {
    return { score: 0, reasons: ['Invalid report type'] };
  }

  // Assign lost and found unambiguously
  const lost = typeA === 'lost' ? itemA : itemB;
  const found = typeA === 'found' ? itemA : itemB;

  let score = 0;
  const reasons: string[] = [];

  // --- A. Category Agreement (Up to 40 points) ---
  const catLost = normalize(lost.category);
  const catFound = normalize(found.category);

  if (catLost && catFound && catLost === catFound) {
    score += 40;
    reasons.push(`Same category (${lost.category})`);
  } else if (!catLost || !catFound) {
    // Missing category on one
    score += 0;
  } else {
    // Different categories
    // If categories are completely different and no strong keyword overlap, discard early
    const titleStemsLost = extractStems(lost.title);
    const titleStemsFound = extractStems(found.title);
    const sharedTitleStems = [...titleStemsLost].filter(s => titleStemsFound.has(s));
    if (sharedTitleStems.length === 0) {
      return { score: 0, reasons: ['Different categories and no shared title keywords'] };
    }
    // Allow partial consideration if titles share significant keywords
    reasons.push(`Different categories (${lost.category} vs ${found.category})`);
  }

  // --- B. Location Proximity (Up to 25 points) ---
  const zoneLost = normalize(lost.campusZone);
  const zoneFound = normalize(found.campusZone);
  const locLost = normalize(lost.location);
  const locFound = normalize(found.location);

  let locationMatched = false;

  // 1. Same campus zone quick-pick
  if (zoneLost && zoneFound && zoneLost === zoneFound) {
    score += 20;
    locationMatched = true;
    reasons.push(`Same campus zone (${lost.campusZone})`);
  } else if (
    (zoneLost && (locFound.includes(zoneLost) || zoneFound.includes(zoneLost))) ||
    (zoneFound && (locLost.includes(zoneFound) || zoneLost.includes(zoneFound)))
  ) {
    score += 18;
    locationMatched = true;
    reasons.push('Campus zone referenced in location');
  } else if (locLost && locFound) {
    // 2. Direct string inclusion or shared significant location tokens
    if (locLost.includes(locFound) || locFound.includes(locLost)) {
      score += 20;
      locationMatched = true;
      reasons.push('Location descriptions align');
    } else {
      const locStemsLost = extractStems(locLost);
      const locStemsFound = extractStems(locFound);
      const sharedLoc = [...locStemsLost].filter(s => locStemsFound.has(s));
      if (sharedLoc.length > 0) {
        score += Math.min(18, sharedLoc.length * 8);
        locationMatched = true;
        reasons.push(`Location proximity (${sharedLoc.slice(0, 2).join(', ')})`);
      }
    }
  }

  // Additional detail bonus if both mention a specific sub-area (e.g. "floor", "bench", "room")
  if (locationMatched && locLost && locFound) {
    const detailTokens = ['floor', 'room', 'bench', 'table', 'desk', 'gate', 'door', 'quad', 'stairs', 'lobby'];
    const matchedDetails = detailTokens.filter(d => locLost.includes(d) && locFound.includes(d));
    if (matchedDetails.length > 0) {
      score += 5;
      reasons.push(`Specific area detail match (${matchedDetails[0]})`);
    }
  }

  // --- C. Text Similarity: Title & Description (Up to 25 points) ---
  const titleStemsLost = extractStems(lost.title);
  const titleStemsFound = extractStems(found.title);
  const sharedTitleStems = [...titleStemsLost].filter(s => titleStemsFound.has(s));

  if (sharedTitleStems.length > 0) {
    const titleScore = Math.min(18, sharedTitleStems.length * 9);
    score += titleScore;
    reasons.push(`Title keywords: ${sharedTitleStems.join(', ')}`);
  }

  // Description stems
  const descStemsLost = extractStems(lost.description);
  const descStemsFound = extractStems(found.description);
  const sharedDescStems = [...descStemsLost].filter(s => descStemsFound.has(s) && !titleStemsLost.has(s));

  if (sharedDescStems.length > 0) {
    const descScore = Math.min(10, sharedDescStems.length * 5);
    score += descScore;
    reasons.push(`Description details: ${sharedDescStems.slice(0, 3).join(', ')}`);
  }

  // --- D. Date Proximity (Up to 15 points) ---
  const timeLost = parseDateSafe(lost.date);
  const timeFound = parseDateSafe(found.date);

  if (timeLost !== null && timeFound !== null) {
    const diffDays = Math.round((timeFound - timeLost) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      score += 15;
      reasons.push('Reported on exact same date');
    } else if (diffDays >= 1 && diffDays <= 3) {
      score += 12;
      reasons.push(`Found within ${diffDays} day${diffDays === 1 ? '' : 's'} of loss`);
    } else if (diffDays >= 4 && diffDays <= 7) {
      score += 8;
      reasons.push('Reported within the same week');
    } else if (diffDays === -1 || diffDays === -2) {
      score += 8;
      reasons.push('Dates align within 1-2 days');
    } else if (Math.abs(diffDays) <= 14) {
      score += 4;
      reasons.push('Reported within two weeks');
    }
  }

  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    reasons
  };
};

/**
 * Generates deduplicated candidate matches from an array of reports.
 * Sorted highest confidence first.
 */
export const generateMatches = (reports: Report[]): Match[] => {
  if (!reports || reports.length === 0) return [];

  const activeLost = reports.filter(r => 
    normalize(r.type) === 'lost' && normalize(r.status) !== 'resolved'
  );
  const activeFound = reports.filter(r => 
    normalize(r.type) === 'found' && normalize(r.status) !== 'resolved'
  );

  if (activeLost.length === 0 || activeFound.length === 0) return [];

  const candidateMatches: Match[] = [];
  const seenPairKeys = new Set<string>();

  for (const lost of activeLost) {
    for (const found of activeFound) {
      // Exclude same report matching itself
      if (lost.id === found.id) continue;

      // Deduplicate pair
      const pairKey = [lost.id, found.id].sort().join('::');
      if (seenPairKeys.has(pairKey)) continue;
      seenPairKeys.add(pairKey);

      const matchScore = calculateMatchScore(lost, found);

      // Threshold: candidate must have a score >= 45 OR (score >= 40 with at least 2 distinct matching factors)
      if (matchScore.score >= 45 || (matchScore.score >= 40 && matchScore.reasons.length >= 2)) {
        candidateMatches.push({
          id: `match_${lost.id}_${found.id}`,
          lostReportId: lost.id,
          foundReportId: found.id,
          score: matchScore,
          status: 'pending',
          createdAt: new Date().toISOString()
        });
      }
    }
  }

  // Sort candidates by score, highest first
  candidateMatches.sort((a, b) => b.score.score - a.score.score);

  return candidateMatches;
};
