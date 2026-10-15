import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, X, Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { verifyOwnershipClaim, validatePin, validateClue } from '../lib/verification';

export interface OwnershipVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string;
  reportTitle: string;
  onSuccess?: () => void;
}

export const OwnershipVerifyModal: React.FC<OwnershipVerifyModalProps> = ({
  isOpen,
  onClose,
  reportId,
  reportTitle,
  onSuccess
}) => {
  const [clue, setClue] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const handleClose = useCallback(() => {
    if (!loading) {
      setClue('');
      setPin('');
      setShowPin(false);
      setErrorMessage(null);
      setRemainingAttempts(null);
      setIsLocked(false);
      setIsVerified(false);
      onClose();
    }
  }, [loading, onClose]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, handleClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || isVerified || isLocked) return;

    setErrorMessage(null);

    const clueVal = validateClue(clue);
    if (!clueVal.valid) {
      setErrorMessage(clueVal.error || 'Please provide a valid ownership clue.');
      return;
    }

    const pinVal = validatePin(pin);
    if (!pinVal.valid) {
      setErrorMessage(pinVal.error || 'Please provide a 6-digit numeric PIN.');
      return;
    }

    setLoading(true);

    try {
      const result = await verifyOwnershipClaim(reportId, clue, pin);

      if (result.locked) {
        setIsLocked(true);
        setErrorMessage(result.message || 'Maximum verification attempts exceeded. Please try again in 15 minutes.');
      } else if (result.verified) {
        setIsVerified(true);
        if (onSuccess) onSuccess();
      } else {
        setErrorMessage(result.message || 'Verification failed. The submitted details did not match.');
        if (result.remainingAttempts !== undefined) {
          setRemainingAttempts(result.remainingAttempts);
        }
      }
    } catch {
      setErrorMessage('An unexpected error occurred during verification. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="ownership-modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ownership-verify-title"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.55)',
              backdropFilter: 'blur(5px)',
              WebkitBackdropFilter: 'blur(5px)'
            }}
          />

          {/* Modal Content Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 14 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="ownership-modal-card"
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '520px',
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-lg)',
              padding: '30px',
              zIndex: 1
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top header row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    backgroundColor: isVerified ? 'var(--success-light)' : 'rgba(24, 90, 219, 0.1)',
                    color: isVerified ? 'var(--success)' : 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {isVerified ? <CheckCircle2 size={24} /> : <ShieldCheck size={24} />}
                </div>
                <div>
                  <h2
                    id="ownership-verify-title"
                    style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-main)', letterSpacing: '-0.015em' }}
                  >
                    {isVerified ? 'Ownership Verified' : 'Verify Item Ownership'}
                  </h2>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    TARGET DOCKET: {reportTitle.length > 28 ? `${reportTitle.slice(0, 28)}...` : reportTitle}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="btn btn-ghost"
                style={{ padding: '6px', color: 'var(--text-muted)' }}
                aria-label="Close verification dialog"
                disabled={loading}
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            {isVerified ? (
              <div style={{ textAlign: 'center', padding: '12px 0 16px' }}>
                <div style={{
                  padding: '16px 20px',
                  backgroundColor: 'var(--success-light)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--success)',
                  marginBottom: '20px',
                  lineHeight: 1.55,
                  fontSize: '0.94rem'
                }}>
                  <strong>Verification confirmed!</strong> The private clue and PIN successfully matched the genuine owner's confidential records.
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '24px' }}>
                  A verification confirmation has been sent to the report creator. You may proceed with arranging a secure campus handover.
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.55, marginBottom: '20px' }}>
                  The owner has protected this report with private verification details. Enter the matching clue and 6-digit secret PIN to verify genuine ownership.
                </p>

                {/* Error Banner */}
                {errorMessage && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '12px 16px',
                      backgroundColor: isLocked ? 'var(--danger-light)' : '#FEF3C7',
                      color: isLocked ? 'var(--danger)' : '#92400E',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.86rem',
                      lineHeight: 1.5,
                      marginBottom: '18px',
                      border: `1px solid ${isLocked ? 'rgba(239, 68, 68, 0.2)' : '#FDE68A'}`
                    }}
                  >
                    <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div>{errorMessage}</div>
                      {remainingAttempts !== null && remainingAttempts > 0 && !isLocked && (
                        <div style={{ fontSize: '0.78rem', marginTop: '4px', fontWeight: 600 }}>
                          {remainingAttempts} attempt{remainingAttempts > 1 ? 's' : ''} remaining before temporary lockout.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Proposed Clue Field */}
                <div style={{ marginBottom: '18px' }}>
                  <label className="form-label" htmlFor="claimClue" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Private Ownership Clue *</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Non-public distinguishing feature</span>
                  </label>
                  <textarea
                    id="claimClue"
                    required
                    rows={3}
                    className="form-control"
                    placeholder="Enter the specific distinguishing feature or mark provided by the owner..."
                    value={clue}
                    onChange={(e) => {
                      setClue(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    disabled={loading || isLocked}
                  />
                </div>

                {/* Secret PIN Field */}
                <div style={{ marginBottom: '24px' }}>
                  <label className="form-label" htmlFor="claimPin" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Secret PIN *</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>6 numeric digits</span>
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      id="claimPin"
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      required
                      className="form-control"
                      placeholder="e.g. 582194"
                      value={pin}
                      onChange={(e) => {
                        const numericOnly = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setPin(numericOnly);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      disabled={loading || isLocked}
                      style={{ 
                        paddingRight: '44px',
                        letterSpacing: showPin ? 'normal' : '0.2em',
                        fontSize: showPin ? '0.95rem' : '1.1rem',
                        fontFamily: showPin ? 'inherit' : 'var(--font-mono)'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      disabled={loading || isLocked}
                    >
                      {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Lock size={12} /> Verification is rate-limited to 5 attempts to protect owner security.
                  </div>
                </div>

                {/* Form Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="btn btn-secondary"
                    disabled={loading}
                    style={{ minWidth: '90px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading || isLocked || !clue.trim() || pin.length !== 6}
                    style={{ minWidth: '150px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={16} />
                        Verify Ownership
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
