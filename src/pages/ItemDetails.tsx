import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { 
  ArrowLeft, Tag, Clock, PackageSearch,
  Sparkles, CheckCircle2, AlertCircle, Pencil, Trash2, Loader2,
  Lock, ShieldCheck, Coffee, AlertTriangle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { ConfirmModal } from '../components/ConfirmModal';
import { OwnershipVerifyModal } from '../components/OwnershipVerifyModal';
import { getOwnerVerification, type OwnerVerificationDetails } from '../lib/verification';
import { getCategoryIllustration } from '../utils/categoryArt';

export const ItemDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { reports, user, deleteReport, resolveReport, loading } = useData();
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<{
    type: 'delete' | 'resolve';
  } | null>(null);

  // Private Ownership Verification State
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [ownerVerification, setOwnerVerification] = useState<OwnerVerificationDetails | null>(null);
  const [loadingOwnerVerification, setLoadingOwnerVerification] = useState(false);

  const item = reports.find(r => r.id === id);
  const isOwner = Boolean(item && item.userId === user.id);
  const imageError = Boolean(item?.imageUrl && failedImageUrl === item.imageUrl);

  // Fetch private verification details securely if viewing own report
  useEffect(() => {
    let isMounted = true;
    if (isOwner && item?.id) {
      getOwnerVerification(item.id).then(details => {
        if (!isMounted) return;
        setOwnerVerification(details);
        setLoadingOwnerVerification(false);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [isOwner, item?.id]);

  if (loading) {
    return (
      <div style={{ paddingBottom: '40px', maxWidth: '800px', margin: '0 auto', textAlign: 'center', padding: '80px 24px' }}>
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
        style={{ paddingBottom: '40px', maxWidth: '800px', margin: '0 auto' }}
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

  const catArt = getCategoryIllustration(item.category);
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      style={{ paddingBottom: '56px', maxWidth: '860px', margin: '0 auto' }}
    >
      {/* Top back button & badges bar */}
      <div className="item-details-top-bar" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <button 
          onClick={() => navigate('/browse')} 
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}
          aria-label="Back to Browse"
        >
          <ArrowLeft size={16} />
          Return to Registry Index
        </button>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`mono-token ${item.type === 'lost' ? 'mono-token-amber' : 'mono-token-emerald'}`}>
            {item.type === 'lost' ? '● ACTIVE INQUIRY' : '◆ IN CUSTODY'}
          </span>
          <span className="mono-token mono-token-subtle">
            REF #LL-{item.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
      </div>

      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden'
      }}>
        {/* Archival Dossier Top Bar */}
        <div className="item-details-sub-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-canvas)',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)'
        }}>
          <div>CAMPUS LOST & FOUND REGISTRY // DOCKET ARCHIVE</div>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <span>FILED: {new Date(item.createdAt).toLocaleDateString()}</span>
            <span>VERIFIED SESSION</span>
          </div>
        </div>

        {/* Category Artwork or Real Image Hero Section */}
        <div 
          className="item-details-hero"
          style={{ 
            height: '360px', 
            backgroundColor: catArt.bg, 
            position: 'relative', 
            overflow: 'hidden', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            borderBottom: '1px solid var(--border)'
          }}
        >
          {item.imageUrl && !imageError ? (
            <img 
              src={item.imageUrl} 
              alt={item.title} 
              onError={() => {
                if (item.imageUrl) setFailedImageUrl(item.imageUrl);
              }}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
            />
          ) : (
            <div 
              style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '12px', 
                textAlign: 'center', 
                padding: '24px' 
              }}
            >
              <span style={{ fontSize: '5rem', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.06))' }}>
                {catArt.emoji}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <span className="mono-token mono-token-subtle" style={{ letterSpacing: '0.08em' }}>
                  {catArt.label} // SPECIMEN ARCHIVE
                </span>
                <span style={{ fontSize: '0.8rem', color: '#78716C', fontWeight: 500 }}>
                  {item.imageUrl && imageError ? 'Image preview unavailable • Category illustration' : 'No photo uploaded • Category illustration'}
                </span>
              </div>
            </div>
          )}

          {/* Archival Rubber Stamp when Resolved */}
          {item.status === 'resolved' && (
            <div 
              className="archival-stamp"
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%) rotate(-10deg)',
                zIndex: 10,
                fontSize: '1.25rem',
                padding: '10px 24px',
                borderWidth: '3px',
                backgroundColor: 'rgba(248, 248, 246, 0.92)',
                boxShadow: '0 4px 16px rgba(180, 83, 9, 0.2)'
              }}
            >
              REUNITED • ARCHIVED
            </div>
          )}

          {/* Floating Badges Overlay */}
          <div style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', zIndex: 2 }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span 
                className={`mono-token ${
                  item.status === 'lost' ? 'mono-token-amber' : item.status === 'found' ? 'mono-token-emerald' : 'mono-token-subtle'
                }`}
                style={{ 
                  backgroundColor: '#FFFFFF',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                {item.status === 'lost' ? '● SEARCH ACTIVE' : item.status === 'found' ? '◆ IN CUSTODY' : '✔ ARCHIVED'}
              </span>

              {item.hasPrivateVerification && item.status === 'found' && (
                <span
                  className="mono-token"
                  style={{
                    backgroundColor: '#1E293B',
                    color: '#FFFFFF',
                    border: '1px solid #334155',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <Lock size={11} /> VERIFICATION LOCK
                </span>
              )}

              {item.urgency === 'high' && item.status !== 'resolved' && (
                <span
                  className="mono-token mono-token-amber"
                  style={{
                    backgroundColor: '#FEF3C7',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <AlertTriangle size={11} /> PRIORITY INCIDENT
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="item-details-body" style={{ padding: '36px' }}>
          {/* Category & Timestamp meta */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' }}>
              <Tag size={13} />
              <span>TAXONOMY: {item.category}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
              <Clock size={13} />
              <span>LOGGED {formattedCreatedAt}</span>
            </div>
          </div>

          <h1 className="item-details-title" style={{ 
            fontFamily: 'var(--font-serif)', 
            fontSize: '2.4rem', 
            marginBottom: '24px', 
            color: 'var(--text-main)', 
            lineHeight: 1.2, 
            fontWeight: 600,
            letterSpacing: '-0.02em'
          }}>
            {item.title}
          </h1>

          {/* Archival Ledger Grid */}
          <div 
            className="item-details-meta-grid"
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
              backgroundColor: 'var(--bg-canvas)',
              borderRadius: '8px', 
              border: '1px solid var(--border)',
              marginBottom: '32px',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                LOCATION / SECTOR
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {item.campusZone ? `${item.campusZone} • ${item.location}` : item.location}
              </div>
            </div>

            <div style={{ padding: '16px 20px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                DATE {item.type === 'lost' ? 'LOST' : 'FOUND'}
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {formattedDate} {item.time ? `• ${item.time}` : ''}
              </div>
            </div>

            <div style={{ padding: '16px 20px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                TAXONOMY
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {catArt.emoji} {item.category}
              </div>
            </div>

            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                REGISTERED REPORTER
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {isOwner ? `${user.name} (You)` : (item.reporterName || 'Registered Student')}
              </div>
            </div>
          </div>

          {/* Owner-Protected Private Verification Card */}
          {isOwner && (item.hasPrivateVerification || ownerVerification?.configured) && (
            <div 
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '20px 24px',
                backgroundColor: 'rgba(248, 248, 246, 0.95)',
                border: '1.5px solid var(--border)',
                borderRadius: '8px',
                marginBottom: '28px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={18} color="var(--primary)" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
                    YOUR PRIVATE OWNERSHIP VERIFICATION (CONFIDENTIAL)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/report/edit/${item.id}`)}
                  className="btn btn-ghost"
                  style={{ fontSize: '0.8rem', padding: '4px 10px', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--primary)' }}
                >
                  <Pencil size={13} /> Update Clue / PIN
                </button>
              </div>

              {loadingOwnerVerification ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '8px 0' }}>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading verification details...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: '2px' }}>
                      CONFIGURED CLUE (VISIBLE ONLY TO YOU)
                    </div>
                    <div style={{ fontSize: '0.92rem', color: 'var(--text-main)', backgroundColor: '#FFFFFF', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border)', lineHeight: 1.5 }}>
                      {ownerVerification?.clue || 'No clue configured.'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 700, marginBottom: '2px' }}>
                        SECRET PIN
                      </div>
                      <div style={{ fontSize: '0.92rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.2em', color: 'var(--text-main)', backgroundColor: '#FFFFFF', padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', display: 'inline-block' }}>
                        ••••••
                      </div>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '16px' }}>
                      🔒 Encrypted with salted bcrypt in PostgreSQL. Plaintext PIN is never stored or returned.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Claimant / Finder Verification Callout */}
          {!isOwner && item.hasPrivateVerification && item.status !== 'resolved' && (
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
                padding: '20px 24px',
                backgroundColor: 'rgba(24, 90, 219, 0.04)',
                border: '1.5px solid rgba(24, 90, 219, 0.22)',
                borderRadius: '8px',
                marginBottom: '28px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', maxWidth: '540px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--primary)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '3px', fontFamily: 'var(--font-mono)' }}>
                    SECURE OWNERSHIP VERIFICATION ENABLED
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    The registered owner has secured this item with a confidential clue and 6-digit secret PIN. If you found this item or are claiming ownership, submit the verification credentials.
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowVerifyModal(true)}
                style={{ padding: '9px 18px', fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '7px' }}
              >
                <ShieldCheck size={16} />
                Verify Ownership Claim
              </button>
            </div>
          )}

          {/* Found item lock callout for legacy found reports */}
          {item.hasPrivateVerification && item.status === 'found' && !isOwner && (
            <div 
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                padding: '18px 20px',
                backgroundColor: 'var(--bg-canvas)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                marginBottom: '28px'
              }}
            >
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: 'var(--text-main)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Lock size={15} />
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '2px', fontFamily: 'var(--font-mono)' }}>
                  OWNERSHIP VERIFICATION RECORDED
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  The finder has recorded private distinguishing characteristics. You will be asked to verify these during handover.
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', marginBottom: '10px', color: 'var(--text-muted)' }}>
              DETAILED STATEMENT // DESCRIPTION
            </h3>
            <p style={{ fontSize: '1rem', color: 'var(--text-main)', lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0 }}>
              {item.description}
            </p>
          </div>

          {/* Gratitude Note Callout */}
          {item.gratitudeNote && (
            <div 
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                padding: '18px 20px',
                backgroundColor: '#FEF3C7',
                border: '1px solid #FDE68A',
                borderRadius: '8px',
                marginBottom: '28px'
              }}
            >
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: 'rgba(217, 119, 6, 0.2)',
                color: '#B45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Coffee size={16} />
              </div>
              <div>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                  GRATITUDE NOTE FROM REPORTER
                </div>
                <p style={{ fontSize: '0.92rem', color: '#78350F', lineHeight: 1.55, margin: 0 }}>
                  "{item.gratitudeNote}"
                </p>
              </div>
            </div>
          )}

          {/* Reporter Information Card (rendered ONLY when real reporter metadata exists) */}
          {item.reporterName && !isOwner && (
            <div 
              style={{
                padding: '16px 20px',
                backgroundColor: 'rgba(255, 255, 255, 0.65)',
                backdropFilter: 'var(--blur-subtle)',
                WebkitBackdropFilter: 'var(--blur-subtle)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--glass-specular-soft)',
                marginBottom: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div 
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--primary) 0%, #3B82F6 100%)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    flexShrink: 0,
                    boxShadow: '0 2px 6px rgba(24, 90, 219, 0.2)'
                  }}
                >
                  {item.reporterName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.94rem', fontWeight: 650, color: 'var(--text-main)' }}>
                      {item.reporterName}
                    </span>
                    {item.reporterVerified && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.74rem', color: 'var(--success)', fontWeight: 600 }}>
                        <ShieldCheck size={14} /> Verified Student
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {item.reporterRole || 'Campus Community Reporter'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Error */}
          {actionError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', fontWeight: 500, marginBottom: '20px' }}>
              <AlertCircle size={18} />
              <span>{actionError}</span>
              <button 
                onClick={() => setActionError(null)} 
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Action Row */}
          <div className="item-details-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
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

            {!isOwner && item.hasPrivateVerification && item.status !== 'resolved' && (
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowVerifyModal(true)}
                style={{ flex: '1 1 180px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <ShieldCheck size={16} />
                Verify Ownership
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

      {/* Ownership Verification Challenge Modal */}
      <OwnershipVerifyModal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        reportId={item.id}
        reportTitle={item.title}
      />
    </motion.div>
  );
};
