import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { Mail, ArrowLeft, KeyRound, AlertCircle, CheckCircle2, Loader2, ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';

export const ForgotPassword: React.FC = () => {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setResetUrl(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await requestPasswordReset(email);
      if (res.error) {
        setError(res.error);
      } else {
        setMessage(res.message || 'Password recovery instructions have been sent.');
        if (res.resetUrl) {
          setResetUrl(res.resetUrl);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '12px auto 48px' }}>
      <div style={{ marginBottom: '20px' }}>
        <Link
          to="/login"
          className="btn btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '0.88rem', fontWeight: 600 }}
        >
          <ArrowLeft size={16} />
          <span>Back to Login</span>
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
        style={{ padding: '36px 32px', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg)' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '26px' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            backgroundColor: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px'
          }}>
            <KeyRound size={28} />
          </div>
          <h1 className="serif-accent" style={{ fontSize: '1.65rem', marginBottom: '6px' }}>
            Reset your password
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            Enter your registered campus email address and we’ll help you recover your account.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              backgroundColor: 'var(--danger-light)',
              border: '1px solid var(--danger-border)',
              color: 'var(--danger)',
              fontSize: '0.86rem',
              fontWeight: 600,
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div
            role="status"
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              backgroundColor: 'var(--success-light)',
              border: '1px solid var(--success-border)',
              color: 'var(--success)',
              fontSize: '0.88rem',
              fontWeight: 600,
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} />
              <span>{message}</span>
            </div>
            {resetUrl && (
              <Link
                to={resetUrl}
                className="btn btn-primary"
                style={{ padding: '10px 14px', fontSize: '0.85rem', alignSelf: 'flex-start' }}
              >
                <span>Open Direct Password Reset Link</span>
                <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="forgot-email" className="form-label">
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
              <input
                id="forgot-email"
                type="email"
                required
                className="form-control"
                style={{ paddingLeft: '42px' }}
                placeholder="you@campus.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '0.96rem' }}
          >
            {submitting ? (
              <>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Sending Recovery Link...</span>
              </>
            ) : (
              <span>Send Recovery Link</span>
            )}
          </button>
        </form>

        <div style={{ marginTop: '22px', textAlign: 'center', fontSize: '0.88rem' }}>
          <Link to="/" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
            Return to Home Page
          </Link>
        </div>
      </motion.div>
    </div>
  );
};
