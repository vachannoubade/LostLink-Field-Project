import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../store/DataContext';
import type { ClaimRecord, ClaimStatus } from '../types';
import { ItemCard } from '../components/ItemCard';
import {
  FolderOpen,
  CheckCircle2,
  Trash2,
  FilePlus,
  HeartHandshake,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Upload,
  AlertTriangle,
  Clock,
  XCircle,
  Send,
  FileText,
  UserCheck,
  Sparkles,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const STATUS_META: Record<ClaimStatus, { label: string; bg: string; color: string; border: string }> = {
  submitted: {
    label: 'Submitted',
    bg: 'var(--bg-subtle)',
    color: 'var(--text-secondary)',
    border: 'var(--border)'
  },
  verification_pending: {
    label: 'Verification Pending',
    bg: 'var(--primary-light)',
    color: 'var(--primary)',
    border: 'rgba(13, 107, 88, 0.25)'
  },
  additional_evidence_required: {
    label: 'Additional Evidence Required',
    bg: 'var(--warning-light)',
    color: 'var(--amber)',
    border: 'var(--amber-border)'
  },
  finder_review_required: {
    label: 'Finder Review Required',
    bg: 'var(--primary-light)',
    color: 'var(--primary)',
    border: 'rgba(13, 107, 88, 0.25)'
  },
  administrator_review_required: {
    label: 'Administrator Review Required',
    bg: 'var(--warning-light)',
    color: 'var(--amber)',
    border: 'var(--amber-border)'
  },
  approved_for_handover: {
    label: 'Approved for Handover',
    bg: 'var(--success-light)',
    color: 'var(--success)',
    border: 'var(--success-border)'
  },
  rejected: {
    label: 'Rejected',
    bg: 'var(--danger-light)',
    color: 'var(--danger)',
    border: 'var(--danger-border)'
  },
  handed_over: {
    label: 'Handed Over (Reunited)',
    bg: 'var(--success-light)',
    color: 'var(--success)',
    border: 'var(--success-border)'
  }
};

type FinderDecisionType = 'approved' | 'request_evidence' | 'rejected' | 'escalated';

export const MyReports: React.FC = () => {
  const {
    reports,
    user,
    updateReportStatus,
    deleteReport,
    setSelectedReportId,
    mySubmittedClaims,
    incomingFinderClaims,
    submitFinderClaimDecision,
    uploadClaimEvidence,
    confirmPhysicalHandover,
    refreshClaims
  } = useData();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'finder_claims' | 'my_claims' | 'my_items'>(
    incomingFinderClaims.length > 0 ? 'finder_claims' : mySubmittedClaims.length > 0 ? 'my_claims' : 'my_items'
  );

  // Finder decision state per claim
  const [decisionAction, setDecisionAction] = useState<Record<string, FinderDecisionType | null>>({});
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [decisionBusy, setDecisionBusy] = useState<Record<string, boolean>>({});
  const [decisionFeedback, setDecisionFeedback] = useState<Record<string, { type: 'error' | 'success'; text: string }>>({});

  // Handover confirmation state
  const [handoverConfirming, setHandoverConfirming] = useState<Record<string, boolean>>({});
  const [handoverNotes, setHandoverNotes] = useState<Record<string, string>>({});
  const [handoverBusy, setHandoverBusy] = useState<Record<string, boolean>>({});

  // Additional evidence upload state for claimants
  const [evidenceDesc, setEvidenceDesc] = useState<Record<string, string>>({});
  const [evidenceFile, setEvidenceFile] = useState<Record<string, { name: string; type: string; sizeBytes: number; dataUrl: string } | null>>({});
  const [evidenceBusy, setEvidenceBusy] = useState<Record<string, boolean>>({});
  const [evidenceMessage, setEvidenceMessage] = useState<Record<string, { type: 'error' | 'success'; text: string }>>({});

  // Private evidence preview modal
  const [previewEvidence, setPreviewEvidence] = useState<{ fileName: string; dataUrl: string; description: string } | null>(null);
  const [loadingEvidenceId, setLoadingEvidenceId] = useState<string | null>(null);

  const myReports = reports
    .filter(r => r.userId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingFinderClaimsCount = incomingFinderClaims.filter(c =>
    ['submitted', 'verification_pending', 'finder_review_required', 'approved_for_handover'].includes(c.status)
  ).length;

  const handleOpenEvidencePreview = async (claimId: string, evidenceId: string, description: string) => {
    setLoadingEvidenceId(evidenceId);
    try {
      const res = await fetch(`/api/claims/${encodeURIComponent(claimId)}/evidence/${encodeURIComponent(evidenceId)}`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.evidence) {
        setPreviewEvidence({
          fileName: data.evidence.fileName,
          dataUrl: data.evidence.dataUrl,
          description
        });
      } else {
        window.alert(data.error || 'Could not load private evidence file.');
      }
    } catch {
      window.alert('Network error while loading private evidence.');
    } finally {
      setLoadingEvidenceId(null);
    }
  };

  const handleExecuteFinderDecision = async (claim: ClaimRecord) => {
    const action = decisionAction[claim.id];
    if (!action) return;
    const notes = (decisionNotes[claim.id] || '').trim();

    if ((action === 'rejected' || action === 'request_evidence' || action === 'escalated') && notes.length < 5) {
      setDecisionFeedback(prev => ({
        ...prev,
        [claim.id]: {
          type: 'error',
          text: 'Please provide a clear reason or note (at least 5 characters) before confirming this action.'
        }
      }));
      return;
    }

    setDecisionBusy(prev => ({ ...prev, [claim.id]: true }));
    setDecisionFeedback(prev => {
      const next = { ...prev };
      delete next[claim.id];
      return next;
    });

    const result = await submitFinderClaimDecision(claim.id, action, notes);
    setDecisionBusy(prev => ({ ...prev, [claim.id]: false }));

    if (!result.ok) {
      setDecisionFeedback(prev => ({
        ...prev,
        [claim.id]: { type: 'error', text: result.error || 'Failed to update claim.' }
      }));
      return;
    }

    setDecisionAction(prev => ({ ...prev, [claim.id]: null }));
    setDecisionNotes(prev => ({ ...prev, [claim.id]: '' }));
    setDecisionFeedback(prev => ({
      ...prev,
      [claim.id]: {
        type: 'success',
        text:
          result.message ||
          (action === 'approved'
            ? 'Claim approved for handover! Once you physically meet and return the item, click "Confirm Physical Handover" below.'
            : action === 'request_evidence'
            ? 'Requested additional proof from the claimant.'
            : action === 'escalated'
            ? 'Claim escalated to the Administrator Review Queue.'
            : 'Claim rejected and recorded in the audit log.')
      }
    }));
  };

  const handleExecuteHandover = async (claim: ClaimRecord) => {
    const notes = (handoverNotes[claim.id] || '').trim();
    if (notes.length < 4) {
      setDecisionFeedback(prev => ({
        ...prev,
        [claim.id]: {
          type: 'error',
          text: 'Please briefly note how/where the physical handover took place (at least 4 characters).'
        }
      }));
      return;
    }

    setHandoverBusy(prev => ({ ...prev, [claim.id]: true }));
    const res = await confirmPhysicalHandover(claim.id, notes);
    setHandoverBusy(prev => ({ ...prev, [claim.id]: false }));

    if (!res.ok) {
      setDecisionFeedback(prev => ({
        ...prev,
        [claim.id]: { type: 'error', text: res.error || 'Could not confirm physical handover.' }
      }));
      return;
    }

    setHandoverConfirming(prev => ({ ...prev, [claim.id]: false }));
    setDecisionFeedback(prev => ({
      ...prev,
      [claim.id]: {
        type: 'success',
        text: 'Physical handover confirmed! The claim is now marked Handed Over and the item listing is Reunited.'
      }
    }));
  };

  const handleEvidenceFilePick = (claimId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_500_000) {
      setEvidenceMessage(prev => ({
        ...prev,
        [claimId]: { type: 'error', text: 'Evidence file must be under 2.5 MB.' }
      }));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setEvidenceFile(prev => ({
        ...prev,
        [claimId]: {
          name: file.name,
          type: file.type || 'image/jpeg',
          sizeBytes: file.size,
          dataUrl: reader.result as string
        }
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSupportingEvidence = async (claimId: string) => {
    const desc = (evidenceDesc[claimId] || '').trim();
    const file = evidenceFile[claimId];

    if (desc.length < 5) {
      setEvidenceMessage(prev => ({
        ...prev,
        [claimId]: { type: 'error', text: 'Please describe your supporting proof (at least 5 characters).' }
      }));
      return;
    }

    const encodedText = btoa(unescape(encodeURIComponent(desc)));
    const finalFile = file || {
      name: 'written-proof-statement.txt',
      type: 'text/plain',
      sizeBytes: desc.length,
      dataUrl: `data:text/plain;base64,${encodedText}`
    };

    setEvidenceBusy(prev => ({ ...prev, [claimId]: true }));
    const result = await uploadClaimEvidence(claimId, {
      description: desc,
      fileName: finalFile.name,
      mimeType: finalFile.type,
      sizeBytes: finalFile.sizeBytes,
      dataUrl: finalFile.dataUrl
    });
    setEvidenceBusy(prev => ({ ...prev, [claimId]: false }));

    if (!result.ok) {
      setEvidenceMessage(prev => ({
        ...prev,
        [claimId]: { type: 'error', text: result.error || 'Could not upload evidence.' }
      }));
      return;
    }

    setEvidenceDesc(prev => ({ ...prev, [claimId]: '' }));
    setEvidenceFile(prev => ({ ...prev, [claimId]: null }));
    setEvidenceMessage(prev => ({
      ...prev,
      [claimId]: {
        type: 'success',
        text: 'Supporting evidence submitted securely! Your claim is back in review.'
      }
    }));
  };

  return (
    <div style={{ paddingBottom: '44px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title serif-accent">My Reports &amp; Ownership Claims</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Review ownership claims on items you found, track your submitted claims, and manage your campus posts.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => refreshClaims()} style={{ fontSize: '0.84rem' }}>
            Refresh Claims
          </button>
          <button className="btn btn-warm" onClick={() => navigate('/report/lost')}>
            <FilePlus size={17} /> Report Lost
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/report/found')}>
            <HeartHandshake size={17} /> Report Found
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setActiveTab('finder_claims')}
          className={activeTab === 'finder_claims' ? 'btn btn-primary' : 'btn btn-secondary'}
          style={{ borderRadius: '999px', padding: '9px 18px', fontSize: '0.88rem' }}
        >
          <ShieldCheck size={16} />
          <span>Finder Claim Review Queue ({incomingFinderClaims.length})</span>
          {pendingFinderClaimsCount > 0 && (
            <span style={{
              marginLeft: '4px',
              padding: '2px 8px',
              borderRadius: '999px',
              fontSize: '0.74rem',
              fontWeight: 800,
              backgroundColor: activeTab === 'finder_claims' ? 'white' : 'var(--primary)',
              color: activeTab === 'finder_claims' ? 'var(--primary)' : 'white'
            }}>
              {pendingFinderClaimsCount} active
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('my_claims')}
          className={activeTab === 'my_claims' ? 'btn btn-primary' : 'btn btn-secondary'}
          style={{ borderRadius: '999px', padding: '9px 18px', fontSize: '0.88rem' }}
        >
          <Lock size={16} />
          <span>My Submitted Claims ({mySubmittedClaims.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('my_items')}
          className={activeTab === 'my_items' ? 'btn btn-primary' : 'btn btn-secondary'}
          style={{ borderRadius: '999px', padding: '9px 18px', fontSize: '0.88rem' }}
        >
          <FolderOpen size={16} />
          <span>My Reported Items ({myReports.length})</span>
        </button>
      </div>

      {/* TAB 1: FINDER CLAIM REVIEW DASHBOARD */}
      {activeTab === 'finder_claims' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {incomingFinderClaims.length === 0 ? (
            <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
              <ShieldCheck size={40} color="var(--primary)" style={{ margin: '0 auto 14px' }} />
              <h3 className="serif-accent" style={{ fontSize: '1.3rem', marginBottom: '6px' }}>
                No incoming claims on your found items yet
              </h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: '480px', margin: '0 auto' }}>
                When a student submits an ownership verification claim for an item you reported found, their answers and supporting evidence will appear here for side-by-side comparison.
              </p>
            </div>
          ) : (
            incomingFinderClaims.map(claim => {
              const statusStyle = STATUS_META[claim.status] || STATUS_META.submitted;
              const currentDecision = decisionAction[claim.id] || null;
              const isTerminal = claim.status === 'handed_over' || claim.status === 'rejected';

              return (
                <div key={claim.id} className="card" style={{ padding: '24px', border: '1px solid var(--border)' }}>
                  {/* Header: Item + Status + Similarity */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '18px' }}>
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                      {claim.itemImageUrl && (
                        <img
                          src={claim.itemImageUrl}
                          alt={claim.itemTitle}
                          style={{ width: '64px', height: '64px', borderRadius: '12px', objectFit: 'cover', border: '1px solid var(--border)' }}
                        />
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            Claim #{claim.id.slice(-6)}
                          </span>
                          <span style={{ color: 'var(--border-strong)' }}>•</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Submitted {new Date(claim.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <h3 className="serif-accent" style={{ fontSize: '1.25rem', marginBottom: '4px', cursor: 'pointer', color: 'var(--text-main)' }} onClick={() => setSelectedReportId(claim.itemId)}>
                          {claim.itemTitle || `Found Item #${claim.itemId}`}
                        </h3>
                        <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                          Claimant: <strong>{claim.claimantName}</strong> ({claim.claimantEmail})
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                      <span
                        className="badge"
                        style={{
                          backgroundColor: statusStyle.bg,
                          color: statusStyle.color,
                          border: `1px solid ${statusStyle.border}`,
                          padding: '6px 12px',
                          fontSize: '0.78rem'
                        }}
                      >
                        {statusStyle.label}
                      </span>

                      {typeof claim.automatedScore === 'number' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                          <Sparkles size={13} color="var(--primary)" />
                          <span>Automated Answer Similarity: {claim.automatedScore}% (Supporting Indicator Only)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Escalation / Risk Flags Warning */}
                  {(claim.requiresAdminReview || (claim.riskFlags && claim.riskFlags.length > 0)) && (
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--warning-light)',
                      border: '1px solid var(--amber-border)',
                      marginBottom: '18px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px'
                    }}>
                      <AlertTriangle size={18} color="var(--amber)" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 700, color: 'var(--amber)' }}>
                          {claim.requiresAdminReview
                            ? 'Mandatory Administrator Review Active'
                            : 'Verification Signals Flagged for Careful Review'}
                        </div>
                        {claim.escalationReason && (
                          <div>Reason: {claim.escalationReason}</div>
                        )}
                        {claim.riskFlags && claim.riskFlags.length > 0 && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            Flags: {claim.riskFlags.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Claimant Ownership Explanation */}
                  <div style={{ marginBottom: '18px', padding: '14px 16px', borderRadius: '10px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Claimant’s Ownership Statement
                    </div>
                    <p style={{ fontSize: '0.92rem', color: 'var(--text-main)', lineHeight: 1.6, margin: 0 }}>
                      {claim.explanation}
                    </p>
                  </div>

                  {/* Side-by-Side Private Verification Comparison */}
                  {claim.comparisonBreakdown && claim.comparisonBreakdown.length > 0 && (
                    <div style={{ marginBottom: '18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '10px' }}>
                        <Lock size={14} color="var(--primary)" />
                        <span>Side-by-Side Private Ownership Check (Visible Only to You &amp; Admins)</span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {claim.comparisonBreakdown.map((item, idx) => (
                          <div
                            key={item.promptId || idx}
                            style={{
                              padding: '12px 14px',
                              borderRadius: '10px',
                              backgroundColor: 'var(--bg-card)',
                              border: '1px solid var(--border)',
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                              gap: '12px'
                            }}
                          >
                            <div>
                              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Prompt #{idx + 1}: {item.promptLabel}
                              </div>
                              <div style={{ fontSize: '0.86rem', color: 'var(--primary)', fontWeight: 700, marginTop: '4px' }}>
                                Your Recorded Secret Detail: “{item.secretAnswer}”
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Claimant’s Submitted Answer
                              </div>
                              <div style={{ fontSize: '0.88rem', color: 'var(--text-main)', fontWeight: 600, marginTop: '4px' }}>
                                “{item.claimantAnswer || 'No answer provided'}”
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              <span
                                className="badge"
                                style={{
                                  backgroundColor:
                                    item.matchLevel === 'strong'
                                      ? 'var(--success-light)'
                                      : item.matchLevel === 'partial'
                                      ? 'var(--warning-light)'
                                      : 'var(--bg-subtle)',
                                  color:
                                    item.matchLevel === 'strong'
                                      ? 'var(--success)'
                                      : item.matchLevel === 'partial'
                                      ? 'var(--amber)'
                                      : 'var(--text-secondary)',
                                  fontSize: '0.75rem'
                                }}
                              >
                                {item.similarity}% ({item.matchLevel} match)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fallback Submitted Answers (when item had no pre-configured secret prompts) */}
                  {(!claim.comparisonBreakdown || claim.comparisonBreakdown.length === 0) &&
                    claim.submittedAnswers &&
                    claim.submittedAnswers.length > 0 && (
                      <div style={{ marginBottom: '18px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                          Claimant’s Fallback Identifying Characteristics
                        </div>
                        {claim.submittedAnswers.map((ans, idx) => (
                          <div key={ans.promptId || idx} style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)', marginBottom: '6px' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)' }}>{ans.promptLabel}</div>
                            <div style={{ fontSize: '0.88rem', color: 'var(--text-main)', fontWeight: 600, marginTop: '2px' }}>{ans.answer}</div>
                          </div>
                        ))}
                      </div>
                    )}

                  {/* Private Supporting Evidence List */}
                  {claim.evidence && claim.evidence.length > 0 && (
                    <div style={{ marginBottom: '18px' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                        Uploaded Private Supporting Evidence ({claim.evidence.length})
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {claim.evidence.map(ev => (
                          <button
                            key={ev.id}
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '7px 12px', fontSize: '0.8rem' }}
                            disabled={loadingEvidenceId === ev.id}
                            onClick={() => handleOpenEvidencePreview(claim.id, ev.id, ev.description)}
                          >
                            <FileText size={14} color="var(--primary)" />
                            <span>{loadingEvidenceId === ev.id ? 'Loading...' : ev.fileName}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Feedback alert */}
                  {decisionFeedback[claim.id] && (
                    <div
                      style={{
                        padding: '11px 14px',
                        borderRadius: '10px',
                        marginBottom: '14px',
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        backgroundColor: decisionFeedback[claim.id].type === 'error' ? 'var(--danger-light)' : 'var(--success-light)',
                        color: decisionFeedback[claim.id].type === 'error' ? 'var(--danger)' : 'var(--success)',
                        border: `1px solid ${decisionFeedback[claim.id].type === 'error' ? 'var(--danger-border)' : 'var(--success-border)'}`
                      }}
                    >
                      {decisionFeedback[claim.id].text}
                    </div>
                  )}

                  {/* Separate Handover Confirmation Workflow when status === 'approved_for_handover' */}
                  {claim.status === 'approved_for_handover' && (
                    <div style={{
                      padding: '16px 18px',
                      borderRadius: '12px',
                      backgroundColor: 'var(--success-light)',
                      border: '1px solid var(--success-border)',
                      marginBottom: '16px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                          <div style={{ fontWeight: 800, color: 'var(--success)', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <UserCheck size={17} /> Approved for Handover — Awaiting Physical Return
                          </div>
                          <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                            Note: Approving the claim does not mark the item as returned until you physically hand it over on campus.
                          </p>
                        </div>

                        {!handoverConfirming[claim.id] && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setHandoverConfirming(prev => ({ ...prev, [claim.id]: true }))}
                            style={{ padding: '9px 16px', fontSize: '0.84rem' }}
                          >
                            <CheckCircle2 size={15} /> Confirm Physical Handover
                          </button>
                        )}
                      </div>

                      {handoverConfirming[claim.id] && (
                        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--success-border)' }}>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>
                            Handover Verification Notes (Where did you meet / how was identity verified?) *
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="e.g., Handed over at Central Library reception after checking student ID card"
                            value={handoverNotes[claim.id] || ''}
                            onChange={e => setHandoverNotes(prev => ({ ...prev, [claim.id]: e.target.value }))}
                            style={{ marginBottom: '10px', backgroundColor: 'white' }}
                          />
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => setHandoverConfirming(prev => ({ ...prev, [claim.id]: false }))}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={handoverBusy[claim.id]}
                              onClick={() => handleExecuteHandover(claim)}
                            >
                              <Check size={15} />
                              <span>{handoverBusy[claim.id] ? 'Confirming...' : 'Finalize Handover & Mark Item Reunited'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Finder Review Action Buttons (with mandatory confirmation step) */}
                  {!isTerminal && claim.status !== 'approved_for_handover' && (
                    <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                          Finder Verification Decision:
                        </span>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={claim.requiresAdminReview && claim.status === 'administrator_review_required'}
                            title={
                              claim.requiresAdminReview && claim.status === 'administrator_review_required'
                                ? 'Mandatory Administrator Review required before approval'
                                : 'Approve claim for physical handover'
                            }
                            onClick={() =>
                              setDecisionAction(prev => ({ ...prev, [claim.id]: 'approved' }))
                            }
                            style={{
                              padding: '7px 14px',
                              fontSize: '0.82rem',
                              opacity: claim.requiresAdminReview && claim.status === 'administrator_review_required' ? 0.5 : 1
                            }}
                          >
                            <CheckCircle2 size={14} /> Approve for Handover
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() =>
                              setDecisionAction(prev => ({ ...prev, [claim.id]: 'request_evidence' }))
                            }
                            style={{ padding: '7px 14px', fontSize: '0.82rem' }}
                          >
                            <Clock size={14} /> Request Additional Proof
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() =>
                              setDecisionAction(prev => ({ ...prev, [claim.id]: 'escalated' }))
                            }
                            style={{ padding: '7px 14px', fontSize: '0.82rem', color: 'var(--amber)' }}
                          >
                            <ShieldAlert size={14} /> Escalate to Admin
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() =>
                              setDecisionAction(prev => ({ ...prev, [claim.id]: 'rejected' }))
                            }
                            style={{ padding: '7px 14px', fontSize: '0.82rem', color: 'var(--danger)' }}
                          >
                            <XCircle size={14} /> Reject Claim
                          </button>
                        </div>
                      </div>

                      {/* Confirmation Box before submitting decision */}
                      {currentDecision && (
                        <div style={{
                          marginTop: '14px',
                          padding: '16px',
                          borderRadius: '10px',
                          backgroundColor: 'var(--bg-subtle)',
                          border: '1px solid var(--border-strong)'
                        }}>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)', marginBottom: '8px' }}>
                            {currentDecision === 'approved' && 'Confirm Approval for Handover'}
                            {currentDecision === 'request_evidence' && 'Request Additional Supporting Proof'}
                            {currentDecision === 'escalated' && 'Escalate Claim to Campus Administrator'}
                            {currentDecision === 'rejected' && 'Confirm Claim Rejection'}
                          </div>

                          <textarea
                            className="form-textarea"
                            rows={2}
                            placeholder={
                              currentDecision === 'approved'
                                ? 'Enter handover coordination instructions or verification note (at least 4 chars)...'
                                : currentDecision === 'request_evidence'
                                ? 'Specify what additional proof the claimant should upload (required)...'
                                : currentDecision === 'escalated'
                                ? 'Explain why this claim requires administrator intervention (required)...'
                                : 'Provide a clear reason for rejecting this claim (required)...'
                            }
                            value={decisionNotes[claim.id] || ''}
                            onChange={e => setDecisionNotes(prev => ({ ...prev, [claim.id]: e.target.value }))}
                            style={{ marginBottom: '10px', fontSize: '0.85rem' }}
                          />

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => setDecisionAction(prev => ({ ...prev, [claim.id]: null }))}
                              style={{ fontSize: '0.82rem' }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={decisionBusy[claim.id]}
                              onClick={() => handleExecuteFinderDecision(claim)}
                              style={{
                                fontSize: '0.82rem',
                                backgroundColor: currentDecision === 'rejected' ? 'var(--danger)' : undefined
                              }}
                            >
                              {decisionBusy[claim.id] ? 'Saving Decision...' : 'Confirm Decision'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: MY SUBMITTED OWNERSHIP CLAIMS */}
      {activeTab === 'my_claims' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {mySubmittedClaims.length === 0 ? (
            <div className="card" style={{ padding: '56px 24px', textAlign: 'center' }}>
              <Lock size={40} color="var(--text-muted)" style={{ margin: '0 auto 14px' }} />
              <h3 className="serif-accent" style={{ fontSize: '1.3rem', marginBottom: '6px' }}>
                You haven’t submitted any ownership claims yet
              </h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: '460px', margin: '0 auto 20px' }}>
                Found your lost belonging in the Browse Directory? Open the item details and click “Claim This Item” to verify ownership.
              </p>
              <button className="btn btn-primary" onClick={() => navigate('/browse')}>
                Browse Found Items
              </button>
            </div>
          ) : (
            mySubmittedClaims.map(claim => {
              const statusStyle = STATUS_META[claim.status] || STATUS_META.submitted;
              return (
                <div key={claim.id} className="card" style={{ padding: '22px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                      {claim.itemImageUrl && (
                        <img
                          src={claim.itemImageUrl}
                          alt={claim.itemTitle}
                          style={{ width: '58px', height: '58px', borderRadius: '10px', objectFit: 'cover' }}
                        />
                      )}
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                          Submitted {new Date(claim.createdAt).toLocaleString()}
                        </div>
                        <h3 className="serif-accent" style={{ fontSize: '1.2rem', marginBottom: '2px', cursor: 'pointer' }} onClick={() => setSelectedReportId(claim.itemId)}>
                          {claim.itemTitle || `Found Item #${claim.itemId}`}
                        </h3>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          Location: {claim.itemLocation || 'Campus'}
                        </div>
                      </div>
                    </div>

                    <span
                      className="badge"
                      style={{
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.color,
                        border: `1px solid ${statusStyle.border}`,
                        padding: '6px 12px',
                        fontSize: '0.78rem'
                      }}
                    >
                      {statusStyle.label}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    <strong>Your Ownership Statement:</strong> {claim.explanation}
                  </div>

                  {/* Reviewer notes / rejection reason */}
                  {(claim.finderDecision || claim.adminDecision) && (
                    <div style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      backgroundColor: claim.status === 'rejected' ? 'var(--danger-light)' : 'var(--bg-subtle)',
                      border: `1px solid ${claim.status === 'rejected' ? 'var(--danger-border)' : 'var(--border)'}`,
                      marginBottom: '14px',
                      fontSize: '0.85rem'
                    }}>
                      {claim.finderDecision && (
                        <div style={{ color: claim.finderDecision.decision === 'rejected' ? 'var(--danger)' : 'var(--text-main)' }}>
                          <strong>Finder Review ({claim.finderDecision.decision}):</strong> {claim.finderDecision.reason}
                        </div>
                      )}
                      {claim.adminDecision && (
                        <div style={{ color: claim.adminDecision.decision === 'rejected' ? 'var(--danger)' : 'var(--text-main)', marginTop: '4px' }}>
                          <strong>Administrator Review ({claim.adminDecision.decision}):</strong> {claim.adminDecision.reason}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Approved for handover banner */}
                  {claim.status === 'approved_for_handover' && (
                    <div style={{
                      padding: '14px 16px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--success-light)',
                      border: '1px solid var(--success-border)',
                      color: 'var(--success)',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      marginBottom: '12px'
                    }}>
                      🎉 Your ownership claim has been approved for handover! Coordinate with the finder or campus desk to pick up your item. Once handed over physically, the finder or administrator will mark the handover complete.
                    </div>
                  )}

                  {/* Additional evidence upload form when requested */}
                  {claim.status === 'additional_evidence_required' && (
                    <div style={{
                      padding: '16px',
                      borderRadius: '12px',
                      backgroundColor: 'var(--warning-light)',
                      border: '1px solid var(--amber-border)',
                      marginTop: '10px'
                    }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)', marginBottom: '6px' }}>
                        Additional Proof Requested — Submit Supporting Evidence
                      </div>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        Provide additional identifying details or attach a photo/receipt to help verify your ownership.
                      </p>

                      {evidenceMessage[claim.id] && (
                        <div style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          marginBottom: '10px',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          backgroundColor: evidenceMessage[claim.id].type === 'error' ? 'var(--danger-light)' : 'var(--success-light)',
                          color: evidenceMessage[claim.id].type === 'error' ? 'var(--danger)' : 'var(--success)'
                        }}>
                          {evidenceMessage[claim.id].text}
                        </div>
                      )}

                      <textarea
                        className="form-textarea"
                        rows={2}
                        placeholder="Describe your additional proof (e.g., serial number, lock screen photo description, purchase invoice date)..."
                        value={evidenceDesc[claim.id] || ''}
                        onChange={e => setEvidenceDesc(prev => ({ ...prev, [claim.id]: e.target.value }))}
                        style={{ backgroundColor: 'white', marginBottom: '10px', fontSize: '0.85rem' }}
                      />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <label className="btn btn-secondary" style={{ cursor: 'pointer', fontSize: '0.8rem', padding: '7px 12px' }}>
                          <Upload size={14} />
                          <span>{evidenceFile[claim.id] ? evidenceFile[claim.id]!.name : 'Attach Supporting Image (Optional)'}</span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            style={{ display: 'none' }}
                            onChange={e => handleEvidenceFilePick(claim.id, e)}
                          />
                        </label>

                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={evidenceBusy[claim.id]}
                          onClick={() => handleUploadSupportingEvidence(claim.id)}
                          style={{ fontSize: '0.82rem', padding: '8px 16px' }}
                        >
                          <Send size={14} />
                          <span>{evidenceBusy[claim.id] ? 'Uploading...' : 'Submit Supporting Proof'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: EXISTING MY REPORTED ITEMS */}
      {activeTab === 'my_items' && (
        <>
          {myReports.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="card"
              style={{ padding: '72px 24px', textAlign: 'center' }}
            >
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: 'var(--bg-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
                color: 'var(--text-muted)'
              }}>
                <FolderOpen size={38} />
              </div>
              <h3 className="serif-accent" style={{ fontSize: '1.35rem', marginBottom: '8px' }}>
                You haven’t posted any items yet
              </h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 24px' }}>
                Lost something on campus or picked up an unattended item? Post it here and let our campus community help out.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button className="btn btn-warm" onClick={() => navigate('/report/lost')}>
                  Report Lost Item
                </button>
                <button className="btn btn-secondary" onClick={() => navigate('/report/found')}>
                  Report Found Item
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="grid grid-cols-3">
              {myReports.map(report => (
                <div key={report.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <ItemCard item={report} />
                  </div>

                  {/* Action Bar below each of your cards */}
                  <div className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', backgroundColor: 'var(--bg-subtle)' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setSelectedReportId(report.id)}
                      style={{ padding: '6px 10px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}
                    >
                      <Eye size={14} />
                      <span>Details &amp; Clues ({report.comments?.length || 0})</span>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {report.status !== 'resolved' && report.type === 'lost' && (
                        <button
                          type="button"
                          onClick={() => updateReportStatus(report.id, 'resolved')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '6px 12px',
                            borderRadius: '999px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            backgroundColor: 'var(--success-light)',
                            color: 'var(--success)',
                            border: '1px solid var(--success-border)'
                          }}
                        >
                          <CheckCircle2 size={13} /> Mark Reunited
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteReport(report.id)}
                        title="Delete report"
                        style={{
                          padding: '6px 8px',
                          borderRadius: '8px',
                          color: 'var(--text-muted)'
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Private Supporting Evidence Lightbox Modal */}
      <AnimatePresence>
        {previewEvidence && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewEvidence(null)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.72)',
              zIndex: 1100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px'
            }}
          >
            <div
              className="card"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '580px', width: '100%', padding: '24px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 className="serif-accent" style={{ fontSize: '1.15rem', margin: 0 }}>
                  Private Supporting Evidence: {previewEvidence.fileName}
                </h3>
                <button className="btn btn-ghost" onClick={() => setPreviewEvidence(null)}>
                  Close
                </button>
              </div>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                {previewEvidence.description}
              </p>
              {previewEvidence.dataUrl.startsWith('data:image/') ? (
                <img
                  src={previewEvidence.dataUrl}
                  alt={previewEvidence.fileName}
                  style={{ width: '100%', maxHeight: '380px', objectFit: 'contain', borderRadius: '10px', border: '1px solid var(--border)' }}
                />
              ) : (
                <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: 'var(--bg-subtle)', fontSize: '0.86rem', wordBreak: 'break-all' }}>
                  Attachment loaded securely ({previewEvidence.fileName}).
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
