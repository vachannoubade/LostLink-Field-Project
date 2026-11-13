import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { 
  ArrowLeft, Tag, Clock, PackageSearch,
  Sparkles, CheckCircle2, AlertCircle, Pencil, Trash2, Loader2,
  ShieldCheck, X
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { getCategoryIllustration } from '../utils/categoryArt';
import { supabase } from '../lib/supabase';
import type { Claim } from '../types';

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

  // Claim State & Modal
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimEvidence, setClaimEvidence] = useState('');
  const [linkedLostReportId, setLinkedLostReportId] = useState<string>('');
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  const [existingClaim, setExistingClaim] = useState<Claim | null>(null);

  // Private Detail for Owner
  const [ownerPrivateDetail, setOwnerPrivateDetail] = useState<string | null>(null);

  const item = reports.find(r => r.id === id);
  const isOwner = Boolean(item && item.userId === user.id);
  const imageError = Boolean(item?.imageUrl && failedImageUrl === item.imageUrl);

  // Fetch existing claim for this item if found item and not owner
  const itemId = item?.id;
  const itemType = item?.type;

  useEffect(() => {
    let isMounted = true;
    const fetchClaim = async () => {
      if (!supabase || !itemId || itemType !== 'found' || isOwner || !user.id) return;
      try {
        const { data } = await supabase
          .from('claims')
          .select('*')
          .eq('found_report_id', itemId)
          .eq('claimant_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (isMounted) {
          setExistingClaim((data as Claim) || null);
        }
      } catch {
        // Ignored
      }
    };

    void fetchClaim();
    return () => {
      isMounted = false;
    };
  }, [itemId, itemType, isOwner, user.id]);

  // Fetch private detail if owner
  useEffect(() => {
    let isMounted = true;
    const fetchPrivateDetail = async () => {
      if (!supabase || !isOwner || !item?.id) return;
      try {
        const { data } = await supabase
          .from('report_private_details')
          .select('private_detail')
          .eq('report_id', item.id)
          .maybeSingle();

        if (isMounted && data && (data as { private_detail?: string }).private_detail) {
          setOwnerPrivateDetail((data as { private_detail?: string }).private_detail || null);
        }
      } catch {
        // Ignored
      }
    };

    void fetchPrivateDetail();
    return () => {
      isMounted = false;
    };
  }, [isOwner, item?.id]);

  const handleConfirmAction = async () => {
    if (!item || !modalState) return;
    setActionLoading(true);
    setActionError(null);

    try {
      if (modalState.type === 'delete') {
        const result = await deleteReport(item.id);
        if (result.success) {
          navigate('/my-reports');
        } else {
          setActionError(result.error || 'Failed to delete report.');
        }
      } else if (modalState.type === 'resolve') {
        const result = await resolveReport(item.id);
        if (result.success) {
          setModalState(null);
        } else {
          setActionError(result.error || 'Failed to resolve report.');
        }
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;

    if (claimEvidence.trim().length < 10 || claimEvidence.trim().length > 500) {
      setClaimError('Claim evidence must be between 10 and 500 characters.');
      return;
    }

    setClaimSubmitting(true);
    setClaimError(null);
    setClaimSuccess(null);

    try {
      if (!supabase) {
        setClaimError('Supabase client not configured.');
        setClaimSubmitting(false);
        return;
      }

      const { data, error } = await supabase.rpc('submit_claim_secure', {
        p_found_report_id: item.id,
        p_claim_evidence: claimEvidence.trim(),
        p_linked_lost_report_id: linkedLostReportId || null
      });

      if (error) {
        setClaimError(error.message);
        setClaimSubmitting(false);
        return;
      }

      setClaimSuccess('Your claim has been submitted to the campus helpdesk for verification.');
      setShowClaimModal(false);
      setClaimEvidence('');

      // Refresh claim status
      const { data: updatedClaim } = await supabase
        .from('claims')
        .select('*')
        .eq('id', data)
        .maybeSingle();

      if (updatedClaim) {
        setExistingClaim(updatedClaim as Claim);
      }
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Failed to submit claim.');
    } finally {
      setClaimSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ paddingBottom: '40px', maxWidth: '800px', margin: '0 auto', textAlign: 'center', padding: '80px 24px' }}>
        <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px', color: 'var(--primary)' }} />
        <p style={{ color: 'var(--text-muted)' }}>Loading item details...</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div style={{ paddingBottom: '40px', maxWidth: '780px', margin: '0 auto' }}>
        <button 
          onClick={() => navigate('/browse')} 
          className="btn btn-secondary" 
          style={{ marginBottom: '20px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <ArrowLeft size={16} /> Back to Browse
        </button>

        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <AlertCircle size={36} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.25rem', marginBottom: '8px', color: 'var(--text-main)' }}>Item Not Found</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 20px', fontSize: '0.9rem' }}>
            The item you are looking for does not exist or may have been resolved.
          </p>
          <button onClick={() => navigate('/browse')} className="btn btn-primary">
            <PackageSearch size={16} /> Browse Items
          </button>
        </div>
      </div>
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
    day: 'numeric'
  });

  const userLostReports = reports.filter(r => r.userId === user.id && r.type === 'lost' && r.status !== 'resolved');

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '48px' }}>
      <button 
        onClick={() => navigate(-1)} 
        className="btn btn-secondary" 
        style={{ marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* Main Card */}
      <div className="card" style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        
        {/* Image / Category Banner */}
        <div 
          style={{ 
            height: '240px', 
            backgroundColor: 'var(--bg-color)', 
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center', padding: '20px' }}>
              <span style={{ fontSize: '3.5rem' }}>{catArt.emoji}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {catArt.label} • {item.imageUrl && imageError ? 'Image preview unavailable' : 'No photo uploaded'}
              </span>
            </div>
          )}

          {/* Status Badge */}
          <div style={{ position: 'absolute', top: '14px', left: '14px', display: 'flex', gap: '6px' }}>
            <span 
              style={{ 
                padding: '4px 10px', 
                borderRadius: '4px', 
                fontSize: '0.74rem', 
                fontWeight: 650, 
                backgroundColor: item.status === 'lost' ? 'var(--danger-light)' : item.status === 'found' ? 'var(--success-light)' : 'var(--bg-color)',
                color: item.status === 'lost' ? 'var(--danger)' : item.status === 'found' ? 'var(--success)' : 'var(--text-secondary)',
                border: '1px solid var(--border)'
              }}
            >
              {item.status === 'lost' ? 'LOST REPORT' : item.status === 'found' ? 'FOUND REPORT' : 'RESOLVED'}
            </span>

            {item.custodyStatus && (
              <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.72rem', backgroundColor: '#FFFFFF', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                {item.custodyStatus === 'with_finder' && 'With finder'}
                {item.custodyStatus === 'handed_to_desk' && 'Handed to helpdesk'}
                {item.custodyStatus === 'only_observed' && 'Observed only'}
                {item.custodyStatus === 'desk_custody_confirmed' && 'Helpdesk verified'}
              </span>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '28px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
              <Tag size={13} />
              <span>{item.category}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              <Clock size={13} />
              <span>Logged {formattedCreatedAt}</span>
            </div>
          </div>

          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 20px 0', lineHeight: 1.25 }}>
            {item.title}
          </h1>

          {/* Structured Attributes Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', 
            backgroundColor: 'var(--bg-color)',
            borderRadius: 'var(--radius-sm)', 
            border: '1px solid var(--border)',
            marginBottom: '24px',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '3px' }}>
                Location
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {item.campusZone ? `${item.campusZone} • ${item.location}` : item.location}
              </div>
            </div>

            <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '3px' }}>
                {item.type === 'lost' ? 'Date lost' : 'Date found'}
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {formattedDate}
              </div>
            </div>

            {item.brandModel && (
              <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '3px' }}>
                  Brand / Model
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {item.brandModel}
                </div>
              </div>
            )}

            {item.color && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '3px' }}>
                  Color
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {item.color}
                </div>
              </div>
            )}
          </div>

          {/* Distinguishing Features if present */}
          {item.distinguishingFeatures && (
            <div style={{ marginBottom: '20px', padding: '12px 16px', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Distinguishing marks
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                {item.distinguishingFeatures}
              </div>
            </div>
          )}

          {/* Description */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Description
            </h3>
            <p style={{ fontSize: '0.94rem', color: 'var(--text-main)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
              {item.description}
            </p>
          </div>

          {/* Owner-Protected Private Detail Card (if owner) */}
          {isOwner && (ownerPrivateDetail || item.privateEvidence) && (
            <div style={{
              padding: '16px',
              backgroundColor: 'var(--bg-color)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '24px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <ShieldCheck size={16} color="var(--primary)" />
                <span style={{ fontSize: '0.82rem', fontWeight: 650, color: 'var(--text-main)' }}>
                  Private Identifying Details (Confidential — visible only to you)
                </span>
              </div>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', margin: 0, lineHeight: 1.5 }}>
                {ownerPrivateDetail || item.privateEvidence}
              </p>
            </div>
          )}

          {/* Claim Callout / Status Card for Found items when viewed by another student */}
          {!isOwner && item.type === 'found' && item.status !== 'resolved' && (
            <div style={{
              padding: '18px 20px',
              backgroundColor: 'var(--bg-color)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '24px'
            }}>
              {claimSuccess && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: 'var(--success-light)', color: 'var(--success)', borderRadius: '4px', fontSize: '0.82rem', marginBottom: '12px' }}>
                  <CheckCircle2 size={15} />
                  <span>{claimSuccess}</span>
                </div>
              )}
              {existingClaim ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <ShieldCheck size={18} color="var(--primary)" />
                    <span style={{ fontSize: '0.9rem', fontWeight: 650, color: 'var(--text-main)' }}>
                      Your Ownership Claim Status:
                    </span>
                    <span style={{ 
                      padding: '2px 8px', 
                      borderRadius: '4px', 
                      fontSize: '0.74rem', 
                      fontWeight: 700, 
                      backgroundColor: 
                        existingClaim.status === 'APPROVED_FOR_HANDOVER' ? 'var(--success-light)' :
                        existingClaim.status === 'DISPUTED' ? 'var(--danger-light)' :
                        existingClaim.status === 'RESOLVED' ? 'var(--success-light)' : 'var(--primary-light)',
                      color: 
                        existingClaim.status === 'APPROVED_FOR_HANDOVER' ? 'var(--success)' :
                        existingClaim.status === 'DISPUTED' ? 'var(--danger)' :
                        existingClaim.status === 'RESOLVED' ? 'var(--success)' : 'var(--primary)'
                    }}>
                      {existingClaim.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {existingClaim.status === 'APPROVED_FOR_HANDOVER' ? (
                    <p style={{ fontSize: '0.84rem', color: 'var(--success)', margin: 0, lineHeight: 1.5 }}>
                      <strong>Approved!</strong> Please report to the Central Campus Helpdesk with your student PRN card to complete physical verification and collection.
                    </p>
                  ) : existingClaim.status === 'DISPUTED' ? (
                    <p style={{ fontSize: '0.84rem', color: 'var(--danger)', margin: 0, lineHeight: 1.5 }}>
                      Multiple conflicting claims have been filed for this item. Campus administration and desk operators are auditing the records.
                    </p>
                  ) : (
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                      Your claim is in queue for helpdesk verification. You will be notified once reviewed.
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                  <div style={{ maxWidth: '480px' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 650, color: 'var(--text-main)', marginBottom: '3px' }}>
                      Recognize this item?
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                      If this is your lost possession, file an ownership claim with identifying evidence. Handover is mediated through the campus helpdesk.
                    </div>
                  </div>

                  <button 
                    type="button" 
                    className="btn btn-primary"
                    onClick={() => setShowClaimModal(true)}
                    style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <ShieldCheck size={16} /> This might be mine
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action Error */}
          {actionError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '4px', fontSize: '0.88rem', marginBottom: '16px' }}>
              <AlertCircle size={16} />
              <span>{actionError}</span>
            </div>
          )}

          {/* Actions Bar */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => navigate('/browse')}
            >
              Back to Browse
            </button>

            {item.status !== 'resolved' && (
              <button 
                className="btn btn-primary" 
                onClick={() => navigate('/ai-matches')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Sparkles size={16} /> Suggested Matches
              </button>
            )}

            {isOwner && (
              <>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => navigate(`/report/edit/${item.id}`)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Pencil size={15} /> Edit
                </button>

                {item.status !== 'resolved' && (
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => { setActionError(null); setModalState({ type: 'resolve' }); }}
                    style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <CheckCircle2 size={15} />
                    {item.type === 'lost' ? 'Mark Recovered' : 'Mark Resolved'}
                  </button>
                )}

                <button 
                  className="btn btn-ghost" 
                  onClick={() => { setActionError(null); setModalState({ type: 'delete' }); }}
                  style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}
                >
                  <Trash2 size={15} /> Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Claim Submission Modal */}
      {showClaimModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '16px'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '520px', backgroundColor: '#FFFFFF', borderRadius: 'var(--radius)', padding: '24px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={18} color="var(--primary)" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 650, margin: 0, color: 'var(--text-main)' }}>
                  Submit Ownership Claim
                </h3>
              </div>
              <button 
                onClick={() => setShowClaimModal(false)}
                className="btn btn-ghost"
                style={{ padding: '4px', height: 'auto' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.45 }}>
              Describe something only the genuine owner would know (e.g. lockscreen wallpaper, serial number, engraved initials, contents). The campus helpdesk verifies this evidence prior to handover.
            </p>

            <form onSubmit={handleSubmitClaim}>
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600, margin: 0 }}>
                    Identifying Evidence *
                  </label>
                  <span style={{ fontSize: '0.72rem', color: claimEvidence.length < 10 || claimEvidence.length > 500 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {claimEvidence.length}/500 chars (min 10)
                  </span>
                </div>
                <textarea 
                  required
                  rows={4}
                  maxLength={500}
                  className="form-control"
                  placeholder="e.g. In the front pocket there is a blue Parker pen and a hostel room 304 key on a brass ring..."
                  value={claimEvidence}
                  onChange={(e) => setClaimEvidence(e.target.value)}
                  style={{ fontSize: '0.86rem' }}
                />
              </div>

              {userLostReports.length > 0 && (
                <div style={{ marginBottom: '18px' }}>
                  <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
                    Link your Lost Report (Optional)
                  </label>
                  <select 
                    className="form-control"
                    value={linkedLostReportId}
                    onChange={(e) => setLinkedLostReportId(e.target.value)}
                    style={{ fontSize: '0.86rem' }}
                  >
                    <option value="">None (Standalone claim)</option>
                    {userLostReports.map(lr => (
                      <option key={lr.id} value={lr.id}>
                        {lr.title} (Reported {new Date(lr.date).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {claimError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '4px', fontSize: '0.82rem', marginBottom: '14px' }}>
                  <AlertCircle size={15} />
                  <span>{claimError}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowClaimModal(false)}
                  disabled={claimSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={claimSubmitting}
                >
                  {claimSubmitting ? 'Submitting...' : 'Submit Claim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {modalState && (
        <ConfirmModal
          isOpen={true}
          onClose={() => setModalState(null)}
          onConfirm={handleConfirmAction}
          variant={modalState.type === 'delete' ? 'danger' : 'success'}
          title={modalState.type === 'delete' ? 'Delete Report' : 'Mark Report as Resolved'}
          description={modalState.type === 'delete' ? `Are you sure you want to delete "${item.title}"? This action cannot be undone.` : `Confirm resolving "${item.title}".`}
          confirmText={actionLoading ? 'Processing...' : modalState.type === 'delete' ? 'Delete' : 'Confirm'}
          cancelText="Cancel"
        />
      )}
    </div>
  );
};
