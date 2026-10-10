import type { Report, MatchScore } from '../types';

export const calculateMatchScore = (lost: Report, found: Report): MatchScore => {
  let score = 0;
  const reasons: string[] = [];

  if (lost.type === found.type) {
    return { score: 0, reasons: [] }; // Cannot match two lost or two found
  }

  // 1. Category Match (High weight)
  if (lost.category === found.category) {
    score += 40;
    reasons.push('Same category');
  } else {
    return { score: 0, reasons: ['Different categories'] }; // Must be same category to even consider
  }

  // 2. Location Proximity (Medium weight)
  if (lost.location.toLowerCase().includes(found.location.toLowerCase()) ||
      found.location.toLowerCase().includes(lost.location.toLowerCase())) {
    score += 20;
    reasons.push('Similar location reported');
  }

  // 3. Text Similarity (Description & Title) (High weight)
  const lostText = `${lost.title} ${lost.description}`.toLowerCase();
  const foundText = `${found.title} ${found.description}`.toLowerCase();
  
  // Very basic stopword removal and keyword extraction
  const stopwords = ['the', 'and', 'with', 'left', 'found', 'lost', 'some', 'near'];
  const extractKeywords = (text: string) => text.split(/\W+/).filter(w => w.length > 2 && !stopwords.includes(w));
  
  const lostKeywords = extractKeywords(lostText);
  const foundKeywords = extractKeywords(foundText);
  
  const commonKeywords = [...new Set(lostKeywords.filter(k => foundKeywords.includes(k)))];
  
  if (commonKeywords.length > 0) {
    const keywordScore = Math.min(30, commonKeywords.length * 10);
    score += keywordScore;
    reasons.push(`Matching keywords: ${commonKeywords.join(', ')}`);
  }

  // 4. Date Proximity (Low weight)
  const lostDate = new Date(lost.date).getTime();
  const foundDate = new Date(found.date).getTime();
  const diffDays = (foundDate - lostDate) / (1000 * 3600 * 24);
  
  // Found date should ideally be on or after lost date
  if (diffDays >= 0 && diffDays <= 2) {
    score += 10;
    reasons.push('Reported within 2 days');
  } else if (diffDays >= 0 && diffDays <= 7) {
    score += 5;
    reasons.push('Reported within a week');
  }

  return {
    score: Math.min(100, score),
    reasons
  };
};
