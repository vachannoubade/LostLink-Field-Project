import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { ItemCard } from '../components/ItemCard';
import { ConfirmModal } from '../components/ConfirmModal';
import type { Report } from '../types';
import { 
  FolderOpen, Pencil, CheckCircle2, Trash2, Loader2, 
  AlertCircle, Sparkles, Filter, 
  FilePlus, PackageSearch 
} from 'lucide-react';
import { motion } from 'framer-motion';

type FilterTab = 'all' | 'lost' | 'found' | 'resolved';



export const MyReports: React.FC = () => {
  const { reports, user, deleteReport, resolveReport, loading } = useData();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [modalState, setModalState] = useState<{
    type: 'delete' | 'resolve';
    report: Report;
  } | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const myReports = reports
    .filter(r => r.userId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const lostCount = myReports.filter(r => r.type === 'lost' && r.status === 'lost').length;
  const foundCount = myReports.filter(r => r.type === 'found' && r.status === 'found').length;
  const resolvedCount = myReports.filter(r => r.status === 'resolved').length;

  const filteredReports = myReports.filter(report => {
    if (activeTab === 'all') return true;
    if (activeTab === 'resolved') return report.status === 'resolved';
    return report.type === activeTab && report.status !== 'resolved';
  });

  const handleConfirmAction = async () => {
    if (!modalState || actionLoading) return;

    setActionLoading(true);
    setActionError(null);

    try {
      let result: { success: boolean; error?: string };

      if (modalState.type === 'delete') {
        result = await deleteReport(modalState.report.id);
      } else {
        result = await resolveReport(modalState.report.id);
      }

      if (result.success) {
        setModalState(null);
      } else {
        setActionError(result.error || 'Operation failed. Please try again.');
      }
    } catch {
      setActionError('An unexpected error occurred. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ paddingBottom: '40px', maxWidth: '1000px', margin: '0 auto' }}>
        <h1 className="page-title">My Reported Items</h1>
        <p className="page-subtitle">Track, manage, and resolve all items you have reported on campus.</p>
        <div className="card" style={{ padding: '80px 24px', textAlign: 'center' }}>
          <Loader2 size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px', color: 'var(--primary)' }} />
          <p style={{ color: 'var(--text-muted)' }}>Loading your reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '48px', maxWidth: '1080px', margin: '0 auto' }}>
      {/* Top Header with Quick Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="mono-token mono-token-subtle">PERSONAL DOSSIER INDEX</span>
            <span className="mono-token mono-token-amber">STUDENT REGISTRY</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.5rem', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '-0.025em', margin: 0, lineHeight: 1.15 }}>
            Personal Docket Records
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', marginTop: '6px', maxWidth: '620px', lineHeight: 1.5 }}>
            Track, update, and resolve all incident reports and specimens filed under your student credentials.
          </p>
        </div>

        <div className="my-reports-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
          <button 
            type="button"
            className="btn btn-secondary" 
            onClick={() => navigate('/report/lost')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', fontSize: '0.85rem', fontWeight: 600 }}
          >
            <FilePlus size={15} />
            File Lost Inquiry
          </button>
          <button 
            type="button"
            className="btn btn-primary" 
            onClick={() => navigate('/report/found')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', fontSize: '0.85rem', fontWeight: 600 }}
          >
            <PackageSearch size={15} />
            Log Found Specimen
          </button>
        </div>
      </div>

      {actionError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', fontWeight: 500, marginBottom: '20px' }}>
          <AlertCircle size={18} />
          <span>{actionError}</span>
          <button 
            onClick={() => setActionError(null)} 
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary Stat Ledger Strip */}
      <div 
        className="my-reports-stat-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          backgroundColor: '#FFFFFF',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '28px',
          overflow: 'hidden'
        }}
      >
        {[
          { id: 'all', label: 'TOTAL SUBMISSIONS', count: myReports.length, color: 'var(--text-main)', marker: '■' },
          { id: 'lost', label: 'ACTIVE INQUIRIES', count: lostCount, color: '#B45309', marker: '●' },
          { id: 'found', label: 'IN CAMPUS CUSTODY', count: foundCount, color: '#047857', marker: '◆' },
          { id: 'resolved', label: 'REUNITED & ARCHIVED', count: resolvedCount, color: '#1E293B', marker: '✔' }
        ].map((stat, idx) => {
          const isActive = activeTab === stat.id;
          return (
            <div
              key={stat.id}
              onClick={() => setActiveTab(stat.id as FilterTab)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveTab(stat.id as FilterTab);
                }
              }}
              style={{
                padding: '20px 24px',
                borderRight: idx < 3 ? '1px solid var(--border)' : 'none',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                backgroundColor: isActive ? 'var(--bg-canvas)' : '#FFFFFF',
                transition: 'background-color 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
                  {stat.marker} {stat.label}
                </span>
                {isActive && (
                  <span className="mono-token mono-token-amber" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                    FILTERED
                  </span>
                )}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: stat.color, lineHeight: 1 }}>
                {stat.count}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter Tabs Segmented Control with Framer Motion Sliding Pill */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '24px',
        borderBottom: '1px solid var(--border)',
        paddingBottom: '16px'
      }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{
            display: 'inline-flex',
            position: 'relative',
            padding: '4px',
            backgroundColor: 'var(--bg-canvas)',
            borderRadius: '9px',
            border: '1px solid var(--border)',
            gap: '2px',
            flexWrap: 'wrap'
          }}>
            {[
              { id: 'all', label: `All Docket (${myReports.length})` },
              { id: 'lost', label: `Active Search (${lostCount})` },
              { id: 'found', label: `In Custody (${foundCount})` },
              { id: 'resolved', label: `Reunited (${resolvedCount})` }
            ].map(tab => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as FilterTab)}
                  style={{
                    position: 'relative',
                    padding: '8px 16px',
                    borderRadius: '7px',
                    fontSize: '0.82rem',
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    color: isSelected ? 'var(--text-main)' : 'var(--text-secondary)',
                    backgroundColor: 'transparent',
                    border: 'none',
                    zIndex: 1,
                    transition: 'color 0.15s ease'
                  }}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="myReportsTabPill"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundColor: '#FFFFFF',
                        borderRadius: '7px',
                        boxShadow: 'var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,1)',
                        zIndex: -1
                      }}
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  )}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/ai-matches')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.84rem',
            color: 'var(--text-main)',
            fontWeight: 650,
            cursor: 'pointer',
            backgroundColor: 'var(--bg-canvas)',
            border: '1px solid var(--border)',
            padding: '7px 14px',
            borderRadius: '6px'
          }}
        >
          <Sparkles size={14} color="#B45309" /> Cross-Reference AI Matches
        </button>
      </div>

      {/* Reports Grid or Empty State */}
      {myReports.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card" 
          style={{ padding: '64px 32px', textAlign: 'center' }}
        >
          <div style={{ width: '84px', height: '84px', borderRadius: '50%', backgroundColor: 'var(--bg-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--text-muted)' }}>
            <FolderOpen size={42} />
          </div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '8px', color: 'var(--text-main)' }}>You Haven't Reported Any Items Yet</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 28px', fontSize: '0.95rem', lineHeight: 1.6 }}>
            Report an item you lost or found on campus to activate automated matching across the student community.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <button 
              type="button"
              className="btn btn-secondary" 
              onClick={() => navigate('/report/lost')}
              style={{ padding: '12px 24px', fontSize: '0.95rem' }}
            >
              <FilePlus size={18} />
              I Lost Something
            </button>
            <button 
              type="button"
              className="btn btn-primary" 
              onClick={() => navigate('/report/found')}
              style={{ padding: '12px 24px', fontSize: '0.95rem' }}
            >
              <PackageSearch size={18} />
              I Found Something
            </button>
          </div>
        </motion.div>
      ) : filteredReports.length === 0 ? (
        <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--bg-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--text-muted)' }}>
            <Filter size={28} />
          </div>
          <h3 style={{ fontSize: '1.15rem', marginBottom: '6px', color: 'var(--text-main)' }}>
            No {activeTab.toUpperCase()} items found
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
            You do not have any items in the "{activeTab}" status category.
          </p>
          <button 
            type="button"
            className="btn btn-secondary" 
            onClick={() => setActiveTab('all')}
            style={{ padding: '8px 18px', fontSize: '0.85rem' }}
          >
            Show All Items ({myReports.length})
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-6">
          {filteredReports.map(report => {
            const isResolved = report.status === 'resolved';

            return (
              <ItemCard 
                key={report.id} 
                item={report} 
                onClick={() => navigate(`/items/${report.id}`)}
                actions={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/report/edit/${report.id}`);
                        }}
                        aria-label={`Edit ${report.title}`}
                      >
                        <Pencil size={13} />
                        Edit
                      </button>

                      {!isResolved ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{
                            padding: '6px 10px',
                            fontSize: '0.8rem',
                            color: 'var(--success)',
                            borderColor: 'rgba(56, 161, 105, 0.3)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionError(null);
                            setModalState({ type: 'resolve', report });
                          }}
                          aria-label={`Mark ${report.title} as resolved`}
                        >
                          <CheckCircle2 size={13} />
                          {report.type === 'lost' ? 'Recover' : 'Resolve'}
                        </button>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.75rem',
                            color: 'var(--success)',
                            fontWeight: 600,
                            padding: '4px 8px',
                            backgroundColor: 'var(--success-light)',
                            borderRadius: '6px'
                          }}
                        >
                          <CheckCircle2 size={12} />
                          Resolved
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '6px 8px', fontSize: '0.8rem', color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionError(null);
                        setModalState({ type: 'delete', report });
                      }}
                      aria-label={`Delete ${report.title}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      {/* Accessible Action Confirmation Dialog */}
      {modalState && (
        <ConfirmModal
          isOpen={true}
          onClose={() => { setModalState(null); setActionError(null); }}
          onConfirm={handleConfirmAction}
          variant={modalState.type === 'delete' ? 'danger' : 'success'}
          title={
            modalState.type === 'delete'
              ? 'Delete Report'
              : modalState.report.type === 'lost'
                ? 'Mark as Recovered'
                : 'Mark as Resolved'
          }
          description={
            modalState.type === 'delete'
              ? `Are you sure you want to delete "${modalState.report.title}"? This report will be permanently removed and any potential matches will be invalidated. This action cannot be undone.`
              : `Are you sure you want to mark "${modalState.report.title}" as ${
                  modalState.report.type === 'lost' ? 'recovered' : 'resolved'
                }? This indicates the item has been recovered and will conclude active matching.`
          }
          confirmText={
            actionLoading
              ? 'Processing...'
              : modalState.type === 'delete'
                ? 'Delete Report'
                : modalState.report.type === 'lost'
                  ? 'Mark Recovered'
                  : 'Mark Resolved'
          }
          cancelText="Cancel"
        />
      )}
    </div>
  );
};
