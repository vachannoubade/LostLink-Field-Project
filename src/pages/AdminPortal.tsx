import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  ShieldCheck,
  Users,
  Search,
  RefreshCw,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Check
} from 'lucide-react';
import { useAuth } from '../store/AuthContext';
import { supabase } from '../lib/supabase';
import { getReportImageSignedUrl, isStoragePath } from '../lib/storage';
import { generateMatches } from '../utils/matching';
import type {
  Category,
  Match,
  Report,
  ReportType,
  Claim,
  CampusMembership
} from '../types';

type MainSection = 'dashboard' | 'reports' | 'claims' | 'students';
type ReportFilter = 'all' | 'active' | 'resolved' | 'matched' | 'lost' | 'found';
type ClaimFilter = 'all' | 'pending' | 'awaiting_handover' | 'disputed' | 'resolved' | 'rejected';

interface AdminReportRow {
  id: string;
  user_id: string;
  type: ReportType;
  title: string;
  category: Category;
  description: string;
  location: string;
  date: string;
  time?: string | null;
  image_url?: string | null;
  status: Report['status'];
  created_at: string;
  brand_model?: string | null;
  color?: string | null;
  distinguishing_features?: string | null;
  campus_zone?: string | null;
  custody_status?: string | null;
  has_private_verification?: boolean;
}

interface AdminMatchRow {
  id: string;
  lost_report_id: string;
  found_report_id: string;
  score: number;
  reasons: string[] | null;
  status: Match['status'];
  created_at: string;
}

interface AdminProfileRow {
  id: string;
  name: string;
}

const toReport = (row: AdminReportRow, reporterName: string): Report => {
  const storagePath = isStoragePath(row.image_url) ? (row.image_url ?? undefined) : undefined;

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    category: row.category,
    description: row.description,
    location: row.location,
    date: row.date,
    time: row.time ?? undefined,
    imageUrl: storagePath ? undefined : (row.image_url ?? undefined),
    imagePath: storagePath,
    status: row.status,
    userId: row.user_id,
    createdAt: row.created_at,
    brandModel: row.brand_model ?? undefined,
    color: row.color ?? undefined,
    distinguishingFeatures: row.distinguishing_features ?? undefined,
    campusZone: row.campus_zone ?? undefined,
    custodyStatus: (row.custody_status as Report['custodyStatus']) ?? undefined,
    hasPrivateVerification: Boolean(row.has_private_verification),
    reporterName
  };
};

const toMatch = (row: AdminMatchRow): Match => ({
  id: row.id,
  lostReportId: row.lost_report_id,
  foundReportId: row.found_report_id,
  score: {
    score: row.score,
    reasons: row.reasons || []
  },
  status: row.status,
  createdAt: row.created_at
});

const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const AdminPortal: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleAdminSignOut = async () => {
    await signOut();
    navigate('/admin/login', { replace: true });
  };

  // Primary Data
  const [reports, setReports] = useState<Report[]>([]);
  const [persistedMatches, setPersistedMatches] = useState<Match[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [memberships, setMemberships] = useState<CampusMembership[]>([]);
  const [profileNames, setProfileNames] = useState<Map<string, string>>(new Map());

  // UI State
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Main Section Navigation (4 clean sections)
  const [activeSection, setActiveSection] = useState<MainSection>('dashboard');

  // Filters & Search
  const [reportFilter, setReportFilter] = useState<ReportFilter>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [claimFilter, setClaimFilter] = useState<ClaimFilter>('pending');
  const [studentSearch, setStudentSearch] = useState('');

  // Selected Report Modal
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  // Handover Execution Modal State
  const [resolvingClaim, setResolvingClaim] = useState<Claim | null>(null);
  const [idVerified, setIdVerified] = useState(false);
  const [conditionNotes, setConditionNotes] = useState('Standard physical verification completed. Item returned to genuine owner in good condition.');
  const [resolutionLoading, setResolutionLoading] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  // Confirmation Action State
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Data Loading
  const loadRecords = useCallback(async () => {
    if (!supabase) return;

    try {
      const { data: isAdmin, error: adminError } = await supabase.rpc('is_current_user_admin');

      if (adminError || isAdmin !== true) {
        setError('Your session does not carry the server-issued administrator role.');
        setLoading(false);
        return;
      }

      const [
        reportsResult,
        profilesResult,
        matchesResult,
        claimsResult,
        membershipsResult
      ] = await Promise.all([
        supabase.from('reports').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, name'),
        supabase.from('matches').select('*').order('created_at', { ascending: false }),
        supabase.from('claims').select('*').order('created_at', { ascending: false }),
        supabase.from('campus_memberships').select('*').order('created_at', { ascending: false })
      ]);

      if (reportsResult.error) {
        setError(`Could not load reports: ${reportsResult.error.message}`);
        return;
      }

      const profileNamesMap = new Map<string, string>(
        ((profilesResult.data || []) as AdminProfileRow[]).map(row => [row.id, row.name])
      );
      setProfileNames(profileNamesMap);

      setReports(
        ((reportsResult.data || []) as AdminReportRow[]).map(row =>
          toReport(row, profileNamesMap.get(row.user_id) || 'Campus Student')
        )
      );

      if (!matchesResult.error && matchesResult.data) {
        setPersistedMatches((matchesResult.data as AdminMatchRow[]).map(toMatch));
      }

      if (!claimsResult.error && claimsResult.data) {
        setClaims(
          (claimsResult.data as Record<string, unknown>[]).map(row => ({
            id: row.id as string,
            foundReportId: (row.found_report_id || row.foundReportId || '') as string,
            found_report_id: (row.found_report_id || row.foundReportId || '') as string,
            claimantId: (row.claimant_id || row.claimantId || '') as string,
            claimant_id: (row.claimant_id || row.claimantId || '') as string,
            linkedLostReportId: (row.linked_lost_report_id || row.linkedLostReportId) as string | undefined,
            claimEvidence: (row.claim_evidence || row.claimEvidence || '') as string,
            claim_evidence: (row.claim_evidence || row.claimEvidence || '') as string,
            status: row.status as Claim['status'],
            reviewNotes: (row.review_notes || row.reviewNotes) as string | undefined,
            reviewedBy: (row.reviewed_by || row.reviewedBy) as string | undefined,
            reviewedAt: (row.reviewed_at || row.reviewedAt) as string | undefined,
            createdAt: (row.created_at || row.createdAt || '') as string,
            created_at: (row.created_at || row.createdAt || '') as string,
            updatedAt: (row.updated_at || row.updatedAt || '') as string
          }))
        );
      }

      if (!membershipsResult.error && membershipsResult.data) {
        setMemberships(
          (membershipsResult.data as Record<string, unknown>[]).map(row => {
            const rawUserId = (row.user_id || row.userId || '') as string;
            const matchedName = profileNamesMap.get(rawUserId);
            return {
              id: row.id as string,
              userId: rawUserId,
              user_id: rawUserId,
              memberName: matchedName && matchedName.trim() ? matchedName.trim() : 'Unnamed Member',
              membershipType: (row.membership_type || row.membershipType || 'student') as CampusMembership['membershipType'],
              membership_type: (row.membership_type || row.membershipType || 'student') as CampusMembership['membershipType'],
              status: (row.status || 'ACTIVE') as CampusMembership['status'],
              approvedBy: (row.approved_by || row.approvedBy) as string | undefined,
              approvedAt: (row.approved_at || row.approvedAt) as string | undefined,
              approved_at: (row.approved_at || row.approvedAt) as string | undefined,
              expiresAt: (row.expires_at || row.expiresAt) as string | undefined,
              notes: (row.notes || '') as string | undefined,
              createdAt: (row.created_at || row.createdAt || '') as string,
              created_at: (row.created_at || row.createdAt || '') as string,
              updatedAt: (row.updated_at || row.updatedAt || '') as string
            };
          })
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load administrative records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const refreshRecords = useCallback(() => {
    setLoading(true);
    setError(null);
    setActionSuccess(null);
    void loadRecords();
  }, [loadRecords]);

  // Derived Matching Engine
  const generatedMatches = useMemo(() => generateMatches(reports), [reports]);

  const matches = useMemo(() => {
    const merged = new Map<string, Match>();
    for (const match of generatedMatches) {
      merged.set(`${match.lostReportId}:${match.foundReportId}`, match);
    }
    for (const match of persistedMatches) {
      const key = `${match.lostReportId}:${match.foundReportId}`;
      const generated = merged.get(key);
      merged.set(
        key,
        generated
          ? {
              ...generated,
              id: match.id || generated.id,
              status: match.status,
              score: match.score.score >= generated.score.score ? match.score : generated.score,
              createdAt: match.createdAt || generated.createdAt
            }
          : match
      );
    }
    return [...merged.values()];
  }, [generatedMatches, persistedMatches]);

  const matchedReportIds = useMemo(() => {
    const ids = new Set<string>();
    for (const match of matches) {
      ids.add(match.lostReportId);
      ids.add(match.foundReportId);
    }
    return ids;
  }, [matches]);

  const reportById = useMemo(() => {
    const map = new Map<string, Report>();
    for (const report of reports) map.set(report.id, report);
    return map;
  }, [reports]);

  // Core Counts
  const activeCount = reports.filter(r => r.status !== 'resolved').length;
  const resolvedCount = reports.filter(r => r.status === 'resolved').length;
  const pendingReviewCount = claims.filter(c => ['REQUESTED', 'UNDER_REVIEW'].includes(c.status)).length;
  const awaitingHandoverCount = claims.filter(c => c.status === 'APPROVED_FOR_HANDOVER').length;
  const disputedCount = claims.filter(c => c.status === 'DISPUTED').length;
  const totalPendingClaims = pendingReviewCount + awaitingHandoverCount;
  const needsAttentionCount = pendingReviewCount + awaitingHandoverCount + disputedCount;

  // 1. Claim Review: Approve for Handover
  const handleApproveClaim = async (claimId: string, notes?: string) => {
    if (!supabase || !claimId) return;
    setError(null);
    setActionSuccess(null);
    try {
      const { error: rpcErr } = await supabase.rpc('review_claim_status', {
        p_claim_id: claimId,
        p_new_status: 'APPROVED_FOR_HANDOVER',
        p_review_notes: notes || 'Ownership claim approved by administrator. Ready for physical handover verification.'
      });
      if (rpcErr) {
        setError(rpcErr.message);
      } else {
        setActionSuccess('Claim approved for handover! Ready for student physical verification.');
        refreshRecords();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve claim.');
    }
  };

  // 2. Claim Review: Reject
  const handleRejectClaim = async (claimId: string, notes?: string) => {
    if (!supabase || !claimId) return;
    setError(null);
    setActionSuccess(null);
    try {
      const { error: rpcErr } = await supabase.rpc('review_claim_status', {
        p_claim_id: claimId,
        p_new_status: 'REJECTED',
        p_review_notes: notes || 'Claim rejected after administrator review of ownership evidence.'
      });
      if (rpcErr) {
        setError(rpcErr.message);
      } else {
        setActionSuccess('Claim rejected.');
        refreshRecords();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject claim.');
    }
  };

  // 3. Physical Handover Execution
  const handleExecuteHandover = async () => {
    if (!supabase || !resolvingClaim) return;
    if (!idVerified) {
      setResolutionError('Student identity card / PRN must be physically verified before handover.');
      return;
    }

    setResolutionLoading(true);
    setResolutionError(null);

    try {
      const { data, error: rpcErr } = await supabase.rpc('complete_handover_resolution', {
        p_claim_id: resolvingClaim.id,
        p_desk_location: 'Central Campus Helpdesk',
        p_condition_notes: conditionNotes.trim(),
        p_id_verified: true
      });

      if (rpcErr) {
        setResolutionError(rpcErr.message);
        setResolutionLoading(false);
        return;
      }

      setActionSuccess(`Physical handover recorded and item resolved successfully! Handover ID: ${(data as { handover_id?: string })?.handover_id || 'OK'}`);
      setResolvingClaim(null);
      setIdVerified(false);
      refreshRecords();
    } catch (err) {
      setResolutionError(err instanceof Error ? err.message : 'Failed to complete handover.');
    } finally {
      setResolutionLoading(false);
    }
  };

  // 4. Toggle Student Membership Status
  const handleToggleMembershipStatus = async (userId: string, currentStatus: string) => {
    if (!supabase || !userId) return;
    const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      const { error: rpcErr } = await supabase.rpc('admin_set_membership_status', {
        p_user_id: userId,
        p_status: nextStatus
      });
      if (rpcErr) {
        setError(`Failed to update membership status: ${rpcErr.message}`);
      } else {
        setActionSuccess(`Student campus access is now ${nextStatus}.`);
        refreshRecords();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating student access status.');
    }
  };

  // Filtered Reports
  const filteredReports = useMemo(() => {
    const query = reportSearch.trim().toLowerCase();
    return reports.filter(report => {
      if (reportFilter === 'active' && report.status === 'resolved') return false;
      if (reportFilter === 'resolved' && report.status !== 'resolved') return false;
      if (reportFilter === 'lost' && report.type !== 'lost') return false;
      if (reportFilter === 'found' && report.type !== 'found') return false;
      if (reportFilter === 'matched' && !matchedReportIds.has(report.id)) return false;

      if (!query) return true;
      return [
        report.id,
        report.title,
        report.description,
        report.location,
        report.category,
        report.type,
        report.reporterName || ''
      ].join(' ').toLowerCase().includes(query);
    });
  }, [reportFilter, matchedReportIds, reports, reportSearch]);

  // Filtered Claims
  const filteredClaims = useMemo(() => {
    return claims.filter(c => {
      if (claimFilter === 'pending') return ['REQUESTED', 'UNDER_REVIEW'].includes(c.status);
      if (claimFilter === 'awaiting_handover') return c.status === 'APPROVED_FOR_HANDOVER';
      if (claimFilter === 'disputed') return c.status === 'DISPUTED';
      if (claimFilter === 'resolved') return c.status === 'RESOLVED';
      if (claimFilter === 'rejected') return c.status === 'REJECTED';
      return true; // 'all'
    });
  }, [claims, claimFilter]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return memberships.filter(mem => {
      if (!query) return true;
      const name = (mem.memberName || profileNames.get(mem.userId || mem.user_id || '') || '').toLowerCase();
      const role = (mem.membershipType || mem.membership_type || '').toLowerCase();
      const status = mem.status.toLowerCase();
      return name.includes(query) || role.includes(query) || status.includes(query);
    });
  }, [memberships, profileNames, studentSearch]);

  // Report Modal Image Loader
  const openReportModal = useCallback((reportId: string) => {
    const report = reportById.get(reportId);
    setSelectedImageUrl(null);
    setImageLoading(Boolean(report?.imagePath || report?.imageUrl));
    setSelectedId(reportId);
  }, [reportById]);

  const selectedReport = selectedId ? reportById.get(selectedId) || null : null;

  useEffect(() => {
    let cancelled = false;
    const imageSource = selectedReport?.imagePath || selectedReport?.imageUrl;

    if (!imageSource) return;

    void getReportImageSignedUrl(imageSource).then(url => {
      if (cancelled) return;
      setSelectedImageUrl(url);
      setImageLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedReport?.id, selectedReport?.imagePath, selectedReport?.imageUrl]);

  if (loading) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
        <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px', color: 'var(--primary)' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading administration console...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1140px', margin: '0 auto', paddingBottom: '60px' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', letterSpacing: '0.04em' }}>
              CAMPUS ADMIN
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>SANJAY GHODAWAT UNIVERSITY</span>
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 700, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
            LostLink Administration
          </h1>
        </div>

        <div className="admin-header-actions">
          <div className="admin-account" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)'
          }}>
            <ShieldCheck size={16} color="var(--primary)" />
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{user?.email || 'vachannoubade@gmail.com'}</span>
          </div>

          <button 
            onClick={refreshRecords}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 12px' }}
            title="Refresh database records"
          >
            <RefreshCw size={14} /> Refresh
          </button>

          <button 
            onClick={handleAdminSignOut}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 12px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.25)' }}
            title="Sign out of administrative console"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>

      {/* Action Messages */}
      {actionSuccess && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: 'var(--success-light)', color: 'var(--success)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', marginBottom: '16px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <CheckCircle2 size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', marginBottom: '16px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* MAIN 4-TAB NAVIGATION */}
      <div style={{
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid var(--border)',
        marginBottom: '24px',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        WebkitOverflowScrolling: 'touch'
      }}>
        {[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: needsAttentionCount },
          { id: 'reports', label: 'Reports', icon: FileText, badge: activeCount },
          { id: 'claims', label: 'Claims & Handovers', icon: ShieldCheck, badge: totalPendingClaims },
          { id: 'students', label: 'Students', icon: Users, badge: memberships.length }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as MainSection)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 18px',
                border: 'none',
                background: 'none',
                borderBottom: `2px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 650 : 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                marginBottom: '-1px',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={17} />
              <span>{tab.label}</span>
              {tab.badge > 0 && (
                <span style={{
                  padding: '2px 7px',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  backgroundColor: isActive ? 'var(--primary)' : 'var(--bg-secondary)',
                  color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                  fontWeight: 700
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: DASHBOARD */}
      {/* ========================================================================= */}
      {activeSection === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Executive Overview Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="card" style={{ padding: '20px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Active Reports
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '6px' }}>
                {activeCount}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Items currently lost or found on campus
              </div>
            </div>

            <div className="card" style={{ padding: '20px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Pending Claims
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: totalPendingClaims > 0 ? 'var(--primary)' : 'var(--text-main)', marginTop: '6px' }}>
                {totalPendingClaims}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {pendingReviewCount} review · {awaitingHandoverCount} ready for return
              </div>
            </div>

            <div className="card" style={{ padding: '20px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Successfully Returned
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--success)', marginTop: '6px' }}>
                {resolvedCount}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Reunited with genuine student owners
              </div>
            </div>

            <div className="card" style={{ padding: '20px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Needs Administrator Attention
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: needsAttentionCount > 0 ? 'var(--danger)' : 'var(--text-main)', marginTop: '6px' }}>
                {needsAttentionCount}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {disputedCount} disputed · {pendingReviewCount} unreviewed claims
              </div>
            </div>
          </div>

          {/* Action Needed Section */}
          <div className="card" style={{ padding: '24px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 650, margin: '0 0 4px 0', color: 'var(--text-main)' }}>
                  Action Needed: Claims & Handover Queue
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Ownership claims awaiting administrator review or physical helpdesk verification.
                </p>
              </div>
              <button
                onClick={() => setActiveSection('claims')}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.8rem' }}
              >
                View All Claims →
              </button>
            </div>

            {claims.filter(c => ['REQUESTED', 'UNDER_REVIEW', 'APPROVED_FOR_HANDOVER', 'DISPUTED'].includes(c.status)).length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                <CheckCircle2 size={32} color="var(--success)" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.92rem' }}>All Caught Up</div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '4px 0 0 0' }}>
                  No pending ownership claims or disputed items require attention.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {claims
                  .filter(c => ['REQUESTED', 'UNDER_REVIEW', 'APPROVED_FOR_HANDOVER', 'DISPUTED'].includes(c.status))
                  .slice(0, 5)
                  .map(claim => {
                    const foundItem = reportById.get(claim.foundReportId || claim.found_report_id || '');
                    const claimantName = profileNames.get(claim.claimantId || claim.claimant_id || '') || 'Student';
                    return (
                      <div
                        key={claim.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 16px',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: claim.status === 'DISPUTED' ? 'rgba(239, 68, 68, 0.04)' : '#FFFFFF',
                          flexWrap: 'wrap',
                          gap: '12px'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              backgroundColor: 
                                claim.status === 'APPROVED_FOR_HANDOVER' ? 'var(--success-light)' :
                                claim.status === 'DISPUTED' ? 'var(--danger-light)' : 'var(--primary-light)',
                              color: 
                                claim.status === 'APPROVED_FOR_HANDOVER' ? 'var(--success)' :
                                claim.status === 'DISPUTED' ? 'var(--danger)' : 'var(--primary)'
                            }}>
                              {claim.status.replace(/_/g, ' ')}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                              {foundItem?.title || 'Found Campus Item'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            Claimant: <strong>{claimantName}</strong> · Submitted: {formatDate(claim.createdAt || claim.created_at)}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          {claim.status === 'APPROVED_FOR_HANDOVER' ? (
                            <button
                              onClick={() => {
                                setResolvingClaim(claim);
                                setResolutionError(null);
                                setIdVerified(false);
                              }}
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                            >
                              Finalize Handover
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setActiveSection('claims');
                                setClaimFilter(claim.status === 'DISPUTED' ? 'disputed' : 'pending');
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                            >
                              Review Evidence
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Recently Reported Items */}
          <div className="card" style={{ padding: '24px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 650, margin: '0 0 4px 0', color: 'var(--text-main)' }}>
                  Recently Reported Campus Items
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Latest lost and found notices submitted by students and campus security.
                </p>
              </div>
              <button
                onClick={() => setActiveSection('reports')}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.8rem' }}
              >
                View All Reports →
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              {reports.slice(0, 4).map(report => (
                <div
                  key={report.id}
                  onClick={() => openReportModal(report.id)}
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    backgroundColor: '#FFFFFF',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      backgroundColor: report.status === 'resolved' ? 'var(--bg-secondary)' : report.type === 'lost' ? 'var(--danger-light)' : 'var(--success-light)',
                      color: report.status === 'resolved' ? 'var(--text-muted)' : report.type === 'lost' ? 'var(--danger)' : 'var(--success)'
                    }}>
                      {report.type.toUpperCase()} · {report.status.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      {formatDate(report.date)}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '4px' }}>
                    {report.title}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {report.campusZone || report.location} · {report.reporterName || 'Student'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: REPORTS */}
      {/* ========================================================================= */}
      {activeSection === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Controls: Search and Segmented Filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'All', count: reports.length },
                { id: 'active', label: 'Active', count: activeCount },
                { id: 'resolved', label: 'Resolved', count: resolvedCount },
                { id: 'lost', label: 'Lost', count: reports.filter(r => r.type === 'lost').length },
                { id: 'found', label: 'Found', count: reports.filter(r => r.type === 'found').length },
                { id: 'matched', label: 'Matches', count: matchedReportIds.size }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setReportFilter(f.id as ReportFilter)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    border: '1px solid var(--border)',
                    backgroundColor: reportFilter === f.id ? 'var(--text-main)' : '#FFFFFF',
                    color: reportFilter === f.id ? '#FFFFFF' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', width: '280px' }}>
              <input
                type="text"
                placeholder="Search reports..."
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                className="form-control"
                style={{ fontSize: '0.84rem', paddingLeft: '32px' }}
              />
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            </div>
          </div>

          {/* Reports Desktop Table */}
          <div className="desktop-only table-wrapper card" style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Item Title</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th>Date</th>
                  <th>Student Name</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No reports match the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredReports.map(report => {
                    const hasMatch = matchedReportIds.has(report.id);
                    return (
                      <tr key={report.id}>
                        <td>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            backgroundColor: report.status === 'resolved' ? 'var(--bg-secondary)' : report.type === 'lost' ? 'var(--danger-light)' : 'var(--success-light)',
                            color: report.status === 'resolved' ? 'var(--text-muted)' : report.type === 'lost' ? 'var(--danger)' : 'var(--success)'
                          }}>
                            {report.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                          <div>{report.title}</div>
                          {report.brandModel && (
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                              {report.brandModel} {report.color ? `• ${report.color}` : ''}
                            </div>
                          )}
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {report.category}
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {report.campusZone || report.location}
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>
                          {formatDate(report.date)}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                          {report.reporterName || 'Campus Student'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {hasMatch && (
                              <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 650 }}>
                                Matched
                              </span>
                            )}
                            <button 
                              onClick={() => openReportModal(report.id)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                            >
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Reports Mobile Stacked Cards */}
          <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredReports.length === 0 ? (
              <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No reports match the selected criteria.
              </div>
            ) : (
              filteredReports.map(report => (
                <div key={report.id} className="record-card">
                  <div className="record-card-row">
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      backgroundColor: report.status === 'resolved' ? 'var(--bg-secondary)' : report.type === 'lost' ? 'var(--danger-light)' : 'var(--success-light)',
                      color: report.status === 'resolved' ? 'var(--text-muted)' : report.type === 'lost' ? 'var(--danger)' : 'var(--success)'
                    }}>
                      {report.type.toUpperCase()} · {report.status.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      {formatDate(report.date)}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-main)' }}>{report.title}</div>
                    {report.brandModel && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {report.brandModel} {report.color ? `• ${report.color}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="record-card-row" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span>{report.category} · {report.campusZone || report.location}</span>
                    <span>{report.reporterName || 'Campus Student'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <button
                      onClick={() => openReportModal(report.id)}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: CLAIMS & HANDOVERS */}
      {/* ========================================================================= */}
      {activeSection === 'claims' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Sub Filters */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'pending', label: 'Pending Review', count: pendingReviewCount },
              { id: 'awaiting_handover', label: 'Awaiting Handover', count: awaitingHandoverCount },
              { id: 'disputed', label: 'Disputed Claims', count: disputedCount },
              { id: 'resolved', label: 'Returned', count: claims.filter(c => c.status === 'RESOLVED').length },
              { id: 'all', label: 'All Claims', count: claims.length }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setClaimFilter(f.id as ClaimFilter)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  border: '1px solid var(--border)',
                  backgroundColor: claimFilter === f.id ? 'var(--text-main)' : '#FFFFFF',
                  color: claimFilter === f.id ? '#FFFFFF' : 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>

          {/* Claims Desktop Table */}
          <div className="desktop-only table-wrapper card" style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Claimant Name</th>
                  <th>Found Item</th>
                  <th>Private Ownership Evidence</th>
                  <th>Submitted</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredClaims.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No claims found for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredClaims.map(claim => {
                    const targetReportId = claim.foundReportId || claim.found_report_id || '';
                    const foundItem = reportById.get(targetReportId);
                    const claimantName = profileNames.get(claim.claimantId || claim.claimant_id || '') || 'Student';

                    return (
                      <tr key={claim.id}>
                        <td>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            backgroundColor: 
                              claim.status === 'APPROVED_FOR_HANDOVER' ? 'var(--success-light)' :
                              claim.status === 'DISPUTED' ? 'var(--danger-light)' :
                              claim.status === 'RESOLVED' ? 'var(--bg-secondary)' : 'var(--primary-light)',
                            color: 
                              claim.status === 'APPROVED_FOR_HANDOVER' ? 'var(--success)' :
                              claim.status === 'DISPUTED' ? 'var(--danger)' :
                              claim.status === 'RESOLVED' ? 'var(--text-muted)' : 'var(--primary)'
                          }}>
                            {claim.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                          {claimantName}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {foundItem?.title || 'Found Item'}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                            {foundItem?.campusZone || foundItem?.location || 'Campus Location'}
                          </div>
                        </td>
                        <td style={{ maxWidth: '340px' }}>
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: 1.4, backgroundColor: 'var(--bg-secondary)', padding: '6px 10px', borderRadius: '4px' }}>
                            "{claim.claimEvidence || claim.claim_evidence}"
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          {formatDateTime(claim.createdAt || claim.created_at)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {claim.status === 'APPROVED_FOR_HANDOVER' ? (
                              <button
                                onClick={() => {
                                  setResolvingClaim(claim);
                                  setResolutionError(null);
                                  setIdVerified(false);
                                }}
                                className="btn btn-primary btn-sm"
                                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                              >
                                Confirm Handover
                              </button>
                            ) : ['REQUESTED', 'UNDER_REVIEW', 'DISPUTED'].includes(claim.status) ? (
                              <>
                                <button
                                  onClick={() => handleApproveClaim(claim.id)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '4px 10px', fontSize: '0.78rem', color: 'var(--success)', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                                  title="Approve this claim for physical handover"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleRejectClaim(claim.id)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '4px 10px', fontSize: '0.78rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                  title="Reject claim"
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                Completed
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Claims Mobile Stacked Cards */}
          <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredClaims.length === 0 ? (
              <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No claims found for this filter.
              </div>
            ) : (
              filteredClaims.map(claim => {
                const targetReportId = claim.foundReportId || claim.found_report_id || '';
                const foundItem = reportById.get(targetReportId);
                const claimantName = profileNames.get(claim.claimantId || claim.claimant_id || '') || 'Student';

                return (
                  <div key={claim.id} className="record-card">
                    <div className="record-card-row">
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        backgroundColor: 
                          claim.status === 'APPROVED_FOR_HANDOVER' ? 'var(--success-light)' :
                          claim.status === 'DISPUTED' ? 'var(--danger-light)' :
                          claim.status === 'RESOLVED' ? 'var(--bg-secondary)' : 'var(--primary-light)',
                        color: 
                          claim.status === 'APPROVED_FOR_HANDOVER' ? 'var(--success)' :
                          claim.status === 'DISPUTED' ? 'var(--danger)' :
                          claim.status === 'RESOLVED' ? 'var(--text-muted)' : 'var(--primary)'
                      }}>
                        {claim.status.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                        {formatDate(claim.createdAt || claim.created_at)}
                      </span>
                    </div>

                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-main)' }}>
                        {foundItem?.title || 'Found Item'}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Claimant: <strong>{claimantName}</strong>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: 1.4, backgroundColor: 'var(--bg-secondary)', padding: '8px 10px', borderRadius: '4px' }}>
                      "{claim.claimEvidence || claim.claim_evidence}"
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '6px' }}>
                      {claim.status === 'APPROVED_FOR_HANDOVER' ? (
                        <button
                          onClick={() => {
                            setResolvingClaim(claim);
                            setResolutionError(null);
                            setIdVerified(false);
                          }}
                          className="btn btn-primary btn-sm"
                          style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                        >
                          Confirm Handover
                        </button>
                      ) : ['REQUESTED', 'UNDER_REVIEW', 'DISPUTED'].includes(claim.status) ? (
                        <>
                          <button
                            onClick={() => handleApproveClaim(claim.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '5px 10px', fontSize: '0.8rem', color: 'var(--success)' }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectClaim(claim.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '5px 10px', fontSize: '0.8rem', color: 'var(--danger)' }}
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 4: STUDENTS */}
      {/* ========================================================================= */}
      {activeSection === 'students' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Header & Search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 650, margin: '0 0 4px 0', color: 'var(--text-main)' }}>
                Student Campus Access & Memberships
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                Manage student accounts, reporting access, and active campus privileges.
              </p>
            </div>

            <div style={{ position: 'relative', width: '280px' }}>
              <input
                type="text"
                placeholder="Search students by name or role..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="form-control"
                style={{ fontSize: '0.84rem', paddingLeft: '32px' }}
              />
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            </div>
          </div>

          {/* Students Desktop Table */}
          <div className="desktop-only table-wrapper card" style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Campus Role</th>
                  <th>Access Status</th>
                  <th>Approved Date</th>
                  <th style={{ textAlign: 'right' }}>Access Control</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No student membership records match your query.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map(mem => {
                    const memUserId = mem.userId || mem.user_id || '';
                    const memType = mem.membershipType || mem.membership_type || 'student';
                    const displayName = mem.memberName || profileNames.get(memUserId) || 'Unnamed Student';

                    return (
                      <tr key={mem.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.86rem' }}>
                          {displayName}
                        </td>
                        <td>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            backgroundColor: memType === 'admin' ? 'var(--primary-light)' : 'var(--bg-secondary)',
                            color: memType === 'admin' ? 'var(--primary)' : 'var(--text-secondary)'
                          }}>
                            {memType.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            backgroundColor: mem.status === 'ACTIVE' ? 'var(--success-light)' : 'var(--danger-light)',
                            color: mem.status === 'ACTIVE' ? 'var(--success)' : 'var(--danger)'
                          }}>
                            {mem.status}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          {formatDate(mem.approvedAt || mem.approved_at || mem.createdAt || mem.created_at)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {memType === 'admin' ? (
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                              Admin Protected
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                const nextState = mem.status === 'ACTIVE' ? 'suspend' : 'reactivate';
                                setConfirmModal({
                                  title: `${nextState === 'suspend' ? 'Suspend' : 'Reactivate'} Student Access`,
                                  message: `Are you sure you want to ${nextState} campus reporting and claim privileges for "${displayName}"?`,
                                  confirmLabel: nextState === 'suspend' ? 'Suspend Access' : 'Reactivate Access',
                                  danger: nextState === 'suspend',
                                  onConfirm: async () => {
                                    await handleToggleMembershipStatus(memUserId, mem.status);
                                    setConfirmModal(null);
                                  }
                                });
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{
                                padding: '4px 10px',
                                fontSize: '0.76rem',
                                color: mem.status === 'ACTIVE' ? 'var(--danger)' : 'var(--success)',
                                borderColor: mem.status === 'ACTIVE' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'
                              }}
                            >
                              {mem.status === 'ACTIVE' ? 'Suspend Access' : 'Reactivate Access'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Students Mobile Stacked Cards */}
          <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredStudents.length === 0 ? (
              <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No student membership records match your query.
              </div>
            ) : (
              filteredStudents.map(mem => {
                const memUserId = mem.userId || mem.user_id || '';
                const memType = mem.membershipType || mem.membership_type || 'student';
                const displayName = mem.memberName || profileNames.get(memUserId) || 'Unnamed Student';

                return (
                  <div key={mem.id} className="record-card">
                    <div className="record-card-row">
                      <span style={{ fontWeight: 650, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                        {displayName}
                      </span>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        backgroundColor: mem.status === 'ACTIVE' ? 'var(--success-light)' : 'var(--danger-light)',
                        color: mem.status === 'ACTIVE' ? 'var(--success)' : 'var(--danger)'
                      }}>
                        {mem.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Role: <strong>{memType.toUpperCase()}</strong> · Approved: {formatDate(mem.approvedAt || mem.approved_at || mem.createdAt || mem.created_at)}
                    </div>

                    {memType !== 'admin' && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                        <button
                          onClick={() => {
                            const nextState = mem.status === 'ACTIVE' ? 'suspend' : 'reactivate';
                            setConfirmModal({
                              title: `${nextState === 'suspend' ? 'Suspend' : 'Reactivate'} Student Access`,
                              message: `Are you sure you want to ${nextState} campus privileges for "${displayName}"?`,
                              confirmLabel: nextState === 'suspend' ? 'Suspend' : 'Reactivate',
                              danger: nextState === 'suspend',
                              onConfirm: async () => {
                                await handleToggleMembershipStatus(memUserId, mem.status);
                                setConfirmModal(null);
                              }
                            });
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.76rem',
                            color: mem.status === 'ACTIVE' ? 'var(--danger)' : 'var(--success)'
                          }}
                        >
                          {mem.status === 'ACTIVE' ? 'Suspend Access' : 'Reactivate'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: REPORT DETAILS & MATCHES VIEW */}
      {/* ========================================================================= */}
      {selectedReport && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px'
          }}
          onClick={() => setSelectedId(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius)',
              padding: '24px',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  backgroundColor: selectedReport.status === 'resolved' ? 'var(--bg-secondary)' : selectedReport.type === 'lost' ? 'var(--danger-light)' : 'var(--success-light)',
                  color: selectedReport.status === 'resolved' ? 'var(--text-muted)' : selectedReport.type === 'lost' ? 'var(--danger)' : 'var(--success)'
                }}>
                  {selectedReport.type.toUpperCase()} · {selectedReport.status.toUpperCase()}
                </span>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '8px 0 2px 0', color: 'var(--text-main)' }}>
                  {selectedReport.title}
                </h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Reported by {selectedReport.reporterName || 'Campus Student'} on {formatDateTime(selectedReport.createdAt)}
                </div>
              </div>

              <button
                onClick={() => setSelectedId(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Image Preview if available */}
            {(selectedReport.imagePath || selectedReport.imageUrl) && (
              <div style={{ marginBottom: '16px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', minHeight: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {imageLoading ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
                    <span style={{ fontSize: '0.8rem' }}>Loading secure image...</span>
                  </div>
                ) : selectedImageUrl ? (
                  <img
                    src={selectedImageUrl}
                    alt={selectedReport.title}
                    style={{ width: '100%', maxHeight: '320px', objectFit: 'contain' }}
                  />
                ) : (
                  <div style={{ padding: '24px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Image not available or access expired.
                  </div>
                )}
              </div>
            )}

            {/* Attribute Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px', backgroundColor: 'var(--bg-secondary)', padding: '14px', borderRadius: 'var(--radius-sm)' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase' }}>Category</div>
                <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>{selectedReport.category}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase' }}>Location</div>
                <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>{selectedReport.campusZone || selectedReport.location}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase' }}>Incident Date</div>
                <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>{formatDate(selectedReport.date)}</div>
              </div>
              {selectedReport.brandModel && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase' }}>Brand / Model</div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>{selectedReport.brandModel}</div>
                </div>
              )}
              {selectedReport.color && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase' }}>Color</div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>{selectedReport.color}</div>
                </div>
              )}
            </div>

            {/* Description */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase', marginBottom: '6px' }}>
                Item Description
              </div>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.5, margin: 0 }}>
                {selectedReport.description}
              </p>
            </div>

            {/* Matched Pair candidates */}
            {matchedReportIds.has(selectedReport.id) && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
                  AI Matched Candidates
                </div>
                {matches
                  .filter(m => m.lostReportId === selectedReport.id || m.foundReportId === selectedReport.id)
                  .map(match => {
                    const otherReportId = match.lostReportId === selectedReport.id ? match.foundReportId : match.lostReportId;
                    const otherReport = reportById.get(otherReportId);
                    if (!otherReport) return null;
                    return (
                      <div
                        key={match.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--bg-secondary)',
                          marginBottom: '8px'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-main)' }}>
                            {otherReport.type.toUpperCase()}: {otherReport.title}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                            {otherReport.category} · {otherReport.location} · {formatDate(otherReport.date)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>
                            {match.score.score}% Match
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CONFIRM PHYSICAL HANDOVER RESOLUTION */}
      {/* ========================================================================= */}
      {resolvingClaim && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px'
          }}
          onClick={() => setResolvingClaim(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius)',
              padding: '24px',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--success-light)', color: 'var(--success)', fontWeight: 700 }}>
                  PHYSICAL HANDOVER VERIFICATION
                </span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '6px 0 2px 0', color: 'var(--text-main)' }}>
                  Authorize Physical Return
                </h3>
              </div>
              <button
                onClick={() => setResolvingClaim(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.4 }}>
              Confirm that the claimant is physically present at the helpdesk and has provided matching college identification.
            </p>

            {resolutionError && (
              <div style={{ padding: '8px 12px', borderRadius: '4px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '14px' }}>
                {resolutionError}
              </div>
            )}

            <div style={{ marginBottom: '16px', padding: '12px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-secondary)' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase', marginBottom: '4px' }}>
                Item to Return
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                {reportById.get(resolvingClaim.foundReportId || resolvingClaim.found_report_id || '')?.title || 'Found Item'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Claimant: <strong>{profileNames.get(resolvingClaim.claimantId || resolvingClaim.claimant_id || '') || 'Student'}</strong>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-main)' }}>
                <input
                  type="checkbox"
                  checked={idVerified}
                  onChange={(e) => setIdVerified(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                />
                <span>I have physically inspected the student's ID Card / PRN *</span>
              </label>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Condition / Verification Notes</label>
              <textarea
                value={conditionNotes}
                onChange={(e) => setConditionNotes(e.target.value)}
                className="form-control"
                rows={3}
                style={{ fontSize: '0.84rem' }}
                placeholder="Notes on item condition and handover record..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setResolvingClaim(null)}
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem' }}
                disabled={resolutionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteHandover}
                className="btn btn-primary"
                style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                disabled={resolutionLoading || !idVerified}
              >
                {resolutionLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                Confirm Return & Resolve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CONFIRMATION PROMPT MODAL */}
      {/* ========================================================================= */}
      {confirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px'
          }}
          onClick={() => setConfirmModal(null)}
        >
          <div
            className="card"
            style={{
              maxWidth: '440px',
              width: '100%',
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius)',
              padding: '24px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-main)' }}>
              {confirmModal.title}
            </h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: '0 0 20px 0', lineHeight: 1.4 }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setConfirmModal(null)}
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem' }}
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmModal.onConfirm()}
                className={confirmModal.danger ? 'btn btn-danger' : 'btn btn-primary'}
                style={{ fontSize: '0.82rem' }}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
