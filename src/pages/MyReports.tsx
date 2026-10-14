import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { ItemCard } from '../components/ItemCard';
import { ConfirmModal } from '../components/ConfirmModal';
import type { Report } from '../types';
import { FolderOpen, Pencil, CheckCircle2, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export const MyReports: React.FC = () => {
  const { reports, user, deleteReport, resolveReport, loading } = useData();
  const navigate = useNavigate();

  const [modalState, setModalState] = useState<{
    type: 'delete' | 'resolve';
    report: Report;
  } | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const myReports = reports
    .filter(r => r.userId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
      <div style={{ paddingBottom: '32px' }}>
        <h1 className="page-title">My Items</h1>
        <p className="page-subtitle">Manage items you have reported as lost or found.</p>
        <div className="card" style={{ padding: '80px 24px', textAlign: 'center' }}>
          <Loader2 size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px', color: 'var(--primary)' }} />
          <p style={{ color: 'var(--text-muted)' }}>Loading your reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '32px' }}>
      <h1 className="page-title">My Items</h1>
      <p className="page-subtitle">Manage items you have reported as lost or found.</p>

      {actionError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', fontWeight: 500, marginBottom: '16px' }}>
          <AlertCircle size={18} />
          {actionError}
          <button 
            onClick={() => setActionError(null)} 
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {myReports.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card" 
          style={{ padding: '80px 24px', textAlign: 'center' }}
        >
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--bg-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--text-muted)' }}>
            <FolderOpen size={40} />
          </div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>No reports yet</h3>
          <p style={{ color: 'var(--text-muted)' }}>You haven't reported any lost or found items.</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-4 gap-6">
          {myReports.map(report => {
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
