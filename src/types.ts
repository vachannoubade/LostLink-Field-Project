export type ItemStatus = 'lost' | 'found' | 'resolved';
export type Category = 'Electronics' | 'ID Cards' | 'Bags' | 'Books' | 'Accessories' | 'Keys' | 'Other';
export type ReportType = 'lost' | 'found';

export interface ItemComment {
  id: string;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  text: string;
  createdAt: string;
  isSighting?: boolean;
}

export interface Report {
  id: string;
  type: ReportType;
  title: string;
  category: Category;
  description: string;
  location: string;
  date: string; // ISO date or simple date string
  time?: string;
  imageUrl?: string;
  imagePath?: string;
  status: ItemStatus;
  userId: string;
  createdAt: string;

  // Optional human-centric community & verification metadata
  campusZone?: string;
  reporterName?: string;
  reporterRole?: string;
  reporterAvatar?: string;
  reporterVerified?: boolean;
  gratitudeNote?: string;
  urgency?: 'normal' | 'high';
  helpfulCount?: number;
  comments?: ItemComment[];
  hasPrivateVerification?: boolean;
  enhancedVerification?: boolean;
  estimatedValue?: number;
}

export interface MatchScore {
  score: number; // 0-100
  reasons: string[];
}

export interface Match {
  id: string;
  lostReportId: string;
  foundReportId: string;
  score: MatchScore;
  status: 'pending' | 'verified' | 'rejected';
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  isDemo?: boolean;

  // Optional campus profile attributes
  role?: string;
  department?: string;
  studentId?: string;
  bio?: string;
  avatarUrl?: string;
  karmaPoints?: number;
  reunionsHelped?: number;
  phone?: string;
  isAdmin?: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
  type?: 'match' | 'sighting' | 'reunion' | 'info' | 'claim';
}

export interface ReunionStory {
  id: string;
  itemTitle: string;
  category: Category;
  ownerName: string;
  finderName: string;
  location: string;
  quote: string;
  timeAgo: string;
}

// Ownership Verification & Claims Type Definitions (Reference Models)
export type ClaimStatus =
  | 'submitted'
  | 'verification_pending'
  | 'additional_evidence_required'
  | 'finder_review_required'
  | 'administrator_review_required'
  | 'approved_for_handover'
  | 'rejected'
  | 'handed_over';

export interface VerificationPromptInput {
  promptLabel: string;
  secretAnswer: string;
}

export interface PublicVerificationPrompt {
  id: string;
  promptLabel: string;
}

export interface ClaimAnswerSubmission {
  promptId: string;
  promptLabel: string;
  answer: string;
}

export interface ClaimEvidenceItem {
  id: string;
  claimId: string;
  uploadingUserId: string;
  uploaderName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  description: string;
  createdAt: string;
}

export interface ClaimAssessmentBreakdown {
  promptId: string;
  promptLabel: string;
  secretAnswer: string;
  claimantAnswer: string;
  similarity: number;
  matchLevel: 'strong' | 'partial' | 'weak';
}

export interface ClaimRecord {
  id: string;
  itemId: string;
  itemTitle: string;
  itemCategory: Category;
  itemImageUrl?: string;
  itemLocation: string;
  finderId: string;
  claimantId: string;
  claimantName: string;
  claimantEmail: string;
  explanation: string;
  submittedAnswers: ClaimAnswerSubmission[];
  truthfulnessConfirmed: boolean;
  status: ClaimStatus;
  verificationStatus: 'pending' | 'partially_matched' | 'strong_signal' | 'fallback_manual' | 'verified' | 'failed';
  automatedScore?: number;
  hasPrivateDetailsOnItem: boolean;
  riskFlags: string[];
  requiresAdminReview: boolean;
  escalationReason?: string;
  finderDecision?: {
    decision: 'approved' | 'request_evidence' | 'rejected' | 'escalated';
    reason: string;
    reviewerId: string;
    reviewerName: string;
    timestamp: string;
  };
  adminDecision?: {
    decision: 'approved' | 'request_evidence' | 'rejected' | 'returned_to_finder';
    reason: string;
    reviewerId: string;
    reviewerName: string;
    timestamp: string;
  };
  handoverConfirmation?: {
    confirmedById: string;
    confirmedByName: string;
    handoverNotes: string;
    timestamp: string;
  };
  evidence: ClaimEvidenceItem[];
  comparisonBreakdown?: ClaimAssessmentBreakdown[];
  competingClaimsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: 'claimant' | 'finder' | 'admin' | 'system';
  action: string;
  claimId?: string;
  itemId: string;
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
  timestamp: string;
}
