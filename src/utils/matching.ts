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
  'was', 'are', 'is', 'for', 'our', 'side'
]);

// SGUK Campus Zones List
export const SGUK_CAMPUS_ZONES = [
  'Main Building / Admin',
  'Academic Block A',
  'Academic Block B',
  'Engineering Workshop',
  'Central Library',
  'Main Cafeteria / Food Court',
  'Boys Hostel Block',
  'Girls Hostel Block',
  'Sports Ground / Arena',
  'Parking Zone 1 & 2',
  'Other / Transit Area'
];

// SGUK Campus Zone Proximity Relationships
// Zones that are adjacent or share a common campus quad
const ADJACENT_ZONES: Record<string, string[]> = {
  'main library': ['student center', 'administrative building', 'central cafeteria'],
  'student center': ['main library', 'central cafeteria', 'engineering block'],
  'central cafeteria': ['main library', 'student center', 'hostels'],
  'engineering block': ['science building', 'student center', 'bus bay'],
  'science building': ['engineering block', 'main library', 'sports complex'],
  'sports complex': ['science building', 'hostels', 'bus bay'],
  'hostels': ['central cafeteria', 'sports complex'],
  'bus bay': ['engineering block', 'sports complex', 'administrative building'],
  'administrative building': ['main library', 'bus bay', 'student center']
};

// Known color tokens for contradiction detection
const COMMON_COLORS = new Set([
  'black', 'white', 'blue', 'navy', 'red', 'green', 'yellow', 'silver',
  'grey', 'gray', 'gold', 'pink', 'purple', 'brown', 'orange', 'cyan', 'maroon'
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
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
};

const extractStems = (text?: string | null): Set<string> => {
  const tokens = extractTokens(text);
  return new Set(tokens.map(stem));
};

const extractColors = (text?: string | null): Set<string> => {
  if (!text) return new Set();
  const tokens = extractTokens(text);
  const found = new Set<string>();
  for (const t of tokens) {
    if (COMMON_COLORS.has(t)) found.add(t);
  }
  return found;
};

const parseDateSafe = (dateStr?: string | null): number | null => {
  if (!dateStr) return null;
  const time = new Date(dateStr).getTime();
  return isNaN(time) ? null : time;
};

/**
 * Calculates a match score between two reports based on the finalized 100-point breakdown:
 *   1. Category compatibility: 20 points
 *   2. Title/type similarity: 15 points
 *   3. Brand, model, color and distinctive attributes: 30 points
 *   4. Campus location proximity: 20 points
 *   5. Chronological plausibility: 15 points
 * Total: 100 points.
 *
 * Contradictory attributes deduct points. Missing information is NOT treated as positive evidence.
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

  // 3. Directionality check: exactly one lost and one found report
  const typeA = normalize(itemA.type);
  const typeB = normalize(itemB.type);

  if ((typeA === 'lost' && typeB === 'lost') || (typeA === 'found' && typeB === 'found')) {
    return { score: 0, reasons: ['Both reports are of the same type'] };
  }

  if ((typeA !== 'lost' && typeA !== 'found') || (typeB !== 'lost' && typeB !== 'found')) {
    return { score: 0, reasons: ['Invalid report type'] };
  }

  const lost = typeA === 'lost' ? itemA : itemB;
  const found = typeA === 'found' ? itemA : itemB;

  let score = 0;
  const reasons: string[] = [];

  // ---------------------------------------------------------------------------
  // Component 1: Category Compatibility (20 points max)
  // ---------------------------------------------------------------------------
  const catLost = normalize(lost.category);
  const catFound = normalize(found.category);

  if (catLost && catFound && catLost === catFound) {
    score += 20;
    reasons.push(`Same category (${lost.category})`);
  } else if (catLost && catFound && catLost !== catFound) {
    const titleStemsLost = extractStems(lost.title);
    const titleStemsFound = extractStems(found.title);
    const sharedTitleStems = [...titleStemsLost].filter(s => titleStemsFound.has(s));

    if (sharedTitleStems.length === 0) {
      return { score: 0, reasons: ['Different categories and no shared title keywords'] };
    }
    // Partial consideration if category differs but title is identical
    score += 5;
    reasons.push(`Cross-category match (${lost.category} vs ${found.category})`);
  }

  // ---------------------------------------------------------------------------
  // Component 2: Title / Type Similarity (15 points max)
  // ---------------------------------------------------------------------------
  const titleStemsLost = extractStems(lost.title);
  const titleStemsFound = extractStems(found.title);
  const sharedTitleStems = [...titleStemsLost].filter(s => titleStemsFound.has(s));

  if (sharedTitleStems.length > 0) {
    const pts = Math.min(15, sharedTitleStems.length * 8);
    score += pts;
    reasons.push(`Title keywords: ${sharedTitleStems.join(', ')}`);
  }

  // ---------------------------------------------------------------------------
  // Component 3: Brand, Model, Color & Distinctive Attributes (30 points max)
  // ---------------------------------------------------------------------------
  let attrScore = 0;

  // Brand / Model
  const brandLost = normalize(lost.brandModel);
  const brandFound = normalize(found.brandModel);
  if (brandLost && brandFound) {
    if (brandLost === brandFound || brandLost.includes(brandFound) || brandFound.includes(brandLost)) {
      attrScore += 12;
      reasons.push(`Matching brand/model (${lost.brandModel})`);
    } else {
      // Contradictory brands
      attrScore -= 10;
      reasons.push(`Contradictory brand (${lost.brandModel} vs ${found.brandModel})`);
    }
  }

  // Colors
  const colorsLost = extractColors([lost.color, lost.title, lost.description].join(' '));
  const colorsFound = extractColors([found.color, found.title, found.description].join(' '));

  if (colorsLost.size > 0 && colorsFound.size > 0) {
    const sharedColors = [...colorsLost].filter(c => colorsFound.has(c));
    if (sharedColors.length > 0) {
      attrScore += 10;
      reasons.push(`Matching color: ${sharedColors.join(', ')}`);
    } else {
      // Strong contradictory color: penalize score
      attrScore -= 8;
      reasons.push(`Different color characteristics (${[...colorsLost].join('/')} vs ${[...colorsFound].join('/')})`);
    }
  }

  // Distinguishing features & description stems
  const descStemsLost = extractStems([lost.distinguishingFeatures, lost.description].join(' '));
  const descStemsFound = extractStems([found.distinguishingFeatures, found.description].join(' '));
  const sharedDescStems = [...descStemsLost].filter(s => descStemsFound.has(s) && !titleStemsLost.has(s));

  if (sharedDescStems.length > 0) {
    const descPts = Math.min(10, sharedDescStems.length * 4);
    attrScore += descPts;
    reasons.push(`Shared descriptive details: ${sharedDescStems.slice(0, 3).join(', ')}`);
  }

  score += Math.max(-10, Math.min(30, attrScore));

  // ---------------------------------------------------------------------------
  // Component 4: Campus Location Proximity (20 points max)
  // ---------------------------------------------------------------------------
  const zoneLost = normalize(lost.campusZone);
  const zoneFound = normalize(found.campusZone);
  const locLost = normalize(lost.location);
  const locFound = normalize(found.location);

  if (zoneLost && zoneFound && zoneLost === zoneFound) {
    score += 20;
    reasons.push(`Same campus zone (${lost.campusZone})`);
  } else if (zoneLost && zoneFound && ADJACENT_ZONES[zoneLost]?.includes(zoneFound)) {
    score += 12;
    reasons.push(`Adjacent campus zones (${lost.campusZone} / ${found.campusZone})`);
  } else if (
    (zoneLost && (locFound.includes(zoneLost) || zoneFound.includes(zoneLost))) ||
    (zoneFound && (locLost.includes(zoneFound) || zoneLost.includes(zoneFound)))
  ) {
    score += 15;
    reasons.push('Campus zone referenced in location detail');
  } else if (locLost && locFound) {
    if (locLost.includes(locFound) || locFound.includes(locLost)) {
      score += 15;
      reasons.push('Location descriptions align');
    } else {
      const locStemsLost = extractStems(locLost);
      const locStemsFound = extractStems(locFound);
      const sharedLoc = [...locStemsLost].filter(s => locStemsFound.has(s));
      if (sharedLoc.length > 0) {
        score += Math.min(14, sharedLoc.length * 7);
        reasons.push(`Location proximity (${sharedLoc.slice(0, 2).join(', ')})`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Component 5: Chronological Plausibility (15 points max)
  // ---------------------------------------------------------------------------
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
    } else if (diffDays >= 8 && diffDays <= 14) {
      score += 4;
      reasons.push('Reported within two weeks');
    } else if (diffDays < 0) {
      // Contradiction: Item was reportedly "found" before it was lost!
      if (diffDays >= -2) {
        score += 3;
        reasons.push('Dates align within 1-2 days (potential reporting delay)');
      } else {
        score -= 10;
        reasons.push('Chronological mismatch: found date precedes loss date by more than 2 days');
      }
    }
  }

  const finalScore = Math.min(100, Math.max(0, Math.round(score)));

  return {
    score: finalScore,
    reasons
  };
};

/**
 * Categorizes a score into deterministic advisory tiers.
 * These thresholds are initial engineering heuristics, not calibrated probabilities.
 */
export const getCandidateTier = (score: number): {
  tier: 'strong' | 'possible' | 'weak' | 'unrecommended';
  label: string;
} => {
  if (score >= 85) return { tier: 'strong', label: 'Strong possible match (85–100)' };
  if (score >= 65) return { tier: 'possible', label: 'Possible match (65–84)' };
  if (score >= 45) return { tier: 'weak', label: 'Weak similarity (45–64)' };
  return { tier: 'unrecommended', label: 'Not recommended automatically (<45)' };
};

/**
 * Generates deduplicated candidate matches from active reports.
 * Sorted highest confidence first. Advisory discovery only.
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
      if (lost.id === found.id) continue;

      const pairKey = [lost.id, found.id].sort().join('::');
      if (seenPairKeys.has(pairKey)) continue;
      seenPairKeys.add(pairKey);

      const matchScore = calculateMatchScore(lost, found);

      // Only recommend candidates in the weak, possible, or strong tiers (score >= 45)
      if (matchScore.score >= 45) {
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

  candidateMatches.sort((a, b) => b.score.score - a.score.score);
  return candidateMatches;
};
