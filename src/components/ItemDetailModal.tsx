import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import type { PublicVerificationPrompt } from '../types';
import {
  X, MapPin, Calendar, Tag, ShieldCheck, Sparkles,
  MessageSquarePlus, Eye, CheckCircle2, HeartHandshake,
  Clock, Send, Coffee, AlertTriangle, Lock, UploadCloud,
  AlertCircle, Loader2, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const getCategoryIllustration = (category: string) => {
  switch (category) {
    case 'Electronics': return { emoji: '🎧', bg: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)', label: 'Tech & Gear' };
    case 'ID Cards': return { emoji: '🪪', bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', label: 'Campus ID & Cards' };
    case 'Bags': return { emoji: '🎒', bg: 'linear-gradient(135deg, #FCE7F3 0%, #FBCFE8 100%)', label: 'Backpacks & Totes' };
    case 'Books': return { emoji: '📓', bg: 'linear-gradient(135deg, #FEF9C3 0%, #FEF08A 100%)', label: 'Notes & Books' };
    case 'Accessories': return { emoji: '💧', bg: 'linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 100%)', label: 'Bottles & Everyday' };
    case 'Keys': return { emoji: '🔑', bg: 'linear-gradient(135deg, #FFEDD5 0%, #FED7AA 100%)', label: 'Keys & Fobs' };
    default: return { emoji: '📦', bg: 'linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%)', label: 'Campus Item' };
  }
};

export const formatClaimStatusLabel = (status: string): { label: string; color: string; bg: string } => {
  switch (status) {
    case 'submitted':
    case 'verification_pending':
      return { label: 'Verification Pending', color: 'var(--primary)', bg: 'var(--primary-light)' };
    case 'finder_review_required':
      return { label: 'Finder Review Required', color: '#B45309', bg: '#FEF3C7' };
    case 'administrator_review_required':
      return { label: 'Administrator Review Required', color: '#9333EA', bg: '#F3E8FF' };
    case 'additional_evidence_required':
      return { label: 'Additional Evidence Required', color: 'var(--danger)', bg: 'var(--danger-light)' };
    case 'approved_for_handover':
      return { label: 'Approved for Handover', color: 'var(--success)', bg: 'var(--success-light)' };
    case 'handed_over':
      return { label: 'Handed Over & Returned', color: 'var(--success)', bg: 'var(--success-light)' };
    case 'rejected':
      return { label: 'Claim Rejected', color: 'var(--danger)', bg: 'var(--danger-light)' };
    default:
      return { label: status.replace(/_/g, ' '), color: 'var(--text-main)', bg: 'var(--bg-subtle)' };
  }
};

export const ItemDetailModal: React.FC = () => {
  const {
    user,
    selectedReport,
    setSelectedReportId,
    addComment,
    toggleHelpful,
    helpedIds,
    updateReportStatus,
    mySubmittedClaims,
    fetchVerificationPrompts,
    submitOwnershipClaim
  } = useData();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [commentText, setCommentText] = useState('');
  const [isSighting, setIsSighting] = useState(true);
  const [showReunitePrompt, setShowReunitePrompt] = useState(false);
  const [gratitudeQuote, setGratitudeQuote] = useState('');

  // Claim Form State (for Found items)
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [prompts, setPrompts] = useState<PublicVerificationPrompt[]>([]);
  const [hasPrivateDetails, setHasPrivateDetails] = useState(false);
  const [enhancedVerification, setEnhancedVerification] = useState(false);
  const [estimatedValue, setEstimatedValue] = useState(0);

  const [explanation, setExplanation] = useState('');
  const [answersMap, setAnswersMap] = useState<Record<string, string>>({});
  const [fallbackDetails, setFallbackDetails] = useState('');
  const [truthfulnessConfirmed, setTruthfulnessConfirmed] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<{
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataUrl: string;
  } | null>(null);
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimSuccessStatus, setClaimSuccessStatus] = useState<string | null>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setShowClaimForm(false);
    setShowReunitePrompt(false);
    setClaimError(null);
    setClaimSuccessStatus(null);
    setExplanation('');
    setAnswersMap({});
    setFallbackDetails('');
    setTruthfulnessConfirmed(false);
    setEvidenceFile(null);
    setEvidenceDescription('');
  }, [selectedReport?.id]);

  if (!selectedReport) return null;

  const isHelped = helpedIds.includes(selectedReport.id);
  const catArt = getCategoryIllustration(selectedReport.category);
  const reporterInitials = (selectedReport.reporterName || 'Campus Student')
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2);

  const isOwnListing = isAuthenticated && selectedReport.userId === user.id;
  const existingActiveClaim = mySubmittedClaims.find(
    c => c.itemId === selectedReport.id && c.status !== 'rejected'
  );

  const handleOpenClaimForm = async () => {
    if (!isAuthenticated) {
      const targetId = selectedReport.id;
      setSelectedReportId(null);
      navigate(`/login?redirect=${encodeURIComponent(`/browse?id=${targetId}`)}`);
      return;
    }
    setShowClaimForm(true);
    setClaimError(null);
    setLoadingPrompts(true);
    try {
      const res = await fetchVerificationPrompts(selectedReport.id);
      setPrompts(res.prompts || []);
      setHasPrivateDetails(res.hasPrivateDetails);
      setEnhancedVerification(res.enhancedVerification);
      setEstimatedValue(res.estimatedValue || selectedReport.estimatedValue || 0);
    } finally {
      setLoadingPrompts(false);
    }
  };

  const handleEvidenceFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setClaimError('Supporting evidence file must be under 4MB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setEvidenceFile({
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
          sizeBytes: file.size,
          dataUrl: reader.result
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaimError(null);

    if (explanation.trim().length < 15) {
      setClaimError('Please explain why you believe this item belongs to you (at least 15 characters).');
      return;
    }

    const formattedAnswers: { promptId: string; promptLabel: string; answer: string }[] = [];
    if (hasPrivateDetails && prompts.length > 0) {
      for (const p of prompts) {
        const val = (answersMap[p.id] || '').trim();
        if (val.length < 2) {
          setClaimError(`Please provide an answer for: "${p.promptLabel}"`);
          return;
        }
        formattedAnswers.push({
          promptId: p.id,
          promptLabel: p.promptLabel,
          answer: val
        });
      }
    } else {
      if (fallbackDetails.trim().length < 5) {
        setClaimError('Please describe at least two non-public identifying marks or details known only to the owner.');
        return;
      }
      formattedAnswers.push({
        promptId: 'fallback_1',
        promptLabel: 'Private identifying characteristics & contents (Fallback Verification)',
        answer: fallbackDetails.trim()
      });
    }

    if (!truthfulnessConfirmed) {
      setClaimError('Please check the box to confirm that your submitted ownership details are truthful.');
      return;
    }

    setClaimSubmitting(true);
    try {
      const res = await submitOwnershipClaim({
        itemId: selectedReport.id,
        itemTitle: selectedReport.title,
        itemCategory: selectedReport.category,
        itemImageUrl: selectedReport.imageUrl,
        itemLocation: selectedReport.location,
        finderId: selectedReport.userId,
        estimatedValue: estimatedValue || selectedReport.estimatedValue || 0,
        explanation: explanation.trim(),
        submittedAnswers: formattedAnswers,
        truthfulnessConfirmed: true,
        evidenceUpload: evidenceFile
          ? {
              ...evidenceFile,
              description: evidenceDescription.trim() || 'Supporting ownership proof'
            }
          : undefined
      });

      if (!res.ok) {
        setClaimError(res.error || 'Failed to submit claim.');
        return;
      }

      setClaimSuccessStatus(res.claim?.status || 'finder_review_required');
      setShowClaimForm(false);
    } finally {
      setClaimSubmitting(false);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const ok = await addComment(selectedReport.id, commentText, isSighting);
    if (ok) setCommentText('');
  };

  const handleConfirmLostReunion = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateReportStatus(
      selectedReport.id,
      'resolved',
      gratitudeQuote.trim() || `Reunited safely at ${selectedReport.location}! Big thanks to our campus community.`
    );
    setShowReunitePrompt(false);
    setGratitudeQuote('');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(17, 19, 24, 0.6)',
          backdropFilter: 'blur(6px)',
          zIndex: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}
        onClick={() => setSelectedReportId(null)}
      >
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="card"
          style={{
            width: '100%',
            maxWidth: '720px',
            maxHeight: '92vh',
            overflowY: 'auto',
            backgroundColor: 'var(--bg-card)',
            borderRadius: '24px',
            boxShadow: 'var(--shadow-lg)',
            position: 'relative'
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Visual Header */}
          <div style={{ position: 'relative', height: selectedReport.imageUrl ? '250px' : '175px', overflow: 'hidden', background: catArt.bg }}>
            {selectedReport.imageUrl ? (
              <img
                src={selectedReport.imageUrl}
                alt={selectedReport.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <div style={{ fontSize: '4rem', lineHeight: 1 }}>{catArt.emoji}</div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#44403C', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {catArt.label}
                </span>
              </div>
            )}

            {/* Top Overlay Controls */}
            <div style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  className={`badge ${
                    selectedReport.status === 'lost'
                      ? 'badge-lost'
                      : selectedReport.status === 'found'
                      ? 'badge-found'
                      : 'badge-match'
                  }`}
                  style={{ backdropFilter: 'blur(8px)', padding: '6px 14px', fontSize: '0.78rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                >
                  {selectedReport.status === 'lost'
                    ? '🔍 Lost — Looking for this'
                    : selectedReport.status === 'found'
                    ? '🙌 Found — Protected Claim Verification'
                    : '🎉 Happily Returned'}
                </span>
                {selectedReport.hasPrivateVerification && selectedReport.status === 'found' && (
                  <span className="badge" style={{ backgroundColor: 'rgba(79, 70, 229, 0.92)', color: 'white' }}>
                    <Lock size={11} /> Ownership Verified
                  </span>
                )}
                {selectedReport.urgency === 'high' && selectedReport.status !== 'resolved' && (
                  <span className="badge" style={{ backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
                    <AlertTriangle size={12} /> Urgent
                  </span>
                )}
              </div>

              <button
                onClick={() => setSelectedReportId(null)}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(28, 25, 23, 0.65)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(6px)'
                }}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div style={{ padding: '28px' }}>
            {/* Category & Date Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Tag size={14} />
                <span>{selectedReport.category}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <Calendar size={14} />
                <span>
                  {new Date(selectedReport.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  {selectedReport.time ? ` around ${selectedReport.time}` : ''}
                </span>
              </div>
            </div>

            <h2 style={{ fontSize: '1.5rem', marginBottom: '12px', lineHeight: 1.25 }}>
              {selectedReport.title}
            </h2>

            {/* Location Pill */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '12px', backgroundColor: 'var(--bg-subtle)', color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '18px' }}>
              <MapPin size={16} color="var(--accent-warm)" />
              <span>{selectedReport.location}</span>
            </div>

            {/* Story / Description */}
            <p style={{ fontSize: '0.98rem', color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: '18px' }}>
              {selectedReport.description}
            </p>

            {/* Gratitude / Finder Note */}
            {selectedReport.gratitudeNote && (
              <div className="gratitude-box" style={{ marginBottom: '22px', padding: '14px 16px', fontSize: '0.9rem' }}>
                <Coffee size={18} color="var(--amber)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '2px' }}>
                    {selectedReport.type === 'lost' ? 'Note from Owner:' : 'Storage / Finder Note:'}
                  </strong>
                  <span>“{selectedReport.gratitudeNote}”</span>
                </div>
              </div>
            )}

            {/* Reporter Card + Primary Action Buttons */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              padding: '16px 20px',
              borderRadius: '16px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              marginBottom: '22px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-warm) 100%)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                  boxShadow: '0 4px 10px rgba(79, 70, 229, 0.2)'
                }}>
                  {reporterInitials}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--text-main)' }}>
                    <span>{selectedReport.reporterName || 'Campus Member'}</span>
                    {selectedReport.reporterVerified !== false && (
                      <span title="Verified Campus ID" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'var(--success-light)', color: 'var(--success)', fontWeight: 700 }}>
                        <ShieldCheck size={12} /> Verified
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                    {selectedReport.reporterRole || 'Campus Community Member'}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => toggleHelpful(selectedReport.id)}
                  className={isHelped ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ padding: '10px 14px', fontSize: '0.85rem' }}
                >
                  <Eye size={16} />
                  <span>{isHelped ? 'Keeping an Eye Out' : "I'll Keep an Eye Out"}</span>
                  <span style={{
                    padding: '2px 7px',
                    borderRadius: '999px',
                    backgroundColor: isHelped ? 'rgba(255,255,255,0.22)' : 'var(--bg-subtle)',
                    fontSize: '0.78rem',
                    fontWeight: 700
                  }}>
                    {selectedReport.helpfulCount || 0}
                  </span>
                </button>

                {/* FOUND ITEM: CLAIM THIS ITEM BUTTON */}
                {selectedReport.type === 'found' && selectedReport.status !== 'resolved' && (
                  isOwnListing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReportId(null);
                        navigate('/my-reports');
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '10px 16px', fontSize: '0.85rem', borderColor: 'var(--primary)', color: 'var(--primary)' }}
                    >
                      <ShieldCheck size={16} />
                      <span>Manage Claims on My Found Item</span>
                    </button>
                  ) : existingActiveClaim ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReportId(null);
                        navigate('/my-reports');
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '10px 16px', fontSize: '0.85rem', backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}
                    >
                      <ShieldCheck size={16} />
                      <span>View Your Active Claim ({formatClaimStatusLabel(existingActiveClaim.status).label})</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenClaimForm}
                      className="btn btn-primary"
                      style={{ padding: '10px 18px', fontSize: '0.88rem' }}
                    >
                      <ShieldCheck size={17} />
                      <span>Claim This Item</span>
                    </button>
                  )
                )}

                {/* LOST ITEM: I FOUND THIS BUTTON */}
                {selectedReport.type === 'lost' && selectedReport.status !== 'resolved' && isOwnListing && (
                  <button
                    type="button"
                    onClick={() => setShowReunitePrompt(!showReunitePrompt)}
                    className="btn btn-warm"
                    style={{ padding: '10px 16px', fontSize: '0.85rem' }}
                  >
                    <HeartHandshake size={16} />
                    <span>Mark My Lost Item as Found</span>
                  </button>
                )}
              </div>
            </div>

            {/* Claim Submission Success Banner */}
            {claimSuccessStatus && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                role="status"
                style={{
                  padding: '18px 20px',
                  borderRadius: '16px',
                  backgroundColor: 'var(--success-light)',
                  border: '1.5px solid var(--success-border)',
                  marginBottom: '24px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: 'var(--success)', fontSize: '1rem' }}>
                    <CheckCircle2 size={20} />
                    <span>Ownership Claim Submitted Successfully!</span>
                  </div>
                  <span className="badge badge-found">
                    Status: {formatClaimStatusLabel(claimSuccessStatus).label}
                  </span>
                </div>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
                  Your private answers and ownership explanation have been encrypted and sent for review. You can track status updates or upload additional evidence anytime under <strong>My Reports &amp; Claims</strong>.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '8px 14px', fontSize: '0.82rem' }}
                  onClick={() => {
                    setSelectedReportId(null);
                    navigate('/my-reports');
                  }}
                >
                  <span>Go to My Claims Tracker</span>
                  <ExternalLink size={14} />
                </button>
              </motion.div>
            )}

            {/* ==============================================================
                SECTION 2: CLAIM THIS ITEM FORM (FOR ELIGIBLE FOUND ITEMS)
               ============================================================== */}
            <AnimatePresence>
              {showClaimForm && !existingActiveClaim && !isOwnListing && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleClaimSubmit}
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    border: '1.5px solid var(--primary)',
                    borderRadius: '20px',
                    padding: '24px',
                    marginBottom: '26px',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', fontSize: '0.73rem', fontWeight: 700, marginBottom: '6px' }}>
                        <Lock size={12} /> Protected Ownership Verification
                      </div>
                      <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)' }}>
                        Claim “{selectedReport.title}”
                      </h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Submitting as <strong>{user.name}</strong> ({user.email}). Your answers are kept strictly confidential.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowClaimForm(false)}
                      style={{ color: 'var(--text-muted)', padding: '4px' }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {enhancedVerification && (
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: '12px',
                      backgroundColor: '#F3E8FF',
                      border: '1px solid #D8B4FE',
                      color: '#6B21A8',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <ShieldCheck size={16} />
                      <span>
                        Enhanced Protection Item: Claims on this item undergo both Finder verification and Campus Administrator review.
                      </span>
                    </div>
                  )}

                  {claimError && (
                    <div
                      role="alert"
                      style={{
                        padding: '12px 14px',
                        borderRadius: '12px',
                        backgroundColor: 'var(--danger-light)',
                        border: '1px solid var(--danger-border)',
                        color: 'var(--danger)',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <AlertCircle size={17} style={{ flexShrink: 0 }} />
                      <span>{claimError}</span>
                    </div>
                  )}

                  {loadingPrompts ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Loading verification questions...</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* 1. Explanation of Ownership */}
                      <div>
                        <label htmlFor="claim-explanation" className="form-label">
                          1. Why do you believe this item belongs to you? *
                        </label>
                        <textarea
                          id="claim-explanation"
                          rows={2}
                          required
                          className="form-control"
                          placeholder="Explain when and where you lost it, how you use it, or any context only the owner would know..."
                          value={explanation}
                          onChange={e => setExplanation(e.target.value)}
                        />
                      </div>

                      {/* 2. Private Identifying Characteristics Prompts (or Fallback) */}
                      {hasPrivateDetails && prompts.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            2. Answer the Finder’s Private Verification Questions *
                          </div>
                          {prompts.map((p, idx) => (
                            <div
                              key={p.id}
                              style={{
                                padding: '14px',
                                borderRadius: '14px',
                                backgroundColor: 'var(--bg-card)',
                                border: '1px solid var(--border)'
                              }}
                            >
                              <label htmlFor={`claim-prompt-${p.id}`} style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', display: 'block', marginBottom: '6px' }}>
                                Q{idx + 1}: {p.promptLabel} *
                              </label>
                              <input
                                id={`claim-prompt-${p.id}`}
                                type="text"
                                required
                                className="form-control"
                                placeholder="Describe this specific detail as accurately as you can..."
                                value={answersMap[p.id] || ''}
                                onChange={e =>
                                  setAnswersMap(prev => ({ ...prev, [p.id]: e.target.value }))
                                }
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div>
                          <label htmlFor="claim-fallback-details" className="form-label">
                            2. Describe Private Identifying Characteristics (Fallback Review) *
                          </label>
                          <textarea
                            id="claim-fallback-details"
                            rows={2}
                            required
                            className="form-control"
                            placeholder="This item does not have pre-set questions. Describe 2–3 unique marks, ID numbers, scratches, or contents known only to you..."
                            value={fallbackDetails}
                            onChange={e => setFallbackDetails(e.target.value)}
                          />
                        </div>
                      )}

                      {/* 3. Optional Supporting Evidence Upload */}
                      <div style={{
                        padding: '14px 16px',
                        borderRadius: '14px',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px dashed var(--border-strong)'
                      }}>
                        <label className="form-label" style={{ marginBottom: '4px' }}>
                          3. Optional Supporting Evidence (Private — visible only to Finder &amp; Admin)
                        </label>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                          Attach a purchase receipt, box serial number photo, or older photo of you with the item (JPG, PNG, PDF up to 4MB).
                        </p>
                        <input
                          ref={evidenceInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
                          onChange={handleEvidenceFileSelect}
                          style={{ display: 'none' }}
                        />
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '8px 14px', fontSize: '0.82rem' }}
                            onClick={() => evidenceInputRef.current?.click()}
                          >
                            <UploadCloud size={15} />
                            <span>{evidenceFile ? `Selected: ${evidenceFile.fileName}` : 'Attach Private File'}</span>
                          </button>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Optional note about your evidence (e.g., Invoice from Oct 2025)..."
                            style={{ flex: 1, minWidth: '200px', padding: '8px 12px', fontSize: '0.84rem' }}
                            value={evidenceDescription}
                            onChange={e => setEvidenceDescription(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* 4. Truthfulness Confirmation */}
                      <label style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        color: 'var(--text-main)',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border)'
                      }}>
                        <input
                          type="checkbox"
                          checked={truthfulnessConfirmed}
                          onChange={e => setTruthfulnessConfirmed(e.target.checked)}
                          style={{ marginTop: '3px', width: '16px', height: '16px' }}
                        />
                        <span>
                          <strong>I confirm that the information submitted above is truthful</strong> and that I am the genuine owner (or authorized representative) of this item. False claims may be flagged for campus administrator review.
                        </span>
                      </label>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setShowClaimForm(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={claimSubmitting}
                          className="btn btn-primary"
                          style={{ minWidth: '190px' }}
                        >
                          {claimSubmitting ? (
                            <>
                              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                              <span>Submitting Claim...</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck size={16} />
                              <span>Submit Ownership Claim</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </motion.form>
              )}
            </AnimatePresence>

            {/* Lost Item Owner Self-Reunion Prompt */}
            <AnimatePresence>
              {showReunitePrompt && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleConfirmLostReunion}
                  style={{
                    backgroundColor: 'var(--success-light)',
                    border: '1px solid var(--success-border)',
                    borderRadius: '16px',
                    padding: '20px',
                    marginBottom: '24px',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--success)', marginBottom: '8px' }}>
                    <Sparkles size={18} />
                    <span>Celebrate a Campus Reunion!</span>
                  </div>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Marking your lost item as reunited will update its status and share a thank-you note on the Campus Kindness Wall (+30 Karma).
                  </p>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Add a quick thank-you note or how it was found..."
                    value={gratitudeQuote}
                    onChange={e => setGratitudeQuote(e.target.value)}
                    style={{ marginBottom: '12px', backgroundColor: 'var(--bg-card)' }}
                  />
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setShowReunitePrompt(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" style={{ background: 'var(--success)' }}>
                      <CheckCircle2 size={16} /> Confirm Reunion
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Community Sightings & Comments Section */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MessageSquarePlus size={18} color="var(--primary)" />
                  <span>Community Sightings &amp; Public Notes ({selectedReport.comments?.length || 0})</span>
                </h3>
              </div>

              {/* Existing comments */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                {(!selectedReport.comments || selectedReport.comments.length === 0) ? (
                  <div style={{ padding: '20px', textAlign: 'center', borderRadius: '14px', backgroundColor: 'var(--bg-subtle)', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    No public sightings posted yet. (If this is your found item, click <strong>Claim This Item</strong> above rather than posting private details publicly.)
                  </div>
                ) : (
                  selectedReport.comments.map(c => (
                    <div
                      key={c.id}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '14px',
                        backgroundColor: 'var(--bg-subtle)',
                        border: '1px solid var(--border)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>{c.authorName}</span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>• {c.authorRole}</span>
                          {c.isSighting && (
                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700 }}>
                              📍 Campus Clue
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} />
                          {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.text}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Add a comment form */}
              <form onSubmit={handleCommentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.82rem' }}>
                  <button
                    type="button"
                    onClick={() => setIsSighting(true)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '999px',
                      fontWeight: 600,
                      backgroundColor: isSighting ? 'var(--primary-light)' : 'transparent',
                      color: isSighting ? 'var(--primary)' : 'var(--text-muted)',
                      border: `1px solid ${isSighting ? 'var(--primary)' : 'var(--border)'}`
                    }}
                  >
                    📍 Post a Sighting / Clue
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSighting(false)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '999px',
                      fontWeight: 600,
                      backgroundColor: !isSighting ? 'var(--primary-light)' : 'transparent',
                      color: !isSighting ? 'var(--primary)' : 'var(--text-muted)',
                      border: `1px solid ${!isSighting ? 'var(--primary)' : 'var(--border)'}`
                    }}
                  >
                    💬 Public Question
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder={
                      isSighting
                        ? `e.g., "Saw this on the 2nd floor table near ${selectedReport.location.split('•')[0].trim()}..."`
                        : 'Write a public note (never post secret serial numbers here)...'
                    }
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn btn-primary" style={{ padding: '0 20px', flexShrink: 0 }}>
                    <Send size={16} />
                    <span>Post</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
