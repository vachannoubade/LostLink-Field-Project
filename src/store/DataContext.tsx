import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  Report,
  Match,
  User,
  Notification,
  ReunionStory,
  ItemComment,
  ClaimRecord,
  PublicVerificationPrompt,
  VerificationPromptInput,
  AuditLogEntry
} from '../types';
import { initialReports, demoUser, initialReunionStories, initialNotifications } from './seedData';
import { calculateMatchScore } from '../utils/matching';
import { useAuth } from './AuthContext';

interface DataContextType {
  user: User;
  reports: Report[];
  matches: Match[];
  notifications: Notification[];
  reunionStories: ReunionStory[];
  selectedReport: Report | null;
  setSelectedReportId: (id: string | null) => void;
  helpedIds: string[];
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  addReport: (
    report: Omit<Report, 'id' | 'createdAt' | 'status' | 'userId'>,
    privateVerification?: {
      privatePrompts: VerificationPromptInput[];
      enhancedVerification: boolean;
      estimatedValue: number;
    }
  ) => Promise<{ ok: boolean; reportId?: string; error?: string }>;
  updateReportStatus: (id: string, status: Report['status'], gratitudeQuote?: string) => Promise<boolean>;
  deleteReport: (id: string) => Promise<boolean>;
  addComment: (reportId: string, text: string, isSighting?: boolean) => Promise<boolean>;
  toggleHelpful: (reportId: string) => void;
  updateUserProfile: (updates: Partial<User>) => Promise<boolean>;
  verifyMatch: (matchId: string) => Promise<boolean>;
  rejectMatch: (matchId: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  resetDemoData: () => void;
  // Ownership Verification & Claim System
  mySubmittedClaims: ClaimRecord[];
  incomingFinderClaims: ClaimRecord[];
  refreshClaims: () => Promise<void>;
  fetchVerificationPrompts: (itemId: string) => Promise<{
    hasPrivateDetails: boolean;
    enhancedVerification: boolean;
    estimatedValue: number;
    prompts: PublicVerificationPrompt[];
  }>;
  submitOwnershipClaim: (payload: {
    itemId: string;
    itemTitle: string;
    itemCategory: Report['category'];
    itemImageUrl?: string;
    itemLocation: string;
    finderId: string;
    estimatedValue?: number;
    explanation: string;
    submittedAnswers: { promptId: string; promptLabel: string; answer: string }[];
    truthfulnessConfirmed: boolean;
    evidenceUpload?: {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      dataUrl: string;
      description: string;
    };
  }) => Promise<{ ok: boolean; error?: string; claim?: ClaimRecord }>;
  submitFinderClaimDecision: (
    claimId: string,
    decision: 'approved' | 'request_evidence' | 'rejected' | 'escalated',
    reason: string
  ) => Promise<{ ok: boolean; error?: string; message?: string; requiresAdminApproval?: boolean }>;
  uploadClaimEvidence: (
    claimId: string,
    payload: {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      dataUrl: string;
      description: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  confirmPhysicalHandover: (
    claimId: string,
    handoverNotes: string
  ) => Promise<{ ok: boolean; error?: string; message?: string }>;
  fetchAdminReviewQueue: () => Promise<{
    ok: boolean;
    error?: string;
    claims: ClaimRecord[];
    auditLogs: AuditLogEntry[];
  }>;
  submitAdminClaimDecision: (
    claimId: string,
    decision: 'approved' | 'request_evidence' | 'rejected' | 'returned_to_finder',
    reason: string
  ) => Promise<{ ok: boolean; error?: string; message?: string }>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const STORAGE_KEYS = {
  USER: 'lostlink_v2_user',
  REPORTS: 'lostlink_v2_reports',
  MATCHES: 'lostlink_v2_matches',
  NOTIFICATIONS: 'lostlink_v2_notifications',
  STORIES: 'lostlink_v2_stories',
  HELPED: 'lostlink_v2_helped',
  THEME: 'lostlink_v2_theme',
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isAuthenticated, accessToken, authorizeBackendAction, updateAuthenticatedProfile } = useAuth();

  const [fallbackUser, setFallbackUser] = useState<User>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USER);
    return saved ? JSON.parse(saved) : demoUser;
  });

  const user: User = currentUser || fallbackUser;

  const [reports, setReports] = useState<Report[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.REPORTS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Report[];
        // Ensure seed public verification flags exist on r_2 and r_6
        return parsed.map(r => {
          if (r.id === 'r_2') return { ...r, hasPrivateVerification: true, estimatedValue: 3500 };
          if (r.id === 'r_6') return { ...r, hasPrivateVerification: true, enhancedVerification: true, estimatedValue: 6500 };
          return r;
        });
      } catch {
        return initialReports;
      }
    }
    return initialReports;
  });

  const [matches, setMatches] = useState<Match[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.MATCHES);
    return saved ? JSON.parse(saved) : [];
  });

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    return saved ? JSON.parse(saved) : initialNotifications;
  });

  const [reunionStories, setReunionStories] = useState<ReunionStory[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STORIES);
    return saved ? JSON.parse(saved) : initialReunionStories;
  });

  const [helpedIds, setHelpedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.HELPED);
    return saved ? JSON.parse(saved) : ['r_1', 'r_4'];
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [mySubmittedClaims, setMySubmittedClaims] = useState<ClaimRecord[]>([]);
  const [incomingFinderClaims, setIncomingFinderClaims] = useState<ClaimRecord[]>([]);

  const selectedReport = selectedReportId ? reports.find(r => r.id === selectedReportId) || null : null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return headers;
  }, [accessToken]);

  const refreshClaims = useCallback(async () => {
    if (!isAuthenticated) {
      setMySubmittedClaims([]);
      setIncomingFinderClaims([]);
      return;
    }
    try {
      const res = await fetch('/api/claims/my', {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setMySubmittedClaims(data.mySubmittedClaims || []);
        setIncomingFinderClaims(data.incomingFinderClaims || []);
      }
    } catch {
      // Ignore offline error
    }
  }, [isAuthenticated, getAuthHeaders]);

  useEffect(() => {
    refreshClaims();
  }, [refreshClaims]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3800);
    return () => clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(fallbackUser));
  }, [fallbackUser]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
  }, [reports]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(matches));
  }, [matches]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(reunionStories));
  }, [reunionStories]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.HELPED, JSON.stringify(helpedIds));
  }, [helpedIds]);

  // Recalculate matches whenever reports change
  useEffect(() => {
    if (reports.length === 0) return;

    const lostReports = reports.filter(r => r.type === 'lost' && r.status === 'lost');
    const foundReports = reports.filter(r => r.type === 'found' && r.status === 'found');

    const newMatches: Match[] = [];

    lostReports.forEach(lost => {
      foundReports.forEach(found => {
        if (matches.some(m => (m.lostReportId === lost.id && m.foundReportId === found.id) || (m.lostReportId === found.id && m.foundReportId === lost.id))) {
          return;
        }

        const score = calculateMatchScore(lost, found);
        if (score.score > 40) {
          const newMatch: Match = {
            id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            lostReportId: lost.id,
            foundReportId: found.id,
            score,
            status: 'pending',
            createdAt: new Date().toISOString()
          };
          newMatches.push(newMatch);
        }
      });
    });

    if (newMatches.length > 0) {
      setMatches(prev => [...prev, ...newMatches]);

      const newNotifications: Notification[] = newMatches
        .filter(m => {
          const lost = reports.find(r => r.id === m.lostReportId);
          const found = reports.find(r => r.id === m.foundReportId);
          return lost?.userId === user.id || found?.userId === user.id;
        })
        .map(m => ({
          id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          userId: user.id,
          title: '✨ New Potential Match Found!',
          message: `Our campus AI spotted a ${m.score.score}% match for your report. Take a look!`,
          read: false,
          createdAt: new Date().toISOString(),
          link: `/ai-matches`,
          type: 'match'
        }));

      if (newNotifications.length > 0) {
        setNotifications(prev => [...newNotifications, ...prev]);
      }
    }
  }, [reports]);

  const addReport = async (
    reportData: Omit<Report, 'id' | 'createdAt' | 'status' | 'userId'>,
    privateVerification?: {
      privatePrompts: VerificationPromptInput[];
      enhancedVerification: boolean;
      estimatedValue: number;
    }
  ): Promise<{ ok: boolean; reportId?: string; error?: string }> => {
    const authCheck = await authorizeBackendAction('create_report');
    if (!authCheck.authorized) {
      const errMsg = authCheck.error || 'Please sign in to submit a report.';
      showToast(`🔒 ${errMsg}`);
      return { ok: false, error: errMsg };
    }

    const newReportId = `r_${Date.now()}`;

    // If this is a found item with private ownership verification details, save them to the secure backend first
    if (reportData.type === 'found' && privateVerification) {
      const res = await fetch('/api/verification-details', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          itemId: newReportId,
          privatePrompts: privateVerification.privatePrompts,
          enhancedVerification: privateVerification.enhancedVerification,
          estimatedValue: privateVerification.estimatedValue
        })
      });
      const vData = await res.json();
      if (!res.ok) {
        showToast(`⚠️ ${vData.error || 'Failed to save private verification details.'}`);
        return { ok: false, error: vData.error };
      }
    }

    const newReport: Report = {
      ...reportData,
      id: newReportId,
      status: reportData.type === 'lost' ? 'lost' : 'found',
      userId: user.id,
      reporterName: reportData.reporterName || user.name,
      reporterRole: reportData.reporterRole || user.role || 'Campus Member',
      reporterVerified: true,
      helpfulCount: 1,
      comments: [],
      hasPrivateVerification: Boolean(reportData.type === 'found' && privateVerification),
      enhancedVerification: Boolean(
        privateVerification?.enhancedVerification ||
        (privateVerification?.estimatedValue && privateVerification.estimatedValue >= 5000)
      ),
      estimatedValue: privateVerification?.estimatedValue || 0,
      createdAt: new Date().toISOString()
    };

    setReports(prev => [newReport, ...prev]);
    const nextKarma = (user.karmaPoints || 100) + (reportData.type === 'found' ? 25 : 10);
    await updateAuthenticatedProfile({ karmaPoints: nextKarma });
    setFallbackUser(prev => ({ ...prev, karmaPoints: nextKarma }));

    showToast(
      reportData.type === 'found'
        ? '🌟 Found report & private ownership verification saved! +25 Kindness Karma earned.'
        : '📡 Your lost report is live! Campus members nearby have been alerted.'
    );
    return { ok: true, reportId: newReportId };
  };

  const updateReportStatus = async (id: string, status: Report['status'], gratitudeQuote?: string): Promise<boolean> => {
    const authCheck = await authorizeBackendAction('update_report');
    if (!authCheck.authorized) {
      showToast(`🔒 ${authCheck.error || 'Please sign in to update item status.'}`);
      return false;
    }

    const target = reports.find(r => r.id === id);
    setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));

    if (status === 'resolved' && target) {
      const story: ReunionStory = {
        id: `rs_${Date.now()}`,
        itemTitle: target.title,
        category: target.category,
        ownerName: target.reporterName?.split(' ')[0] || user.name.split(' ')[0],
        finderName: user.name.split(' ')[0],
        location: target.campusZone || target.location.split('•')[0].trim(),
        quote: gratitudeQuote || 'Reunited safely through the LostLink campus network! Thank you everyone!',
        timeAgo: 'Just now'
      };
      setReunionStories(prev => [story, ...prev]);
      const nextKarma = (user.karmaPoints || 100) + 30;
      const nextReunions = (user.reunionsHelped || 0) + 1;
      await updateAuthenticatedProfile({ karmaPoints: nextKarma, reunionsHelped: nextReunions });
      setFallbackUser(prev => ({ ...prev, karmaPoints: nextKarma, reunionsHelped: nextReunions }));
      showToast('🎉 Item marked as Reunited! Story added to the Campus Kindness Wall.');
    }
    return true;
  };

  const deleteReport = async (id: string): Promise<boolean> => {
    const target = reports.find(r => r.id === id);
    const authCheck = await authorizeBackendAction('delete_report', target?.userId);
    if (!authCheck.authorized) {
      showToast(`🔒 ${authCheck.error || 'Unauthorized to delete this report.'}`);
      return false;
    }

    setReports(prev => prev.filter(r => r.id !== id));
    if (selectedReportId === id) setSelectedReportId(null);
    showToast('Report removed from your list.');
    return true;
  };

  const addComment = async (reportId: string, text: string, isSighting = true): Promise<boolean> => {
    if (!text.trim()) return false;
    const authCheck = await authorizeBackendAction('add_comment');
    if (!authCheck.authorized) {
      showToast('🔒 Please log in to post a campus sighting or comment.');
      return false;
    }

    const newComment: ItemComment = {
      id: `c_${Date.now()}`,
      authorName: user.name,
      authorRole: user.role || 'Verified Student',
      text: text.trim(),
      createdAt: new Date().toISOString(),
      isSighting
    };
    setReports(prev =>
      prev.map(r =>
        r.id === reportId
          ? { ...r, comments: [...(r.comments || []), newComment] }
          : r
      )
    );
    const nextKarma = (user.karmaPoints || 100) + 10;
    await updateAuthenticatedProfile({ karmaPoints: nextKarma });
    setFallbackUser(prev => ({ ...prev, karmaPoints: nextKarma }));
    showToast('💬 Note posted! +10 Kindness Karma for helping out.');
    return true;
  };

  const toggleHelpful = (reportId: string) => {
    const alreadyHelped = helpedIds.includes(reportId);
    setHelpedIds(prev =>
      alreadyHelped ? prev.filter(id => id !== reportId) : [...prev, reportId]
    );
    setReports(prev =>
      prev.map(r => {
        if (r.id !== reportId) return r;
        const current = r.helpfulCount || 0;
        return { ...r, helpfulCount: alreadyHelped ? Math.max(0, current - 1) : current + 1 };
      })
    );
    if (!alreadyHelped) {
      showToast('👀 You’re keeping an eye out! This boosts the item on the campus feed.');
    }
  };

  const updateUserProfile = async (updates: Partial<User>): Promise<boolean> => {
    const res = await updateAuthenticatedProfile(updates);
    if (res.error) {
      showToast(`🔒 ${res.error}`);
      return false;
    }
    setFallbackUser(prev => ({ ...prev, ...updates }));
    showToast('✨ Your Campus Profile has been updated!');
    return true;
  };

  const verifyMatch = async (matchId: string): Promise<boolean> => {
    const authCheck = await authorizeBackendAction('verify_match');
    if (!authCheck.authorized) {
      showToast(`🔒 ${authCheck.error || 'Please sign in to verify matches.'}`);
      return false;
    }

    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'verified' } : m));
    const match = matches.find(m => m.id === matchId);
    if (match) {
      const lost = reports.find(r => r.id === match.lostReportId);
      const found = reports.find(r => r.id === match.foundReportId);
      setReports(prev =>
        prev.map(r =>
          r.id === match.lostReportId || r.id === match.foundReportId
            ? { ...r, status: 'resolved' }
            : r
        )
      );
      if (lost && found) {
        const story: ReunionStory = {
          id: `rs_${Date.now()}`,
          itemTitle: lost.title,
          category: lost.category,
          ownerName: lost.reporterName || 'Campus Student',
          finderName: found.reporterName || 'Kind Finder',
          location: lost.campusZone || lost.location.split('•')[0].trim(),
          quote: `Matched via LostLink AI (${match.score.score}% confidence) and happily reunited at ${found.location}!`,
          timeAgo: 'Just now'
        };
        setReunionStories(prev => [story, ...prev]);
      }
      const nextKarma = (user.karmaPoints || 100) + 50;
      const nextReunions = (user.reunionsHelped || 0) + 1;
      await updateAuthenticatedProfile({ karmaPoints: nextKarma, reunionsHelped: nextReunions });
      setFallbackUser(prev => ({ ...prev, karmaPoints: nextKarma, reunionsHelped: nextReunions }));
      showToast('🎉 Match Verified & Reunited! +50 Kindness Karma awarded!');
    }
    return true;
  };

  const rejectMatch = (matchId: string) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'rejected' } : m));
    showToast('Match dismissed. We’ll keep scanning for better matches.');
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    showToast('All notifications marked as read.');
  };

  const resetDemoData = () => {
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    setFallbackUser(demoUser);
    setReports(initialReports);
    setMatches([]);
    setNotifications(initialNotifications);
    setReunionStories(initialReunionStories);
    setHelpedIds(['r_1', 'r_4']);
    showToast('🔄 Demo data restored to fresh campus state!');
  };

  // ==========================================================================
  // Ownership Verification & Claim Methods
  // ==========================================================================

  const fetchVerificationPrompts = async (itemId: string) => {
    try {
      const res = await fetch(`/api/verification-details/${encodeURIComponent(itemId)}/prompts`, {
        method: 'GET',
        credentials: 'include'
      });
      if (!res.ok) {
        return { hasPrivateDetails: false, enhancedVerification: false, estimatedValue: 0, prompts: [] };
      }
      return await res.json();
    } catch {
      return { hasPrivateDetails: false, enhancedVerification: false, estimatedValue: 0, prompts: [] };
    }
  };

  const submitOwnershipClaim: DataContextType['submitOwnershipClaim'] = async payload => {
    try {
      const res = await fetch('/api/claims', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Could not submit ownership claim.' };
      }
      await refreshClaims();
      setNotifications(prev => [
        {
          id: `n_${Date.now()}`,
          userId: payload.finderId,
          title: '🛡️ New Ownership Claim Submitted',
          message: `A campus member submitted an ownership verification claim for "${payload.itemTitle}".`,
          read: false,
          createdAt: new Date().toISOString(),
          link: '/my-reports',
          type: 'claim'
        },
        ...prev
      ]);
      showToast(`🛡️ ${data.message || 'Claim submitted for verification!'}`);
      return { ok: true, claim: data.claim };
    } catch {
      return { ok: false, error: 'Network error while submitting your claim.' };
    }
  };

  const submitFinderClaimDecision: DataContextType['submitFinderClaimDecision'] = async (
    claimId,
    decision,
    reason
  ) => {
    try {
      const res = await fetch(`/api/claims/${encodeURIComponent(claimId)}/finder-decision`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ decision, reason })
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Could not save review decision.' };
      }
      await refreshClaims();
      showToast(`✅ ${data.message}`);
      return {
        ok: true,
        message: data.message,
        requiresAdminApproval: Boolean(data.requiresAdminApproval)
      };
    } catch {
      return { ok: false, error: 'Network error while submitting finder decision.' };
    }
  };

  const uploadClaimEvidence: DataContextType['uploadClaimEvidence'] = async (claimId, payload) => {
    try {
      const res = await fetch(`/api/claims/${encodeURIComponent(claimId)}/evidence`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Failed to upload evidence.' };
      }
      await refreshClaims();
      showToast('📎 Supporting evidence uploaded privately.');
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error while uploading evidence.' };
    }
  };

  const confirmPhysicalHandover: DataContextType['confirmPhysicalHandover'] = async (claimId, handoverNotes) => {
    try {
      const res = await fetch(`/api/claims/${encodeURIComponent(claimId)}/handover`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ handoverNotes })
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Failed to confirm physical handover.' };
      }

      // Now and ONLY now mark the item as returned ('resolved')
      const updatedClaim = data.claim as ClaimRecord;
      if (updatedClaim?.itemId) {
        setReports(prev =>
          prev.map(r => (r.id === updatedClaim.itemId ? { ...r, status: 'resolved' } : r))
        );
        const story: ReunionStory = {
          id: `rs_${Date.now()}`,
          itemTitle: updatedClaim.itemTitle,
          category: updatedClaim.itemCategory || 'Other',
          ownerName: updatedClaim.claimantName.split(' ')[0],
          finderName: user.name.split(' ')[0],
          location: updatedClaim.itemLocation.split('•')[0].trim(),
          quote: handoverNotes || 'Verified ownership and completed safe campus handover!',
          timeAgo: 'Just now'
        };
        setReunionStories(prev => [story, ...prev]);
      }

      await refreshClaims();
      showToast('🤝 Physical handover confirmed! Item is now marked as Returned.');
      return { ok: true, message: data.message };
    } catch {
      return { ok: false, error: 'Network error while confirming handover.' };
    }
  };

  const fetchAdminReviewQueue: DataContextType['fetchAdminReviewQueue'] = async () => {
    try {
      const res = await fetch('/api/admin/claims', {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Unauthorized access.', claims: [], auditLogs: [] };
      }
      return {
        ok: true,
        claims: data.claims || [],
        auditLogs: data.auditLogs || []
      };
    } catch {
      return { ok: false, error: 'Network error loading admin review queue.', claims: [], auditLogs: [] };
    }
  };

  const submitAdminClaimDecision: DataContextType['submitAdminClaimDecision'] = async (
    claimId,
    decision,
    reason
  ) => {
    try {
      const res = await fetch(`/api/admin/claims/${encodeURIComponent(claimId)}/decision`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ decision, reason })
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error || 'Could not record administrator decision.' };
      }
      await refreshClaims();
      showToast(`🛡️ ${data.message}`);
      return { ok: true, message: data.message };
    } catch {
      return { ok: false, error: 'Network error submitting administrator decision.' };
    }
  };

  return (
    <DataContext.Provider
      value={{
        user,
        reports,
        matches,
        notifications,
        reunionStories,
        selectedReport,
        setSelectedReportId,
        helpedIds,
        theme,
        toggleTheme,
        toastMessage,
        showToast,
        addReport,
        updateReportStatus,
        deleteReport,
        addComment,
        toggleHelpful,
        updateUserProfile,
        verifyMatch,
        rejectMatch,
        markNotificationRead,
        markAllNotificationsRead,
        resetDemoData,
        mySubmittedClaims,
        incomingFinderClaims,
        refreshClaims,
        fetchVerificationPrompts,
        submitOwnershipClaim,
        submitFinderClaimDecision,
        uploadClaimEvidence,
        confirmPhysicalHandover,
        fetchAdminReviewQueue,
        submitAdminClaimDecision
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
};
