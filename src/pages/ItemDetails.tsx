import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { 
  ArrowLeft, MapPin, Calendar, Tag, Clock, 
  User as UserIcon, PackageSearch, Image as ImageIcon,
  Sparkles, CheckCircle2, AlertCircle, Pencil, Trash2, Loader2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { ConfirmModal } from '../components/ConfirmModal';

export const ItemDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { reports, user, deleteReport, resolveReport, loading } = useData();
  const [imageError, setImageError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<{
    type: 'delete' | 'resolve';
  } | null>(null);

  const item = reports.find(r => r.id === id);

  if (loading) {
    return (
      <div style={{ paddingBottom: '40px', maxWidth: '700px', margin: '0 auto', textAlign: 'center', padding: '80px 24px' }}>
        <Loader2 size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px', color: 'var(--primary)' }} />
        <p style={{ color: 'var(--text-muted)' }}>Loading report details...</p>
      </div>
    );
  }

  if (!item) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ paddingBottom: '40px', maxWidth: '700px', margin: '0 auto' }}
      >
        <button 
          onClick={() => navigate('/browse')} 
          className="btn btn-ghost" 
          style={{ marginBottom: '24px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <ArrowLeft size={18} />
          Back to Browse
        </button>

        <div className="card" style={{ padding: '64px 24px', textAlign: 'center' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--bg-color)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <AlertCircle size={40} />
          </div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--text-main)' }}>Report Not Found</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 24px', fontSize: '0.95rem' }}>
            The item you are looking for does not exist or may have been removed.
          </p>
          <button onClick={() => navigate('/browse')} className="btn btn-primary">
            <PackageSearch size={18} />
            Browse Available Items
          </button>
        </div>
      </motion.div>
    );
  }

  const isOwner = item.userId === user.id;
  const formattedDate = new Date(item.date).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const formattedCreatedAt = new Date(item.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const handleConfirmAction = async () => {
    if (!modalState || actionLoading) return;

    setActionLoading(true);
    setActionError(null);

    try {
      let result: { success: boolean; error?: string };

      if (modalState.type === 'delete') {
        result = await deleteReport(item.id);
        if (result.success) {
          setModalState(null);
          navigate('/my-reports');
          return;
        }
      } else {
        result = await resolveReport(item.id);
        if (result.success) {
          setModalState(null);
          return;
        }
      }

      setActionError(result.error || 'Operation failed. Please try again.');
    } catch {
      setActionError('An unexpected error occurred. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ paddingBottom: '48px', maxWidth: '800px', margin: '0 auto' }}
    >
      {/* Top back button */}
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button 
          onClick={() => navigate('/browse')} 
          className="btn btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', paddingLeft: '4px' }}
          aria-label="Back to Browse"
        >
          <ArrowLeft size={18} />
          Back to Browse
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          <span className={`badge ${item.type === 'lost' ? 'badge-lost' : 'badge-found'}`}>
            {item.type.toUpperCase()}
          </span>
          <span className={`badge ${item.status === 'resolved' ? 'badge-match' : item.status === 'lost' ? 'badge-lost' : 'badge-found'}`}>
            {item.status === 'resolved' ? 'RESOLVED' : item.status.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {/* Item Image Gallery / Header */}
        <div style={{ height: '320px', backgroundColor: '#F1F3F9', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {item.imageUrl && !imageError ? (
            <img 
              src={item.imageUrl} 
              alt={item.title} 
              onError={() => setImageError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#A0AEC0' }}>
              <ImageIcon size={64} strokeWidth={1.5} />
              <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>No Photo Provided</span>
            </div>
          )}

          {item.status === 'resolved' && (
            <div style={{ position: 'absolute', top: '16px', left: '16px', backgroundColor: 'rgba(56, 161, 105, 0.95)', color: 'white', padding: '6px 14px', borderRadius: '999px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(4px)' }}>
              <CheckCircle2 size={16} />
              Recovered & Resolved
            </div>
          )}
        </div>

        {/* Content Body */}
        <div style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            <Tag size={14} />
            <span>{item.category}</span>
          </div>

          <h1 style={{ fontSize: '1.75rem', marginBottom: '16px', color: 'var(--text-main)', lineHeight: 1.3 }}>
            {item.title}
          </h1>

          {/* Quick Details Grid */}
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '16px', 
              padding: '16px', 
              backgroundColor: '#FAFBFC', 
              borderRadius: 'var(--radius-sm)', 
              border: '1px solid var(--border)',
              marginBottom: '28px' 
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Location</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>{item.location}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Calendar size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Date {item.type === 'lost' ? 'Lost' : 'Found'}
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {formattedDate} {item.time ? `• ${item.time}` : ''}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Clock size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Reported At</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>{formattedCreatedAt}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <UserIcon size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Reporter</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {isOwner ? `${user.name} (You)` : 'Campus Student'}
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', color: 'var(--text-main)' }}>Description</h3>
            <p style={{ fontSize: '1rem', color: 'var(--text-main)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {item.description}
            </p>
          </div>

          {/* Action Error */}
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

          {/* Action Row */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => navigate('/browse')}
              style={{ flex: '1 1 140px' }}
            >
              Back to Browse
            </button>

            {item.status !== 'resolved' && (
              <button 
                className="btn btn-primary" 
                onClick={() => navigate('/ai-matches')}
                style={{ flex: '1 1 180px' }}
              >
                <Sparkles size={18} />
                Potential Matches
              </button>
            )}

            {isOwner && (
              <>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => navigate(`/report/edit/${item.id}`)}
                  style={{ flex: '1 1 130px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Pencil size={16} />
                  Edit Report
                </button>

                {item.status !== 'resolved' && (
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => { setActionError(null); setModalState({ type: 'resolve' }); }}
                    style={{ flex: '1 1 160px', color: 'var(--success)', borderColor: 'rgba(56, 161, 105, 0.4)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <CheckCircle2 size={16} />
                    {item.type === 'lost' ? 'Mark Recovered' : 'Mark Resolved'}
                  </button>
                )}

                <button 
                  className="btn btn-ghost" 
                  onClick={() => { setActionError(null); setModalState({ type: 'delete' }); }}
                  style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  aria-label="Delete this report"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Accessible Action Confirmation Dialog */}
      {modalState && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setModalState(null)}
          onConfirm={handleConfirmAction}
          variant={modalState.type === 'delete' ? 'danger' : 'success'}
          title={
            modalState.type === 'delete'
              ? 'Delete Report'
              : item.type === 'lost'
                ? 'Mark as Recovered'
                : 'Mark as Resolved'
          }
          description={
            modalState.type === 'delete'
              ? `Are you sure you want to delete "${item.title}"? This report will be permanently removed and any potential matches will be invalidated. This action cannot be undone.`
              : `Are you sure you want to mark "${item.title}" as ${
                  item.type === 'lost' ? 'recovered' : 'resolved'
                }? This indicates the item has been recovered and will conclude active matching.`
          }
          confirmText={
            actionLoading
              ? 'Processing...'
              : modalState.type === 'delete'
                ? 'Delete Report'
                : item.type === 'lost'
                  ? 'Mark Recovered'
                  : 'Mark Resolved'
          }
          cancelText="Cancel"
        />
      )}
    </motion.div>
  );
};
