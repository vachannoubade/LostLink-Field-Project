import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { ItemCard } from '../components/ItemCard';
import { ConfirmModal } from '../components/ConfirmModal';
import type { Report } from '../types';
import { 
  FolderOpen, Pencil, CheckCircle2, Trash2, Loader2, 
  AlertCircle, FilePlus, PackageSearch 
} from 'lucide-react';

type FilterTab = 'all' | 'lost' | 'found';

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

  const filteredReports = myReports.filter(report => {
    if (activeTab === 'all') return true;
    return report.type === activeTab;
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
      <div style={{ maxWidth: '1040px', margin: '0 auto', textAlign: 'center', padding: '80px 20px' }}>
        <Loader2 size={32} className="spin-loader" style={{ margin: '0 auto 12px', color: 'var(--primary)' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading your reports...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto', paddingBottom: '48px' }}>
      {/* Header with Quick Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">
            My reported items
          </h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Manage, update, and resolve the items you have reported on campus.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            type="button"
            className="btn btn-secondary btn-sm" 
            onClick={() => navigate('/report/lost')}
          >
            <FilePlus size={15} /> Report lost item
          </button>
          <button 
            type="button"
            className="btn btn-primary btn-sm" 
            onClick={() => navigate('/report/found')}
          >
            <PackageSearch size={15} /> Report found item
          </button>
        </div>
      </div>

      {actionError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: 'var(--danger-light)', border: '1px solid var(--danger-border)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', marginBottom: '20px' }}>
          <AlertCircle size={18} />
          <span>{actionError}</span>
          <button 
            onClick={() => setActionError(null)} 
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ marginBottom: '24px' }}>
        <div className="tabs-container" role="tablist" aria-label="Filter my reports">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All reports ({myReports.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'lost'}
            className={`tab-btn ${activeTab === 'lost' ? 'active' : ''}`}
            onClick={() => setActiveTab('lost')}
          >
            Lost items ({lostCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'found'}
            className={`tab-btn ${activeTab === 'found' ? 'active' : ''}`}
            onClick={() => setActiveTab('found')}
          >
            Found items ({foundCount})
          </button>
        </div>
      </div>

      {/* Reports Grid */}
      {filteredReports.length === 0 ? (
        <div style={{
          padding: '64px 20px',
          textAlign: 'center',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)'
        }}>
          <FolderOpen size={36} style={{ color: 'var(--text-tertiary)', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
            No items reported yet.
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '380px', margin: '0 auto 18px' }}>
            {activeTab === 'all'
              ? 'You have not submitted any lost or found reports yet.'
              : `You have no ${activeTab} items filed.`}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => navigate('/report/lost')}
              className="btn btn-secondary btn-sm"
            >
              Report a lost item
            </button>
            <button
              onClick={() => navigate('/report/found')}
              className="btn btn-primary btn-sm"
            >
              Report a found item
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3" style={{ gap: '20px' }}>
          {filteredReports.map(report => (
            <ItemCard
              key={report.id}
              item={report}
              onClick={() => navigate(`/items/${report.id}`)}
              actions={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/report/edit/${report.id}`);
                    }}
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                  >
                    <Pencil size={13} /> Edit
                  </button>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    {report.status !== 'resolved' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalState({ type: 'resolve', report });
                        }}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 8px', fontSize: '0.78rem', color: 'var(--success)' }}
                      >
                        <CheckCircle2 size={13} /> Reunited
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalState({ type: 'delete', report });
                      }}
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '4px 8px', fontSize: '0.78rem', color: 'var(--danger)' }}
                      aria-label="Delete report"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              }
            />
          ))}
        </div>
      )}

      {/* Confirm Modal */}
      {modalState && (
        <ConfirmModal
          isOpen={true}
          title={modalState.type === 'delete' ? 'Delete Report' : 'Mark as Reunited'}
          description={
            modalState.type === 'delete'
              ? `Are you sure you want to permanently delete "${modalState.report.title}"? This action cannot be undone.`
              : `Has "${modalState.report.title}" been returned to its genuine owner? This will resolve the report.`
          }
          confirmText={modalState.type === 'delete' ? (actionLoading ? 'Deleting...' : 'Delete') : (actionLoading ? 'Confirming...' : 'Confirm')}
          variant={modalState.type === 'delete' ? 'danger' : 'primary'}
          onConfirm={handleConfirmAction}
          onClose={() => setModalState(null)}
        />
      )}
    </div>
  );
};
