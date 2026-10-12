import React, { useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { useData } from '../store/DataContext';
import {
  Mail, Lock, Eye, EyeOff, ArrowLeft, LogIn,
  AlertCircle, Sparkles, ShieldCheck, Loader2
} from 'lucide-react';
import { motion } from 'framer-motion';

export const Login: React.FC = () => {
  const { login, authProvider } = useAuth();
  const { showToast } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const redirectParam = searchParams.get('redirect') || (location.state as any)?.from || '/';
  const redirectMessage = (location.state as any)?.message as string | undefined;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validateForm = (): string | null => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return 'Please enter your email address.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return 'Please enter a valid email address (e.g., name@campus.edu).';
    }
    if (!password) {
      return 'Please enter your password.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.error) {
        setError(result.error);
      } else {
        showToast('👋 Welcome back to LostLink Campus Hub!');
        navigate(redirectParam, { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemoAccount = () => {
    setEmail('vivek.sharma@campus.edu');
    setPassword('LostLink@2026');
    setError(null);
  };

  return (
    <div style={{ maxWidth: '480px', margin: '12px auto 48px' }}>
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
        {/* Branding Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
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
            <ShieldCheck size={28} />
          </div>
          <h1 className="serif-accent" style={{ fontSize: '1.75rem', marginBottom: '6px', color: 'var(--text-main)' }}>
            Welcome back
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            Sign in to your LostLink campus account to report items and verify matches.
          </p>
        </div>

        {/* Redirect Notice */}
        {redirectMessage && !error && (
          <div
            role="status"
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              backgroundColor: 'var(--amber-light)',
              border: '1px solid var(--amber-border)',
              color: 'var(--text-main)',
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <Sparkles size={16} color="var(--amber)" style={{ flexShrink: 0 }} />
            <span>{redirectMessage}</span>
          </div>
        )}

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

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="login-email" className="form-label">
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
              <input
                id="login-email"
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

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label htmlFor="login-password" className="form-label" style={{ marginBottom: 0 }}>
                Password
              </label>
              <Link
                to="/forgot-password"
                style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary)' }}
              >
                Forgot password?
              </Link>
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--text-muted)' }} />
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                className="form-control"
                style={{ paddingLeft: '42px', paddingRight: '44px' }}
                placeholder="Enter your password"
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
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <LogIn size={18} />
                <span>Login to LostLink</span>
              </>
            )}
          </button>
        </form>

        {/* Demo Credentials Quick-Fill */}
        <div style={{
          marginTop: '20px',
          padding: '12px 14px',
          borderRadius: '12px',
          backgroundColor: 'var(--bg-subtle)',
          border: '1px dashed var(--border-strong)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          fontSize: '0.8rem'
        }}>
          <div style={{ color: 'var(--text-secondary)' }}>
            <strong>Demo Student:</strong> vivek.sharma@campus.edu
          </div>
          <button
            type="button"
            onClick={fillDemoAccount}
            style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.8rem' }}
          >
            Auto-fill Demo →
          </button>
        </div>

        {/* Sign Up Link */}
        <div style={{
          marginTop: '24px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border)',
          textAlign: 'center',
          fontSize: '0.92rem',
          color: 'var(--text-secondary)'
        }}>
          Don’t have an account?{' '}
          <Link
            to={redirectParam !== '/' ? `/signup?redirect=${encodeURIComponent(redirectParam)}` : '/signup'}
            style={{ color: 'var(--primary)', fontWeight: 700 }}
          >
            Sign Up
          </Link>
        </div>

        <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
          Secured via {authProvider === 'supabase' ? 'Supabase Auth (JWT)' : 'LostLink Cryptographic Auth API (scrypt + HMAC-SHA256)'}
        </div>
      </motion.div>
    </div>
  );
};
