export type ItemStatus = 'lost' | 'found' | 'resolved';
export type Category = 'Electronics' | 'ID Cards' | 'Bags' | 'Books' | 'Accessories' | 'Keys' | 'Other';
export type ReportType = 'lost' | 'found';
export type CustodyStatus = 'with_finder' | 'handed_to_desk' | 'only_observed' | 'desk_custody_confirmed';

export interface AuditLog {
  id: string;
  action: string;
  actor_id?: string | null;
  target_id?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}

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

  // Final structured attributes
  brandModel?: string;
  color?: string;
  distinguishingFeatures?: string;
  campusZone?: string;
  custodyStatus?: 'with_finder' | 'handed_to_desk' | 'only_observed' | 'desk_custody_confirmed';
  deskLocation?: string;
  privateEvidence?: string;

  // Optional human-centric community & verification metadata
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
  prn?: string;

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

export type CampusMembershipType = 'student' | 'staff' | 'desk_operator' | 'admin';
export type CampusMembershipStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface CampusMembership {
  id: string;
  userId?: string;
  user_id?: string;
  memberName?: string;
  membershipType?: CampusMembershipType;
  membership_type?: CampusMembershipType;
  status: CampusMembershipStatus;
  approvedBy?: string;
  approved_by?: string;
  approvedAt?: string;
  approved_at?: string;
  expiresAt?: string;
  expires_at?: string;
  notes?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface StaffAllowlistEntry {
  id: string;
  email: string;
  name: string;
  department?: string;
  role: 'staff' | 'desk_operator';
  isActive?: boolean;
  is_active?: boolean;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface CampusDesk {
  id: string;
  name: string;
  zone: string;
  building: string;
  roomNumber?: string;
  hoursOfOperation?: string;
  isActive: boolean;
  isConfigured: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ClaimLifecycleStatus =
  | 'REQUESTED'
  | 'UNDER_REVIEW'
  | 'APPROVED_FOR_HANDOVER'
  | 'HANDED_OVER'
  | 'RESOLVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'DISPUTED';

export interface Claim {
  id: string;
  foundReportId?: string;
  found_report_id?: string;
  claimantId?: string;
  claimant_id?: string;
  linkedLostReportId?: string;
  linked_lost_report_id?: string;
  claimEvidence?: string;
  claim_evidence?: string;
  status: ClaimLifecycleStatus;
  reviewNotes?: string;
  review_notes?: string;
  reviewedBy?: string;
  reviewed_by?: string;
  reviewedAt?: string;
  reviewed_at?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  foundReport?: Report;
  claimantName?: string;
}

export interface HandoverRecord {
  id: string;
  claimId: string;
  foundReportId: string;
  claimantId: string;
  deskOperatorId: string;
  deskLocation: string;
  handoverStatus: 'PENDING_PHYSICAL_CONFIRMATION' | 'CUSTODY_VERIFIED' | 'COMPLETED' | 'CANCELLED';
  itemConditionNotes?: string;
  claimantIdVerified: boolean;
  receiptConfirmed: boolean;
  handedOverAt?: string;
  createdAt: string;
  updatedAt: string;
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
