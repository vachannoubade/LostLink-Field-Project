import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import {
  User as UserIcon, Mail, Lock, Eye, EyeOff, ArrowLeft,
  UserPlus, AlertCircle, CheckCircle2, Loader2, HeartHandshake
} from 'lucide-react';
import { motion } from 'framer-motion';

export const SignUp: React.FC = () => {
  const { signup } = useAuth();
  const { showToast } = useData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get('redirect') || '/';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasMinLength = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumberOrSymbol = /[0-9!@#$%^&*(),.?":{}|<>_\-+=]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const validateForm = (): string | null => {
    if (fullName.trim().length < 2) {
      return 'Please enter your full name (at least 2 characters).';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'Please enter a valid email address.';
    }
    if (!hasMinLength) {
      return 'Password must be at least 8 characters long.';
    }
    if (!hasLetter || !hasNumberOrSymbol) {
      return 'Password must contain at least one letter and one number or special character.';
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match. Please confirm your password.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const result = await signup(fullName, email, password);
      if (result.error) {
        setError(result.error);
      } else if (result.needsEmailVerification) {
        setNeedsVerification(true);
        setSuccessMessage('Account created! Please check your email inbox to verify your address before logging in.');
      } else {
        setSuccessMessage('Account created successfully! Redirecting you to the Campus Hub...');
        showToast('🎉 Welcome to LostLink! +100 Starting Kindness Karma awarded.');
        setTimeout(() => {
          navigate(redirectParam, { replace: true });
        }, 900);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (needsVerification) {
    return (
      <div style={{ maxWidth: '480px', margin: '24px auto 48px' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card"
          style={{ padding: '40px 32px', textAlign: 'center' }}
        >
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            backgroundColor: 'var(--success-light)',
            color: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px'
          }}>
            <Mail size={36} />
          </div>
          <h2 className="serif-accent" style={{ fontSize: '1.65rem', marginBottom: '10px' }}>
            Verify your email address
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '24px' }}>
            We’ve sent a verification link to <strong>{email}</strong>. Click the link in your email to activate your LostLink account.
          </p>
          <Link to="/login" className="btn btn-primary" style={{ width: '100%' }}>
            Proceed to Login
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '12px auto 48px' }}>
      {/* Return to Home Link */}
      <div style={{ marginBottom: '20px' }}>
        <Link
          to="/"
          className="btn btn-ghost"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '0.88rem', fontWeight: 600 }}
        >
          <ArrowLeft size={16} />
          <span>Return to Home Page</span>
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
        style={{ padding: '36px 32px', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg)' }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '26px' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-warm) 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 8px 20px var(--primary-glow)'
          }}>
            <HeartHandshake size={28} />
          </div>
          <h1 className="serif-accent" style={{ fontSize: '1.75rem', marginBottom: '6px', color: 'var(--text-main)' }}>
            Join the Campus Network
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            Create your LostLink account to report items, share sightings, and earn Kindness Karma.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            aria-live="assertive"
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
              alignItems: 'flex-start',
              gap: '10px'
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div
            role="status"
            aria-live="polite"
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              backgroundColor: 'var(--success-light)',
              border: '1px solid var(--success-border)',
              color: 'var(--success)',
              fontSize: '0.86rem',
              fontWeight: 600,
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Full Name */}
          <div className="form-group">
            <label htmlFor="signup-name" className="form-label">
              Full Name
            </label>
            <div style={{ position: 'relative' }}>
              <UserIcon size={18} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
              <input
                id="signup-name"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                className="form-control"
                style={{ paddingLeft: '42px' }}
                placeholder="e.g., Priya Sharma"
                value={fullName}
                onChange={e => {
                  setFullName(e.target.value);
                  if (error) setError(null);
                }}
              />
            </div>
          </div>

          {/* Email */}
          <div className="form-group">
            <label htmlFor="signup-email" className="form-label">
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
              <input
                id="signup-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="form-control"
                style={{ paddingLeft: '42px' }}
                placeholder="you@campus.edu"
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="signup-password" className="form-label">
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
              <input
                id="signup-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                className="form-control"
                style={{ paddingLeft: '42px', paddingRight: '44px' }}
                placeholder="Create a strong password"
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '12px',
                  padding: '4px',
                  color: 'var(--text-muted)'
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Password strength indicators */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '8px', fontSize: '0.76rem' }}>
              <span style={{ color: hasMinLength ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                {hasMinLength ? '✓' : '○'} 8+ characters
              </span>
              <span style={{ color: hasLetter ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                {hasLetter ? '✓' : '○'} Contains a letter
              </span>
              <span style={{ color: hasNumberOrSymbol ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                {hasNumberOrSymbol ? '✓' : '○'} Number or symbol
              </span>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="form-group">
            <label htmlFor="signup-confirm-password" className="form-label">
              Confirm Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
              <input
                id="signup-confirm-password"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                className="form-control"
                style={{ paddingLeft: '42px', paddingRight: '44px' }}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={e => {
                  setConfirmPassword(e.target.value);
                  if (error) setError(null);
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(prev => !prev)}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '12px',
                  padding: '4px',
                  color: 'var(--text-muted)'
                }}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {confirmPassword.length > 0 && (
              <div style={{ marginTop: '6px', fontSize: '0.76rem', fontWeight: 600, color: passwordsMatch ? 'var(--success)' : 'var(--danger)' }}>
                {passwordsMatch ? '✓ Passwords match' : '✕ Passwords do not match yet'}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '0.98rem',
              marginTop: '8px',
              opacity: submitting ? 0.75 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer'
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <UserPlus size={18} />
                <span>Sign Up</span>
              </>
            )}
          </button>
        </form>

        {/* Login Link */}
        <div style={{
          marginTop: '24px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
          fontSize: '0.92rem',
          color: 'var(--text-secondary)'
        }}>
          Already have an account?{' '}
          <Link
            to={redirectParam !== '/' ? `/login?redirect=${encodeURIComponent(redirectParam)}` : '/login'}
            style={{ color: 'var(--primary)', fontWeight: 700 }}
          >
            Login
          </Link>
        </div>
      </motion.div>
    </div>
  );
};
