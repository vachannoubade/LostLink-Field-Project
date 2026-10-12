import React, { useEffect, useState, useCallback } from 'react';
import { useData } from '../store/DataContext';
import { useAuth } from '../store/AuthContext';
import type { AuditLogEntry, ClaimRecord, ClaimStatus } from '../types';
import {
  RotateCcw,
  AlertTriangle,
  Eye,
  ShieldAlert,
  ShieldCheck,
  Lock,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  History,
  RefreshCw,
  UserCheck,
  Sparkles,
  ArrowUpRight
} from 'lucide-react';

const STATUS_BADGE: Record<ClaimStatus, { label: string; bg: string; color: string }> = {
  submitted: { label: 'Submitted', bg: 'var(--bg-subtle)', color: 'var(--text-secondary)' },
  verification_pending: { label: 'Verification Pending', bg: 'var(--primary-light)', color: 'var(--primary)' },
  additional_evidence_required: { label: 'Additional Evidence Required', bg: 'var(--warning-light)', color: 'var(--amber)' },
  finder_review_required: { label: 'Finder Review Required', bg: 'var(--primary-light)', color: 'var(--primary)' },
  administrator_review_required: { label: 'Administrator Review Required', bg: 'var(--warning-light)', color: 'var(--amber)' },
  approved_for_handover: { label: 'Approved for Handover', bg: 'var(--success-light)', color: 'var(--success)' },
  rejected: { label: 'Rejected', bg: 'var(--danger-light)', color: 'var(--danger)' },
  handed_over: { label: 'Handed Over', bg: 'var(--success-light)', color: 'var(--success)' }
};

type AdminDecisionType = 'approved' | 'rejected' | 'request_evidence' | 'returned_to_finder';

export const Admin: React.FC = () => {
  const {
    reports,
    reunionStories,
    resetDemoData,
    setSelectedReportId,
    user,
    fetchAdminReviewQueue,
    submitAdminClaimDecision,
    confirmPhysicalHandover
  } = useData();
  const { isAuthenticated } = useAuth();

  const [adminClaims, setAdminClaims] = useState<ClaimRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'escalated' | 'all_claims' | 'audit_logs' | 'directory'>('escalated');

  // Admin decision state per claim
  const [pendingAction, setPendingAction] = useState<Record<string, AdminDecisionType | null>>({});
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [decisionBusy, setDecisionBusy] = useState<Record<string, boolean>>({});
  const [decisionFeedback, setDecisionFeedback] = useState<Record<string, { type: 'error' | 'success'; text: string }>>({});

  // Separate physical handover confirmation state
  const [handoverNotes, setHandoverNotes] = useState<Record<string, string>>({});
  const [handoverBusy, setHandoverBusy] = useState<Record<string, boolean>>({});

  const loadAdminData = useCallback(async () => {
    setLoadingQueue(true);
    setAuthError(null);
    const res = await fetchAdminReviewQueue();
    setLoadingQueue(false);
    if (!res.ok) {
      setAuthError(res.error || 'Administrator authorization required.');
      setAdminClaims([]);
      setAuditLogs([]);
      return;
    }
    setAdminClaims(res.claims);
    setAuditLogs(res.auditLogs);
  }, [fetchAdminReviewQueue]);

  useEffect(() => {
    if (isAuthenticated && user.isAdmin) {
      void loadAdminData();
    }
  }, [isAuthenticated, user.id, user.isAdmin, loadAdminData]);

  const escalatedClaims = adminClaims.filter(
    c =>
      c.status === 'administrator_review_required' ||
      c.requiresAdminReview ||
      (c.riskFlags && c.riskFlags.length > 0)
  );

  const displayedClaims = activeSection === 'escalated' ? escalatedClaims : adminClaims;

  const handleConfirmAdminDecision = async (claim: ClaimRecord) => {
    const action = pendingAction[claim.id];
    if (!action) return;
    const notes = (decisionNotes[claim.id] || '').trim();

    if (notes.length < 5) {
      setDecisionFeedback(prev => ({
        ...prev,
        [claim.id]: {
          type: 'error',
          text: 'Administrator review note / reason is required (at least 5 characters) for the audit trail.'
        }
      }));
      return;
    }

    setDecisionBusy(prev => ({ ...prev, [claim.id]: true }));
    const res = await submitAdminClaimDecision(claim.id, action, notes);
    setDecisionBusy(prev => ({ ...prev, [claim.id]: false }));

    if (!res.ok) {
      setDecisionFeedback(prev => ({
        ...prev,
        [claim.id]: { type: 'error', text: res.error || 'Failed to save administrator decision.' }
      }));
      return;
    }

    setPendingAction(prev => ({ ...prev, [claim.id]: null }));
    setDecisionNotes(prev => ({ ...prev, [claim.id]: '' }));
    setDecisionFeedback(prev => ({
      ...prev,
      [claim.id]: {
        type: 'success',
        text: res.message || `Administrator decision (${action.replace(/_/g, ' ')}) recorded in audit log.`
      }
    }));
    await loadAdminData();
  };

  const handleAdminHandover = async (claim: ClaimRecord) => {
    const notes = (handoverNotes[claim.id] || '').trim();
    if (notes.length < 4) {
      setDecisionFeedback(prev => ({
        ...prev,
        [claim.id]: {
          type: 'error',
          text: 'Please enter physical handover verification notes (at least 4 characters).'
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
        [claim.id]: { type: 'error', text: res.error || 'Could not confirm handover.' }
      }));
      return;
    }

    setDecisionFeedback(prev => ({
      ...prev,
      [claim.id]: {
        type: 'success',
        text: 'Physical handover completed! Item marked as Reunited.'
      }
    }));
    await loadAdminData();
  };

  return (
    <div style={{ paddingBottom: '44px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <h1 className="page-title serif-accent" style={{ marginBottom: 0 }}>
              Administrator Verification &amp; System Controls
            </h1>
            {user.isAdmin ? (
              <span className="badge" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 800 }}>
                <ShieldCheck size={13} /> Verified Campus Admin
              </span>
            ) : (
              <span className="badge" style={{ backgroundColor: 'var(--warning-light)', color: 'var(--amber)' }}>
                Standard Account View
              </span>
            )}
          </div>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Adjudicate escalated ownership claims, high-value disputes, competing claims, and inspect the immutable security audit trail.
          </p>
        </div>

        {user.isAdmin && (
          <button className="btn btn-secondary" onClick={loadAdminData} disabled={loadingQueue}>
            <RefreshCw size={16} />
            <span>{loadingQueue ? 'Refreshing...' : 'Refresh Admin Queue'}</span>
          </button>
        )}
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-3" style={{ marginBottom: '28px', marginTop: '20px' }}>
        <div className="card" style={{ padding: '22px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>
            Total Campus Reports
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-main)' }}>{reports.length}</div>
        </div>
        <div className="card" style={{ padding: '22px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>
            Escalated / High-Risk Claims
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--amber)' }}>
            {user.isAdmin ? escalatedClaims.length : '—'}
          </div>
        </div>
        <div className="card" style={{ padding: '22px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>
            Campus Reunions Celebrated
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--success)' }}>
            {reports.filter(r => r.status === 'resolved').length + reunionStories.length}
          </div>
        </div>
      </div>

      {/* Strict Backend Admin Authorization Gate */}
      {(!isAuthenticated || !user.isAdmin || authError) ? (
        <div className="card" style={{ padding: '28px', marginBottom: '32px', border: '1px solid var(--danger-border)', backgroundColor: 'var(--danger-light)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <ShieldAlert size={28} color="var(--danger)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <h3 className="serif-accent" style={{ fontSize: '1.2rem', color: 'var(--danger)', marginBottom: '6px' }}>
                Restricted Administrator Review Queue (403 Protected)
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.55, marginBottom: '8px' }}>
                {authError ||
                  'Access to escalated ownership claims, private verification secrets, and security audit logs is strictly enforced on the backend server.'}
              </p>
              <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: 0 }}>
                Sign in with an authorized campus administrator account (e.g., <code>vivek.sharma@campus.edu</code>) to adjudicate disputed or high-value claims.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Admin Navigation Pills */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveSection('escalated')}
              className={activeSection === 'escalated' ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ borderRadius: '999px', padding: '8px 16px', fontSize: '0.86rem' }}
            >
              <ShieldAlert size={15} />
              <span>Escalated Review Queue ({escalatedClaims.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('all_claims')}
              className={activeSection === 'all_claims' ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ borderRadius: '999px', padding: '8px 16px', fontSize: '0.86rem' }}
            >
              <Lock size={15} />
              <span>All Claims ({adminClaims.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('audit_logs')}
              className={activeSection === 'audit_logs' ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ borderRadius: '999px', padding: '8px 16px', fontSize: '0.86rem' }}
            >
              <History size={15} />
              <span>Security Audit Logs ({auditLogs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('directory')}
              className={activeSection === 'directory' ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ borderRadius: '999px', padding: '8px 16px', fontSize: '0.86rem' }}
            >
              <FileText size={15} />
              <span>Campus Reports Directory ({reports.length})</span>
            </button>
          </div>

          {/* SECTION 1 & 2: ESCALATED OR ALL CLAIMS */}
          {(activeSection === 'escalated' || activeSection === 'all_claims') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '32px' }}>
              {displayedClaims.length === 0 ? (
                <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <ShieldCheck size={36} color="var(--success)" style={{ margin: '0 auto 12px' }} />
                  <h3 className="serif-accent" style={{ fontSize: '1.25rem', marginBottom: '6px' }}>
                    No claims currently waiting in this queue
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '460px', margin: '0 auto' }}>
                    High-value items, competing claims, repeated failed attempts, and finder-escalated disputes automatically route here.
                  </p>
                </div>
              ) : (
                displayedClaims.map(claim => {
                  const badge = STATUS_BADGE[claim.status] || STATUS_BADGE.submitted;
                  const currentAction = pendingAction[claim.id] || null;
                  const isTerminal = claim.status === 'handed_over' || claim.status === 'rejected';

                  return (
                    <div key={claim.id} className="card" style={{ padding: '24px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap', paddingBottom: '14px', borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>
                              Claim #{claim.id.slice(-6)}
                            </span>
                            <span style={{ color: 'var(--border-strong)' }}>•</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Finder ID: {claim.finderId}
                            </span>
                            {typeof claim.competingClaimsCount === 'number' && claim.competingClaimsCount > 1 && (
                              <>
                                <span style={{ color: 'var(--border-strong)' }}>•</span>
                                <span className="badge" style={{ backgroundColor: 'var(--warning-light)', color: 'var(--amber)', fontSize: '0.73rem' }}>
                                  {claim.competingClaimsCount} Competing Claims
                                </span>
                              </>
                            )}
                          </div>

                          <h3 className="serif-accent" style={{ fontSize: '1.25rem', marginBottom: '4px', cursor: 'pointer' }} onClick={() => setSelectedReportId(claim.itemId)}>
                            {claim.itemTitle || `Found Item #${claim.itemId}`}{' '}
                            <ArrowUpRight size={15} style={{ display: 'inline', verticalAlign: 'middle' }} />
                          </h3>

                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Claimant: <strong>{claim.claimantName}</strong> ({claim.claimantEmail})
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                          <span className="badge" style={{ backgroundColor: badge.bg, color: badge.color, padding: '6px 12px', fontSize: '0.78rem' }}>
                            {badge.label}
                          </span>
                          {typeof claim.automatedScore === 'number' && (
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Sparkles size={13} color="var(--primary)" /> Similarity Score: {claim.automatedScore}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Escalation banner */}
                      {(claim.requiresAdminReview || claim.escalationReason) && (
                        <div style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          backgroundColor: 'var(--warning-light)',
                          border: '1px solid var(--amber-border)',
                          marginBottom: '16px',
                          fontSize: '0.84rem'
                        }}>
                          <div style={{ fontWeight: 800, color: 'var(--amber)', marginBottom: '2px' }}>
                            Escalation Triggers &amp; Risk Flags:
                          </div>
                          <div style={{ color: 'var(--text-main)' }}>
                            {claim.escalationReason || 'Flagged for administrator review'}
                          </div>
                          {claim.riskFlags && claim.riskFlags.length > 0 && (
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                              Flags: {claim.riskFlags.join(', ')}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Claimant explanation */}
                      <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: 'var(--bg-subtle)', marginBottom: '16px', fontSize: '0.88rem' }}>
                        <div>
                          <strong>Claimant Explanation:</strong> {claim.explanation}
                        </div>
                        {claim.finderDecision && (
                          <div style={{ marginTop: '6px', color: 'var(--primary)' }}>
                            <strong>Finder Review ({claim.finderDecision.decision}):</strong> {claim.finderDecision.reason}
                          </div>
                        )}
                      </div>

                      {/* Side-by-side breakdown */}
                      {claim.comparisonBreakdown && claim.comparisonBreakdown.length > 0 && (
                        <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            Private Verification Prompt Breakdown
                          </div>
                          {claim.comparisonBreakdown.map((b, i) => (
                            <div
                              key={b.promptId || i}
                              style={{
                                padding: '10px 14px',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                gap: '10px',
                                fontSize: '0.84rem'
                              }}
                            >
                              <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 700 }}>
                                  {b.promptLabel}
                                </div>
                                <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
                                  Secret: “{b.secretAnswer}”
                                </div>
                              </div>
                              <div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 700 }}>
                                  Claimant Answer
                                </div>
                                <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                  “{b.claimantAnswer}”
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', fontWeight: 700 }}>
                                {b.similarity}% ({b.matchLevel})
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {decisionFeedback[claim.id] && (
                        <div style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          marginBottom: '12px',
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          backgroundColor: decisionFeedback[claim.id].type === 'error' ? 'var(--danger-light)' : 'var(--success-light)',
                          color: decisionFeedback[claim.id].type === 'error' ? 'var(--danger)' : 'var(--success)'
                        }}>
                          {decisionFeedback[claim.id].text}
                        </div>
                      )}

                      {/* Separate Handover Confirmation for Approved Claims */}
                      {claim.status === 'approved_for_handover' && (
                        <div style={{
                          padding: '14px 16px',
                          borderRadius: '10px',
                          backgroundColor: 'var(--success-light)',
                          border: '1px solid var(--success-border)',
                          marginBottom: '14px'
                        }}>
                          <div style={{ fontWeight: 800, color: 'var(--success)', fontSize: '0.88rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <UserCheck size={16} /> Approved for Handover — Confirm Physical Return
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Enter physical handover verification notes (e.g., Verified ID at Security Desk)..."
                              value={handoverNotes[claim.id] || ''}
                              onChange={e => setHandoverNotes(prev => ({ ...prev, [claim.id]: e.target.value }))}
                              style={{ flex: 1, minWidth: '240px', backgroundColor: 'white' }}
                            />
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={handoverBusy[claim.id]}
                              onClick={() => handleAdminHandover(claim)}
                            >
                              <CheckCircle2 size={15} />
                              <span>{handoverBusy[claim.id] ? 'Confirming...' : 'Confirm Physical Handover'}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Admin Review Actions */}
                      {!isTerminal && claim.status !== 'approved_for_handover' && (
                        <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                              Administrator Adjudication:
                            </span>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '7px 14px', fontSize: '0.82rem' }}
                                onClick={() => setPendingAction(prev => ({ ...prev, [claim.id]: 'approved' }))}
                              >
                                <CheckCircle2 size={14} /> Approve for Handover
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '7px 14px', fontSize: '0.82rem' }}
                                onClick={() => setPendingAction(prev => ({ ...prev, [claim.id]: 'request_evidence' }))}
                              >
                                <Clock size={14} /> Request More Evidence
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '7px 14px', fontSize: '0.82rem' }}
                                onClick={() => setPendingAction(prev => ({ ...prev, [claim.id]: 'returned_to_finder' }))}
                              >
                                Return to Finder
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '7px 14px', fontSize: '0.82rem', color: 'var(--danger)' }}
                                onClick={() => setPendingAction(prev => ({ ...prev, [claim.id]: 'rejected' }))}
                              >
                                <XCircle size={14} /> Reject Claim
                              </button>
                            </div>
                          </div>

                          {currentAction && (
                            <div style={{ marginTop: '12px', padding: '14px', borderRadius: '10px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-strong)' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px' }}>
                                Confirm Administrator Decision: {currentAction.replace(/_/g, ' ').toUpperCase()}
                              </div>
                              <textarea
                                className="form-textarea"
                                rows={2}
                                placeholder="Enter mandatory administrator adjudication notes for the audit log..."
                                value={decisionNotes[claim.id] || ''}
                                onChange={e => setDecisionNotes(prev => ({ ...prev, [claim.id]: e.target.value }))}
                                style={{ marginBottom: '8px', fontSize: '0.84rem' }}
                              />
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  onClick={() => setPendingAction(prev => ({ ...prev, [claim.id]: null }))}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  disabled={decisionBusy[claim.id]}
                                  onClick={() => handleConfirmAdminDecision(claim)}
                                  style={{ backgroundColor: currentAction === 'rejected' ? 'var(--danger)' : undefined }}
                                >
                                  {decisionBusy[claim.id] ? 'Recording...' : 'Confirm & Log Decision'}
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

          {/* SECTION 3: IMMUTABLE AUDIT LOGS */}
          {activeSection === 'audit_logs' && (
            <div className="card" style={{ overflow: 'hidden', marginBottom: '32px' }}>
              <div style={{ padding: '18px 24px', backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-main)' }}>
                Ownership Verification &amp; Handover Audit Trail ({auditLogs.length} events)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '680px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '12px 20px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Timestamp</th>
                      <th style={{ padding: '12px 20px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Event Action</th>
                      <th style={{ padding: '12px 20px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Actor</th>
                      <th style={{ padding: '12px 20px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Target</th>
                      <th style={{ padding: '12px 20px', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Audit Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 20px', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)' }}>
                          {log.action}
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: '0.84rem', color: 'var(--text-main)' }}>
                          {log.actorName} <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>({log.actorRole})</span>
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {log.itemId && <div>Item: {log.itemId}</div>}
                          {log.claimId && <div>Claim: {log.claimId.slice(-8)}</div>}
                        </td>
                        <td style={{ padding: '12px 20px', fontSize: '0.84rem', color: 'var(--text-main)' }}>
                          {log.reason || (log.newStatus ? `Status -> ${log.newStatus}` : 'Logged')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Existing Presentation Reset & Campus Directory */}
      {(activeSection === 'directory' || !user.isAdmin) && (
        <>
          <div className="card" style={{ padding: '24px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', backgroundColor: 'var(--amber-light)', borderColor: 'var(--amber-border)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', maxWidth: '640px' }}>
              <AlertTriangle color="var(--amber)" size={28} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '4px' }}>
                  Restore Initial Presentation State
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  Resetting will restore the curated campus reports, AI matches, and kindness stories—ideal right before a live project demo!
                </p>
              </div>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (window.confirm('Restore all demo data to the initial curated campus state?')) {
                  resetDemoData();
                }
              }}
            >
              <RotateCcw size={17} />
              <span>Reset Demo Data</span>
            </button>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '18px 24px', backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-main)' }}>
              All Campus Reports Directory
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '640px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '14px 24px', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700 }}>Reporter</th>
                    <th style={{ padding: '14px 24px', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700 }}>Type</th>
                    <th style={{ padding: '14px 24px', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700 }}>Item &amp; Location</th>
                    <th style={{ padding: '14px 24px', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700 }}>Status</th>
                    <th style={{ padding: '14px 24px', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(report => (
                    <tr key={report.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '16px 24px', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        {report.reporterName || 'Campus Member'}
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <span className={`badge ${report.type === 'lost' ? 'badge-lost' : 'badge-found'}`}>
                          {report.type}
                        </span>
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)' }}>{report.title}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{report.location}</div>
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <span className={`badge ${report.status === 'resolved' ? 'badge-match' : report.status === 'lost' ? 'badge-lost' : 'badge-found'}`}>
                          {report.status === 'resolved' ? 'reunited' : report.status}
                        </span>
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <button
                          className="btn btn-ghost"
                          onClick={() => setSelectedReportId(report.id)}
                          style={{ padding: '6px 12px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)' }}
                        >
                          <Eye size={14} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
