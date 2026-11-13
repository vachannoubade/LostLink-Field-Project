import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  AlertTriangle,
  X,
  History,
  Building,
  Plus,
  LogOut
} from 'lucide-react';
import { useAuth } from '../store/AuthContext';
import { supabase } from '../lib/supabase';
import {
  getReportImageSignedUrl,
  isStoragePath
} from '../lib/storage';
import { generateMatches } from '../utils/matching';
import type { Category, Match, Report, ReportType, Claim, CampusMembership, StaffAllowlistEntry, AuditLog } from '../types';

type MainSection = 'reports' | 'claims' | 'disputes' | 'memberships' | 'audit';
type ReportSubTab = 'active' | 'matched' | 'resolved';

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

  const [reports, setReports] = useState<Report[]>([]);
  const [persistedMatches, setPersistedMatches] = useState<Match[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [memberships, setMemberships] = useState<CampusMembership[]>([]);
  const [staffAllowlist, setStaffAllowlist] = useState<StaffAllowlistEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Navigation
  const [activeSection, setActiveSection] = useState<MainSection>('reports');
  const [reportSubTab, setReportSubTab] = useState<ReportSubTab>('active');
  const [search, setSearch] = useState('');

  // Selected Report Modal
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  // Handover Resolution Modal State
  const [resolvingClaim, setResolvingClaim] = useState<Claim | null>(null);
  const [idVerified, setIdVerified] = useState(false);
  const [conditionNotes, setConditionNotes] = useState('Standard verification completed. Item in good condition.');
  const [resolutionLoading, setResolutionLoading] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  // New Staff Modal State
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffDept, setNewStaffDept] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'staff' | 'desk_operator'>('staff');
  const [addStaffLoading, setAddStaffLoading] = useState(false);

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
        membershipsResult,
        staffResult,
        auditResult
      ] = await Promise.all([
        supabase.from('reports').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, name'),
        supabase.from('matches').select('*').order('created_at', { ascending: false }),
        supabase.from('claims').select('*').order('created_at', { ascending: false }),
        supabase.from('campus_memberships').select('*').order('created_at', { ascending: false }),
        supabase.from('staff_allowlist').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50)
      ]);

      if (reportsResult.error) {
        setError(`Could not load reports: ${reportsResult.error.message}`);
        return;
      }

      const profileNames = new Map<string, string>(
        ((profilesResult.data || []) as AdminProfileRow[]).map(row => [row.id, row.name])
      );

      setReports(
        ((reportsResult.data || []) as AdminReportRow[]).map(row =>
          toReport(row, profileNames.get(row.user_id) || 'Campus Student')
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
          (membershipsResult.data as Record<string, unknown>[]).map(row => ({
            id: row.id as string,
            userId: (row.user_id || row.userId || '') as string,
            user_id: (row.user_id || row.userId || '') as string,
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
          }))
        );
      }

      if (!staffResult.error && staffResult.data) {
        setStaffAllowlist(
          (staffResult.data as Record<string, unknown>[]).map(row => ({
            id: row.id as string,
            email: row.email as string,
            name: row.name as string,
            department: (row.department || 'General') as string,
            role: (row.role || 'staff') as StaffAllowlistEntry['role'],
            isActive: Boolean(row.is_active ?? row.isActive),
            is_active: Boolean(row.is_active ?? row.isActive),
            createdAt: (row.created_at || row.createdAt || '') as string,
            updatedAt: (row.updated_at || row.updatedAt || '') as string
          }))
        );
      }

      if (!auditResult.error && auditResult.data) {
        setAuditLogs(auditResult.data as AuditLog[]);
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

  // Derived matching
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

  // Approve Claim for Handover
  const handleApproveClaim = async (claimId: string, notes?: string) => {
    if (!supabase || !claimId) return;
    setError(null);
    setActionSuccess(null);
    try {
      const { error: rpcErr } = await supabase.rpc('review_claim_status', {
        p_claim_id: claimId,
        p_new_status: 'APPROVED_FOR_HANDOVER',
        p_review_notes: notes || 'Approved for physical handover at campus helpdesk.'
      });
      if (rpcErr) {
        setError(rpcErr.message);
      } else {
        setActionSuccess('Claim approved for handover! Desk operator may now proceed with physical handover.');
        refreshRecords();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve claim.');
    }
  };

  // Handover Execution
  const handleExecuteHandover = async () => {
    if (!supabase || !resolvingClaim) return;
    if (!idVerified) {
      setResolutionError('Student identity card / PRN must be physically verified.');
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

      setActionSuccess(`Physical handover recorded and claim resolved successfully! Handover ID: ${(data as { handover_id?: string })?.handover_id || 'OK'}`);
      setResolvingClaim(null);
      setIdVerified(false);
      refreshRecords();
    } catch (err) {
      setResolutionError(err instanceof Error ? err.message : 'Failed to complete handover.');
    } finally {
      setResolutionLoading(false);
    }
  };

  // Add Staff Allowlist Entry
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newStaffEmail.trim() || !newStaffName.trim()) return;

    setAddStaffLoading(true);
    try {
      const { error: insertErr } = await supabase.rpc('admin_add_staff_allowlist', {
        p_email: newStaffEmail.trim().toLowerCase(),
        p_name: newStaffName.trim(),
        p_department: newStaffDept.trim() || 'General',
        p_role: newStaffRole
      });

      if (insertErr) {
        setError(`Failed to add staff allowlist entry: ${insertErr.message}`);
      } else {
        setActionSuccess(`Staff member ${newStaffName} (${newStaffEmail}) successfully pre-approved.`);
        setShowAddStaffModal(false);
        setNewStaffEmail('');
        setNewStaffName('');
        setNewStaffDept('');
        refreshRecords();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error adding staff entry.');
    } finally {
      setAddStaffLoading(false);
    }
  };

  // Toggle Staff Active Status via Secure Admin RPC
  const handleToggleStaffStatus = async (id: string, currentStatus: boolean) => {
    if (!supabase) return;
    try {
      const nextStatus = !currentStatus;
      const { error: rpcErr } = await supabase.rpc('admin_toggle_staff_allowlist', {
        p_id: id,
        p_is_active: nextStatus
      });
      if (rpcErr) {
        setError(`Failed to update staff status: ${rpcErr.message}`);
      } else {
        setActionSuccess(`Staff approval ${nextStatus ? 'activated' : 'deactivated'}.`);
        refreshRecords();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating staff status.');
    }
  };

  // Toggle Membership Status via Secure Admin RPC
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
        setActionSuccess(`Membership status updated to ${nextStatus}.`);
        refreshRecords();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating membership status.');
    }
  };

  // Grant or Revoke Desk-Operator Role via Secure Admin RPC
  const handleSetMembershipRole = async (userId: string, newRole: string) => {
    if (!supabase || !userId) return;
    try {
      const { error: rpcErr } = await supabase.rpc('admin_set_membership_role', {
        p_user_id: userId,
        p_role: newRole
      });
      if (rpcErr) {
        setError(`Failed to update membership role: ${rpcErr.message}`);
      } else {
        setActionSuccess(`Membership role updated to ${newRole}.`);
        refreshRecords();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating membership role.');
    }
  };

  const activeCount = reports.filter(r => r.status !== 'resolved').length;
  const resolvedCount = reports.filter(r => r.status === 'resolved').length;
  const pendingClaimsCount = claims.filter(c => ['REQUESTED', 'UNDER_REVIEW', 'APPROVED_FOR_HANDOVER'].includes(c.status)).length;
  const disputeClaimsCount = claims.filter(c => c.status === 'DISPUTED').length;

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports.filter(report => {
      if (reportSubTab === 'active' && report.status === 'resolved') return false;
      if (reportSubTab === 'resolved' && report.status !== 'resolved') return false;
      if (reportSubTab === 'matched' && !matchedReportIds.has(report.id)) return false;

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
  }, [reportSubTab, matchedReportIds, reports, search]);

  const openRecord = useCallback((reportId: string) => {
    const report = reportById.get(reportId);
    setSelectedImageUrl(null);
    setImageFailed(false);
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
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
        <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px', color: 'var(--primary)' }} />
        <p style={{ color: 'var(--text-muted)' }}>Authenticating administrative console...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '60px' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 650, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
              ADMINISTRATIVE AUDIT CONSOLE
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SANJAY GHODAWAT UNIVERSITY</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 650, color: 'var(--text-main)', margin: 0 }}>
            LostLink Administration & Helpdesk
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{
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
            <ShieldCheck size={15} color="var(--primary)" />
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{user?.email || 'vachannoubade@gmail.com'}</span>
          </div>

          <button 
            onClick={refreshRecords}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} /> Refresh Data
          </button>

          <button 
            onClick={handleAdminSignOut}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.25)' }}
            title="Sign out of administrative console"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>

      {/* Configurable Campus Helpdesk Indicator Banner */}
      <div style={{
        padding: '14px 18px',
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '6px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 650, color: 'var(--text-main)' }}>
              Central Campus Helpdesk — Configuration Pending / Managed by Initial Administrator
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Physical helpdesk operator provisioning remains pending. Current desk operations managed by vachannoubade@gmail.com.
            </div>
          </div>
        </div>
        <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600 }}>
          DESK CONFIGURATION INCOMPLETE
        </span>
      </div>

      {/* KPI Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '16px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase' }}>Active Reports</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>{activeCount}</div>
        </div>
        <div className="card" style={{ padding: '16px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase' }}>Claims in Queue</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: pendingClaimsCount > 0 ? 'var(--primary)' : 'var(--text-main)', marginTop: '4px' }}>
            {pendingClaimsCount}
          </div>
        </div>
        <div className="card" style={{ padding: '16px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase' }}>Competing Disputes</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: disputeClaimsCount > 0 ? 'var(--danger)' : 'var(--text-main)', marginTop: '4px' }}>
            {disputeClaimsCount}
          </div>
        </div>
        <div className="card" style={{ padding: '16px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase' }}>Resolved Archive</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>{resolvedCount}</div>
        </div>
        <div className="card" style={{ padding: '16px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase' }}>Campus Memberships</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>{memberships.length}</div>
        </div>
      </div>

      {actionSuccess && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: 'var(--success-light)', color: 'var(--success)', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '18px' }}>
          <CheckCircle2 size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '18px' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
        {[
          { id: 'reports', label: 'Reports & Matches', icon: FileText, badge: reports.length },
          { id: 'claims', label: 'Claims & Handover Queue', icon: ShieldCheck, badge: pendingClaimsCount },
          { id: 'disputes', label: 'Disputes', icon: AlertTriangle, badge: disputeClaimsCount },
          { id: 'memberships', label: 'Members & Allowlist', icon: Users, badge: memberships.length },
          { id: 'audit', label: 'Audit Logs', icon: History, badge: auditLogs.length }
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
                padding: '10px 16px',
                border: 'none',
                background: 'none',
                borderBottom: `2px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: isActive ? 650 : 500,
                fontSize: '0.88rem',
                cursor: 'pointer',
                marginBottom: '-1px'
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
              {tab.badge > 0 && (
                <span style={{
                  padding: '1px 6px',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  backgroundColor: isActive ? 'var(--primary)' : 'var(--bg-color)',
                  color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                  fontWeight: 650
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* SECTION 1: REPORTS */}
      {activeSection === 'reports' && (
        <div>
          {/* Sub tabs & Search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { id: 'active', label: 'Active Reports', count: activeCount },
                { id: 'matched', label: 'Matched Candidates', count: matchedReportIds.size },
                { id: 'resolved', label: 'Resolved Archive', count: resolvedCount }
              ].map(sub => (
                <button
                  key={sub.id}
                  onClick={() => setReportSubTab(sub.id as ReportSubTab)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    border: '1px solid var(--border)',
                    backgroundColor: reportSubTab === sub.id ? 'var(--text-main)' : '#FFFFFF',
                    color: reportSubTab === sub.id ? '#FFFFFF' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {sub.label} ({sub.count})
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', width: '280px' }}>
              <input
                type="text"
                placeholder="Search reports..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-control"
                style={{ fontSize: '0.84rem', paddingLeft: '32px' }}
              />
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            </div>
          </div>

          {/* Reports Table */}
          <div className="card" style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-color)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Title & Brand</th>
                  <th style={{ padding: '12px 16px' }}>Category</th>
                  <th style={{ padding: '12px 16px' }}>Location / Zone</th>
                  <th style={{ padding: '12px 16px' }}>Date</th>
                  <th style={{ padding: '12px 16px' }}>Reporter</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No reports found in this category.
                    </td>
                  </tr>
                ) : (
                  filteredReports.map(report => (
                    <tr key={report.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 650,
                          backgroundColor: report.status === 'resolved' ? 'var(--bg-color)' : report.type === 'lost' ? 'var(--danger-light)' : 'var(--success-light)',
                          color: report.status === 'resolved' ? 'var(--text-muted)' : report.type === 'lost' ? 'var(--danger)' : 'var(--success)'
                        }}>
                          {report.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-main)' }}>
                        <div>{report.title}</div>
                        {report.brandModel && (
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                            {report.brandModel} {report.color ? `• ${report.color}` : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {report.category}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {report.campusZone || report.location}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {formatDate(report.date)}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {report.reporterName || 'Student'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button 
                          onClick={() => openRecord(report.id)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 2: CLAIMS & HANDOVER QUEUE */}
      {activeSection === 'claims' && (
        <div>
          <div className="card" style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-color)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>Claim Status</th>
                  <th style={{ padding: '12px 16px' }}>Target Found Item</th>
                  <th style={{ padding: '12px 16px' }}>Claimant Evidence (Private)</th>
                  <th style={{ padding: '12px 16px' }}>Submitted</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Desk Action</th>
                </tr>
              </thead>
              <tbody>
                {claims.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No claims currently submitted.
                    </td>
                  </tr>
                ) : (
                  claims.map(claim => {
                    const targetReportId = claim.foundReportId || claim.found_report_id || '';
                    const foundItem = reportById.get(targetReportId);
                    return (
                      <tr key={claim.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            backgroundColor: 
                              claim.status === 'APPROVED_FOR_HANDOVER' ? 'var(--success-light)' :
                              claim.status === 'DISPUTED' ? 'var(--danger-light)' :
                              claim.status === 'RESOLVED' ? 'var(--bg-color)' : 'var(--primary-light)',
                            color: 
                              claim.status === 'APPROVED_FOR_HANDOVER' ? 'var(--success)' :
                              claim.status === 'DISPUTED' ? 'var(--danger)' :
                              claim.status === 'RESOLVED' ? 'var(--text-muted)' : 'var(--primary)'
                          }}>
                            {claim.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {foundItem?.title || targetReportId.slice(0, 8)}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                            {foundItem?.campusZone || foundItem?.location || 'Campus Location'}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', maxWidth: '340px' }}>
                          <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: 1.4, backgroundColor: 'var(--bg-color)', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                            "{claim.claimEvidence || claim.claim_evidence}"
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          {formatDateTime(claim.createdAt || claim.created_at)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {claim.status === 'APPROVED_FOR_HANDOVER' ? (
                            <button
                              onClick={() => {
                                setResolvingClaim(claim);
                                setResolutionError(null);
                                setIdVerified(false);
                              }}
                              className="btn btn-primary"
                              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                            >
                              Authorize Handover
                            </button>
                          ) : (claim.status === 'REQUESTED' || claim.status === 'UNDER_REVIEW') ? (
                            <button
                              onClick={() => handleApproveClaim(claim.id)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.78rem', color: 'var(--primary)', borderColor: 'var(--primary)' }}
                            >
                              Approve Claim
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 3: DISPUTES */}
      {activeSection === 'disputes' && (
        <div>
          <div style={{ marginBottom: '16px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            When multiple students claim the same found specimen, the recovery state machine automatically tags all competing claims as <strong>DISPUTED</strong>. Review evidence side-by-side prior to authorizing return.
          </div>

          {claims.filter(c => c.status === 'DISPUTED').length === 0 ? (
            <div className="card" style={{ padding: '48px', textAlign: 'center', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <CheckCircle2 size={36} color="var(--success)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)' }}>No Active Disputes</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
                All campus found items have singular or resolved claims.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {claims.filter(c => c.status === 'DISPUTED').map(disputeClaim => {
                const targetReportId = disputeClaim.foundReportId || disputeClaim.found_report_id || '';
                const foundItem = reportById.get(targetReportId);
                return (
                  <div key={disputeClaim.id} className="card" style={{ padding: '20px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', fontWeight: 700 }}>
                          DISPUTED CLAIM
                        </span>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 650, margin: '6px 0 2px 0', color: 'var(--text-main)' }}>
                          Item: {foundItem?.title || targetReportId}
                        </h3>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          Found at {foundItem?.location} on {formatDate(foundItem?.date)}
                        </div>
                      </div>

                      <button
                        onClick={() => handleApproveClaim(disputeClaim.id, 'Awarded to claimant after dispute review.')}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                      >
                        Award to this Claimant
                      </button>
                    </div>

                    <div style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 650, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                        CLAIMANT EVIDENCE STATEMENT
                      </div>
                      <div style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>
                        "{disputeClaim.claimEvidence || disputeClaim.claim_evidence}"
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: MEMBERSHIPS & STAFF ALLOWLIST */}
      {activeSection === 'memberships' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Staff Allowlist Block */}
          <div className="card" style={{ padding: '24px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 650, margin: '0 0 4px 0', color: 'var(--text-main)' }}>
                  Pre-Approved Staff & Desk Operator Allowlist
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Faculty, department advisors, and campus security desk operators pre-approved for university registration.
                </p>
              </div>
              <button
                onClick={() => setShowAddStaffModal(true)}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 14px' }}
              >
                <Plus size={15} /> Pre-Approve Staff
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-color)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px' }}>Name</th>
                  <th style={{ padding: '10px 14px' }}>Email</th>
                  <th style={{ padding: '10px 14px' }}>Department</th>
                  <th style={{ padding: '10px 14px' }}>Role</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {staffAllowlist.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No staff allowlist entries configured yet.
                    </td>
                  </tr>
                ) : (
                  staffAllowlist.map(entry => {
                    const isStaffActive = entry.isActive ?? entry.is_active ?? true;
                    return (
                      <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{entry.name}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{entry.email}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{entry.department}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 650, padding: '2px 6px', borderRadius: '4px', backgroundColor: entry.role === 'desk_operator' ? 'var(--primary-light)' : 'var(--bg-color)', color: entry.role === 'desk_operator' ? 'var(--primary)' : 'var(--text-main)' }}>
                            {entry.role}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ color: isStaffActive ? 'var(--success)' : 'var(--danger)', fontWeight: 600, fontSize: '0.78rem' }}>
                            {isStaffActive ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleToggleStaffStatus(entry.id, isStaffActive)}
                            className="btn btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '0.74rem' }}
                          >
                            {isStaffActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Memberships Table */}
          <div className="card" style={{ padding: '24px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 650, margin: '0 0 4px 0', color: 'var(--text-main)' }}>
              Server-Controlled Campus Memberships
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
              Database RLS verifies active membership on every report write and claim submission.
            </p>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-color)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px' }}>User ID</th>
                  <th style={{ padding: '10px 14px' }}>Type</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px' }}>Approved At</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Authorization Action</th>
                </tr>
              </thead>
              <tbody>
                {memberships.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No active memberships recorded.
                    </td>
                  </tr>
                ) : (
                  memberships.map(mem => {
                    const memUserId = mem.userId || mem.user_id || '';
                    const memType = mem.membershipType || mem.membership_type || 'student';
                    return (
                      <tr key={mem.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                          {memUserId.slice(0, 16)}...
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                          {memType.toUpperCase()}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
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
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          {formatDateTime(mem.approvedAt || mem.approved_at || mem.createdAt || mem.created_at)}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {memType !== 'admin' && (
                              <button
                                onClick={() => handleToggleMembershipStatus(memUserId, mem.status)}
                                className="btn btn-secondary"
                                style={{ padding: '3px 8px', fontSize: '0.74rem', color: mem.status === 'ACTIVE' ? 'var(--danger)' : 'var(--success)' }}
                              >
                                {mem.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                              </button>
                            )}
                            {memType === 'desk_operator' && (
                              <button
                                onClick={() => handleSetMembershipRole(memUserId, 'staff')}
                                className="btn btn-secondary"
                                style={{ padding: '3px 8px', fontSize: '0.74rem' }}
                                title="Revoke desk operator authorization"
                              >
                                Revoke Desk
                              </button>
                            )}
                            {(memType === 'staff' || memType === 'student') && (
                              <button
                                onClick={() => handleSetMembershipRole(memUserId, 'desk_operator')}
                                className="btn btn-secondary"
                                style={{ padding: '3px 8px', fontSize: '0.74rem', color: 'var(--primary)' }}
                                title="Grant desk operator authorization"
                              >
                                Grant Desk
                              </button>
                            )}
                            {memType === 'admin' && (
                              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                Admin Protected
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
        </div>
      )}

      {/* SECTION 5: AUDIT LOGS */}
      {activeSection === 'audit' && (
        <div className="card" style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-color)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 14px' }}>Timestamp</th>
                <th style={{ padding: '10px 14px' }}>Action</th>
                <th style={{ padding: '10px 14px' }}>Target ID</th>
                <th style={{ padding: '10px 14px' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No audit records logged yet.
                  </td>
                </tr>
              ) : (
                auditLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {formatDateTime(log.created_at)}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 650, fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                      {log.action}
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {log.target_id ? log.target_id.slice(0, 12) + '...' : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* RESOLUTION & HANDOVER MODAL */}
      {resolvingClaim && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', padding: '24px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 650, margin: 0 }}>Authorize Physical Handover</h3>
              <button onClick={() => setResolvingClaim(null)} className="btn btn-ghost" style={{ padding: '4px' }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              This action marks the item as <strong>RESOLVED</strong>, confirms physical helpdesk custody, and rejects competing claims.
            </p>

            <div style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '4px', border: '1px solid var(--border)', marginBottom: '16px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase', marginBottom: '2px' }}>
                CLAIM EVIDENCE
              </div>
              <div style={{ fontSize: '0.86rem', color: 'var(--text-main)' }}>
                "{resolvingClaim.claimEvidence || resolvingClaim.claim_evidence}"
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Desk Condition Notes</label>
              <input
                type="text"
                className="form-control"
                value={conditionNotes}
                onChange={(e) => setConditionNotes(e.target.value)}
                style={{ fontSize: '0.86rem' }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', marginBottom: '18px', fontSize: '0.84rem', color: 'var(--text-main)' }}>
              <input
                type="checkbox"
                checked={idVerified}
                onChange={(e) => setIdVerified(e.target.checked)}
                style={{ marginTop: '2px' }}
              />
              <span>
                <strong>Physically verified student ID / PRN</strong> matching claimant record.
              </span>
            </label>

            {resolutionError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '4px', fontSize: '0.82rem', marginBottom: '14px' }}>
                <AlertCircle size={15} />
                <span>{resolutionError}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setResolvingClaim(null)} className="btn btn-secondary" disabled={resolutionLoading}>
                Cancel
              </button>
              <button onClick={handleExecuteHandover} className="btn btn-primary" disabled={resolutionLoading}>
                {resolutionLoading ? 'Executing Handover...' : 'Complete Handover'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD STAFF MODAL */}
      {showAddStaffModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '460px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', padding: '24px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 650, margin: 0 }}>Pre-Approve Staff Member</h3>
              <button onClick={() => setShowAddStaffModal(false)} className="btn btn-ghost" style={{ padding: '4px' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddStaff}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Staff Name *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. Dr. Rajesh Sharma"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Official Email *</label>
                  <input
                    type="email"
                    required
                    className="form-control"
                    placeholder="e.g. r.sharma@sguk.ac.in"
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Department</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Computer Science & Eng."
                    value={newStaffDept}
                    onChange={(e) => setNewStaffDept(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Role *</label>
                  <select
                    className="form-control"
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as 'staff' | 'desk_operator')}
                  >
                    <option value="staff">Staff / Faculty</option>
                    <option value="desk_operator">Desk Operator (Campus Helpdesk)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setShowAddStaffModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={addStaffLoading}>
                  {addStaffLoading ? 'Adding...' : 'Pre-Approve'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REPORT DETAILS ASIDE MODAL */}
      <AnimatePresence>
        {selectedReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.45)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
            onClick={() => setSelectedId(null)}
          >
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              style={{ width: '100%', maxWidth: '520px', height: '100%', backgroundColor: '#FFFFFF', padding: '28px', overflowY: 'auto', borderLeft: '1px solid var(--border)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: selectedReport.status === 'resolved' ? 'var(--bg-color)' : 'var(--primary-light)', color: selectedReport.status === 'resolved' ? 'var(--text-muted)' : 'var(--primary)' }}>
                  {selectedReport.status.toUpperCase()} RECORD
                </span>
                <button onClick={() => setSelectedId(null)} className="btn btn-ghost" style={{ padding: '4px' }}>
                  <X size={18} />
                </button>
              </div>

              <h2 style={{ fontSize: '1.4rem', fontWeight: 650, color: 'var(--text-main)', margin: '0 0 16px 0' }}>
                {selectedReport.title}
              </h2>

              {/* Image Preview */}
              {(selectedReport.imagePath || selectedReport.imageUrl) && (
                <div style={{ height: '200px', backgroundColor: 'var(--bg-color)', borderRadius: '6px', overflow: 'hidden', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {imageLoading ? (
                    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                  ) : selectedImageUrl && !imageFailed ? (
                    <img src={selectedImageUrl} alt={selectedReport.title} onError={() => setImageFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Image unavailable</span>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.86rem', color: 'var(--text-main)' }}>
                <div><strong>Category:</strong> {selectedReport.category}</div>
                <div><strong>Location / Zone:</strong> {selectedReport.campusZone || selectedReport.location}</div>
                <div><strong>Date:</strong> {formatDate(selectedReport.date)}</div>
                <div><strong>Reporter:</strong> {selectedReport.reporterName}</div>
                {selectedReport.brandModel && <div><strong>Brand / Model:</strong> {selectedReport.brandModel}</div>}
                {selectedReport.color && <div><strong>Color:</strong> {selectedReport.color}</div>}
                {selectedReport.distinguishingFeatures && <div><strong>Distinguishing Marks:</strong> {selectedReport.distinguishingFeatures}</div>}
                {selectedReport.custodyStatus && <div><strong>Custody Status:</strong> {selectedReport.custodyStatus}</div>}
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 650, textTransform: 'uppercase', marginBottom: '4px' }}>Description</div>
                  <div style={{ backgroundColor: 'var(--bg-color)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border)', lineHeight: 1.5 }}>
                    {selectedReport.description}
                  </div>
                </div>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
