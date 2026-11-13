import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  Archive,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  User,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/AuthContext';
import {
  getReportImageSignedUrl,
  isSensitiveImagePath,
  isStoragePath
} from '../lib/storage';
import { generateMatches } from '../utils/matching';
import { getCategoryIllustration } from '../utils/categoryArt';
import type { Category, Match, Report, ReportType } from '../types';

type AdminTab = 'active' | 'matched' | 'resolved';

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
  const { profile } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [persistedMatches, setPersistedMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(
    supabase ? null : 'Supabase is not configured. Administrative records are unavailable.'
  );
  const [matchNotice, setMatchNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('active');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const loadRecords = useCallback(async () => {
    if (!supabase) return;

    try {
      const { data: isAdmin, error: adminError } = await supabase.rpc('is_current_user_admin');

      if (adminError) {
        setError(
          'Administrative verification failed. Confirm that the stage-ready access hardening migration has been applied, then sign out and sign in again.'
        );
        return;
      }

      if (isAdmin !== true) {
        setError('Your session does not carry the server-issued administrator role.');
        return;
      }

      const [reportsResult, profilesResult, matchesResult] = await Promise.all([
        supabase
          .from('reports')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, name'),
        supabase
          .from('matches')
          .select('*')
          .order('created_at', { ascending: false })
      ]);

      if (reportsResult.error) {
        setError(`Could not load reports: ${reportsResult.error.message}`);
        return;
      }

      if (profilesResult.error) {
        setError(`Could not load reporter profiles: ${profilesResult.error.message}`);
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

      if (matchesResult.error) {
        setPersistedMatches([]);
        setMatchNotice(
          'Persisted match records are unavailable. Showing live-generated candidate matches only.'
        );
      } else {
        setPersistedMatches(((matchesResult.data || []) as AdminMatchRow[]).map(toMatch));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load administrative records.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshRecords = useCallback(() => {
    setLoading(true);
    setError(null);
    setMatchNotice(null);
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

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

  const activeCount = reports.filter(report => report.status !== 'resolved').length;
  const resolvedCount = reports.filter(report => report.status === 'resolved').length;
  const matchedCount = reports.filter(report => matchedReportIds.has(report.id)).length;

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();

    return reports.filter(report => {
      if (activeTab === 'active' && report.status === 'resolved') return false;
      if (activeTab === 'resolved' && report.status !== 'resolved') return false;
      if (activeTab === 'matched' && !matchedReportIds.has(report.id)) return false;

      if (!query) return true;

      return [
        report.id,
        report.title,
        report.description,
        report.location,
        report.category,
        report.type,
        report.reporterName || ''
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [activeTab, matchedReportIds, reports, search]);

  const openRecord = useCallback((reportId: string) => {
    const report = reportById.get(reportId);
    setSelectedImageUrl(null);
    setImageFailed(false);
    setImageLoading(Boolean(report?.imagePath || report?.imageUrl));
    setSelectedId(reportId);
  }, [reportById]);

  const selectedReport = selectedId ? reportById.get(selectedId) || null : null;
  const selectedMatches = useMemo(() => {
    if (!selectedReport) return [];
    return matches
      .filter(match =>
        match.lostReportId === selectedReport.id || match.foundReportId === selectedReport.id
      )
      .sort((a, b) => b.score.score - a.score.score);
  }, [matches, selectedReport]);

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

  useEffect(() => {
    if (!selectedId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  const tabs: Array<{ id: AdminTab; label: string; count: number }> = [
    { id: 'active', label: 'Active records', count: activeCount },
    { id: 'matched', label: 'Matched', count: matchedCount },
    { id: 'resolved', label: 'Resolved archive', count: resolvedCount }
  ];

  const renderStatus = (report: Report) => {
    if (report.status === 'resolved') {
      return <span className="badge badge-match">Resolved</span>;
    }
    return report.type === 'lost'
      ? <span className="badge badge-lost">Lost</span>
      : <span className="badge badge-found">Found</span>;
  };

  return (
    <div style={{ paddingBottom: '52px', maxWidth: '1120px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '18px',
          marginBottom: '24px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <span className="mono-token mono-token-amber">ADMINISTRATOR REGISTRY</span>
            <span className="mono-token mono-token-subtle">RESTRICTED ACCESS</span>
          </div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 700, letterSpacing: '-0.035em', margin: 0, lineHeight: 1.15 }}>
            Campus Oversight Docket
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.96rem', marginTop: '6px', maxWidth: '680px', lineHeight: 1.55 }}>
            Read-only access to active reports, generated match candidates, and the resolved archive.
            Administrative identity is verified against the server-issued session claim.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '9px 14px',
            borderRadius: '999px',
            backgroundColor: 'var(--success-light)',
            border: '1px solid var(--success-border)',
            color: '#065F46',
            fontSize: '0.8rem',
            fontWeight: 650
          }}
        >
          <ShieldCheck size={16} />
          <span>{profile?.name || 'Administrator'} · verified</span>
        </div>
      </div>

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '14px 16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 'var(--radius-sm)',
            color: '#991B1B',
            marginBottom: '20px',
            fontSize: '0.9rem',
            lineHeight: 1.5
          }}
          role="alert"
        >
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div style={{ flex: 1 }}>{error}</div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '2px 4px', color: '#991B1B' }}
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {matchNotice && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '11px 14px',
            backgroundColor: 'var(--warning-light)',
            border: '1px solid var(--warning-border)',
            borderRadius: 'var(--radius-sm)',
            color: '#92400E',
            marginBottom: '20px',
            fontSize: '0.84rem'
          }}
          role="status"
        >
          <Sparkles size={16} style={{ flexShrink: 0 }} />
          <span>{matchNotice}</span>
        </div>
      )}

      <div className="admin-stat-grid">
        {[
          { label: 'ACTIVE RECORDS', value: activeCount, color: 'var(--primary)', icon: <FileText size={17} /> },
          { label: 'MATCHED RECORDS', value: matchedCount, color: 'var(--warning)', icon: <Sparkles size={17} /> },
          { label: 'RESOLVED ARCHIVE', value: resolvedCount, color: 'var(--success)', icon: <Archive size={17} /> },
          { label: 'TOTAL RECORDS', value: reports.length, color: 'var(--text-main)', icon: <ShieldCheck size={17} /> }
        ].map(stat => (
          <div
            key={stat.label}
            className="card"
            style={{ padding: '16px 18px', boxShadow: 'var(--shadow-sm)' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                color: 'var(--text-muted)',
                fontSize: '0.68rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                letterSpacing: '0.04em',
                marginBottom: '8px'
              }}
            >
              <span>{stat.label}</span>
              <span style={{ color: stat.color }}>{stat.icon}</span>
            </div>
            <div style={{ fontSize: '1.9rem', lineHeight: 1, fontWeight: 750, fontFamily: 'var(--font-mono)', color: stat.color }}>
              {loading ? '—' : stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="admin-toolbar card">
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={isActive}
                style={{
                  padding: '8px 12px',
                  borderRadius: '7px',
                  border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                  backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                  boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                  color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                  fontSize: '0.82rem',
                  fontWeight: 650,
                  transition: 'var(--transition-fast)'
                }}
              >
                {tab.label}
                <span
                  style={{
                    marginLeft: '7px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    color: isActive ? 'var(--primary)' : 'var(--text-tertiary)'
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="admin-toolbar-actions">
          <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '340px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="search"
              className="form-control"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search title, owner, location, ref..."
              aria-label="Search administrative records"
              style={{ paddingLeft: '36px', height: '38px', fontSize: '0.84rem' }}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={refreshRecords}
            disabled={loading}
            style={{ padding: '8px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
          >
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <span className="docket-meta">
          {loading ? 'QUERYING REGISTRY…' : `${filteredReports.length} RECORD${filteredReports.length === 1 ? '' : 'S'} DISPLAYED`}
        </span>
        <span className="docket-meta">READ-ONLY OVERSIGHT · NO CLIENT-SIDE MUTATIONS</span>
      </div>

      {loading ? (
        <div className="card" style={{ padding: '64px 24px', textAlign: 'center' }}>
          <Loader2 size={34} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 14px', color: 'var(--primary)' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading campus administrative records…</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}
          >
            <Archive size={26} />
          </div>
          <h2 style={{ fontSize: '1.08rem', marginBottom: '6px' }}>No matching records</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            {search ? 'Try a broader search term or another record tab.' : 'This record view is currently empty.'}
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="admin-record-header">
            <span>RECORD</span>
            <span>LOCATION</span>
            <span>STATUS</span>
            <span>FILED</span>
            <span />
          </div>
          {filteredReports.map(report => {
            const matchCount = matches.filter(
              match => match.lostReportId === report.id || match.foundReportId === report.id
            ).length;

            return (
              <button
                key={report.id}
                type="button"
                className="admin-record-row"
                onClick={() => openRecord(report.id)}
                aria-label={`Open record ${report.title}`}
              >
                <div style={{ minWidth: 0, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span className="mono-token mono-token-subtle" style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
                      {report.type === 'lost' ? 'LOST INQUIRY' : 'FOUND CUSTODY'}
                    </span>
                    {matchCount > 0 && (
                      <span className="mono-token mono-token-amber" style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
                        {matchCount} MATCH{matchCount === 1 ? '' : 'ES'}
                      </span>
                    )}
                    {report.hasPrivateVerification && (
                      <LockKeyhole size={12} style={{ color: 'var(--text-muted)' }} aria-label="Private verification configured" />
                    )}
                  </div>
                  <div
                    style={{
                      fontWeight: 650,
                      fontSize: '0.91rem',
                      color: 'var(--text-main)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {report.title}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', marginTop: '2px' }}>
                    {report.reporterName} · {report.category} · REF #LL-{report.id.slice(0, 8).toUpperCase()}
                  </div>
                </div>

                <div className="admin-record-col-extra" style={{ textAlign: 'left', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    <MapPin size={13} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.location}</span>
                  </div>
                </div>

                <div style={{ textAlign: 'left' }}>{renderStatus(report)}</div>

                <div className="admin-record-col-extra" style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  {formatDate(report.status === 'resolved' ? report.createdAt : report.date)}
                </div>

                <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
              </button>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {selectedReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(18, 19, 22, 0.42)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              zIndex: 95,
              display: 'flex',
              justifyContent: 'flex-end'
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-record-title"
            onClick={() => setSelectedId(null)}
          >
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 330 }}
              className="admin-drawer"
              onClick={event => event.stopPropagation()}
            >
              <div
                style={{
                  padding: '18px 20px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '14px',
                  position: 'sticky',
                  top: 0,
                  backgroundColor: 'rgba(255, 255, 255, 0.96)',
                  backdropFilter: 'blur(16px)',
                  zIndex: 2
                }}
              >
                <div>
                  <div className="docket-meta" style={{ marginBottom: '4px' }}>
                    CAMPUS OVERSIGHT // REF #LL-{selectedReport.id.slice(0, 8).toUpperCase()}
                  </div>
                  <h2 id="admin-record-title" style={{ fontSize: '1.2rem', lineHeight: 1.25, letterSpacing: '-0.025em' }}>
                    {selectedReport.title}
                  </h2>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSelectedId(null)}
                  aria-label="Close administrative record"
                  style={{ padding: '6px', flexShrink: 0 }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div
                  style={{
                    height: '220px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: getCategoryIllustration(selectedReport.category).bg,
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {imageLoading ? (
                    <Loader2 size={26} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                  ) : selectedImageUrl && !imageFailed ? (
                    <img
                      src={selectedImageUrl}
                      alt={selectedReport.title}
                      onError={() => setImageFailed(true)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      <ImageIcon size={28} style={{ marginBottom: '6px' }} />
                      <div style={{ fontSize: '0.76rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
                        {selectedReport.imagePath ? 'IMAGE UNAVAILABLE' : 'NO IMAGE ATTACHED'}
                      </div>
                    </div>
                  )}
                  {isSensitiveImagePath(selectedReport.imagePath) && (
                    <span
                      className="badge badge-lost"
                      style={{ position: 'absolute', top: '10px', left: '10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      <LockKeyhole size={11} />
                      Sensitive image
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {renderStatus(selectedReport)}
                  <span className="mono-token mono-token-subtle">{selectedReport.category}</span>
                  {selectedMatches.length > 0 && (
                    <span className="mono-token mono-token-amber">
                      {selectedMatches.length} MATCH{selectedMatches.length === 1 ? '' : 'ES'}
                    </span>
                  )}
                </div>

                <div className="admin-detail-grid">
                  <div>
                    <div className="admin-detail-label">REPORTED BY</div>
                    <div className="admin-detail-value">
                      <User size={14} />
                      <span>{selectedReport.reporterName}</span>
                    </div>
                  </div>
                  <div>
                    <div className="admin-detail-label">FILED AT</div>
                    <div className="admin-detail-value">
                      <Clock3 size={14} />
                      <span>{formatDateTime(selectedReport.createdAt)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="admin-detail-label">INCIDENT DATE</div>
                    <div className="admin-detail-value">
                      <Calendar size={14} />
                      <span>{formatDate(selectedReport.date)}{selectedReport.time ? ` · ${selectedReport.time}` : ''}</span>
                    </div>
                  </div>
                  <div>
                    <div className="admin-detail-label">LOCATION</div>
                    <div className="admin-detail-value">
                      <MapPin size={14} />
                      <span>{selectedReport.location}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="admin-detail-label" style={{ marginBottom: '6px' }}>DESCRIPTION</div>
                  <p style={{ fontSize: '0.9rem', lineHeight: 1.65, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {selectedReport.description}
                  </p>
                </div>

                {selectedReport.hasPrivateVerification && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '9px',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--primary-light)',
                      border: '1px solid var(--primary-border)',
                      color: 'var(--primary)',
                      fontSize: '0.82rem'
                    }}
                  >
                    <LockKeyhole size={15} style={{ flexShrink: 0 }} />
                    <span>Private ownership verification is configured. Secret answers are never exposed in this portal.</span>
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                    <div className="admin-detail-label" style={{ margin: 0 }}>MATCH CANDIDATES</div>
                    <span className="docket-meta">LIVE + PERSISTED</span>
                  </div>

                  {selectedMatches.length === 0 ? (
                    <div
                      style={{
                        padding: '14px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-muted)',
                        fontSize: '0.82rem'
                      }}
                    >
                      No match candidates are associated with this record.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedMatches.map(match => {
                        const counterpartId = match.lostReportId === selectedReport.id
                          ? match.foundReportId
                          : match.lostReportId;
                        const counterpart = reportById.get(counterpartId);

                        return (
                          <button
                            key={`${match.id}:${counterpartId}`}
                            type="button"
                            onClick={() => openRecord(counterpartId)}
                            disabled={!counterpart}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border)',
                              backgroundColor: '#FFFFFF',
                              textAlign: 'left',
                              cursor: counterpart ? 'pointer' : 'default'
                            }}
                          >
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '9px',
                                backgroundColor: match.status === 'verified' ? 'var(--success-light)' : 'var(--primary-light)',
                                color: match.status === 'verified' ? 'var(--success)' : 'var(--primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}
                            >
                              {match.status === 'verified' ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: '0.84rem',
                                  fontWeight: 650,
                                  color: 'var(--text-main)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {counterpart?.title || 'Linked record unavailable'}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {match.status.toUpperCase()} · {match.score.score}% confidence
                              </div>
                            </div>
                            {counterpart && <ChevronRight size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    paddingTop: '4px',
                    color: 'var(--text-tertiary)',
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.03em',
                    lineHeight: 1.55
                  }}
                >
                  ADMINISTRATIVE VIEW IS READ-ONLY. DATABASE RLS ENFORCES RESOLVED-RECORD AND SENSITIVE-IMAGE ACCESS.
                </div>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
